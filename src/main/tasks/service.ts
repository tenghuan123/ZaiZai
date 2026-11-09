import { randomUUID } from 'node:crypto'
import type { CancelReason, CompletionResult, Occurrence, PlanSlot, RepeatPlan } from '../../shared/tasks'
import { AppError, checkVersion, requireFound } from '../domain/errors'
import type { Clock, ClockSnapshot } from '../domain/time'
import { clockSnapshot, dayStart, dueAt, validDate, validTime } from '../domain/time'
import { candidate } from '../domain/recurrence'
import { boolean, fields, identifier, object, onceFields, planFields, priority, version } from '../domain/validation'
import { ReminderRepository } from '../reminders/repository'
import { TaskRepository } from './repository'
import { TaskQueries } from './queries'

export class TaskService {
  readonly queries: TaskQueries
  private coordinatedDate: string | undefined
  private coordinatedZone: string | undefined
  constructor(readonly repository: TaskRepository, private readonly reminderRecords: ReminderRepository,
    private readonly clock: Clock = clockSnapshot) { this.queries = new TaskQueries(repository) }

  // Entrypoints call this before a read; getDay itself remains a pure database query.
  coordinateDay(clock = this.clock()): boolean {
    if (this.coordinatedDate === clock.today && this.coordinatedZone === clock.timeZone) return false
    this.ensureToday(clock)
    return true
  }
  ensureToday(clock = this.clock()): void {
    this.repository.db.transaction(() => {
      this.reconcileTimeZone(clock)
      this.ensureTodayInTransaction(clock)
    })()
    this.coordinatedDate = clock.today
    this.coordinatedZone = clock.timeZone
  }
  private ensureTodayInTransaction(clock: ClockSnapshot): void {
    for (const plan of this.repository.plans()) this.reconcilePlan(plan, clock)
    this.repository.activate(clock.today, clock.timeZone, clock.nowMs)
  }
  private write<T>(action: (clock: ClockSnapshot) => T): T {
    const clock = this.clock()
    const result = this.repository.db.transaction(() => {
      this.reconcileTimeZone(clock)
      this.ensureTodayInTransaction(clock)
      return action(clock)
    })()
    this.coordinatedDate = clock.today
    this.coordinatedZone = clock.timeZone
    return result
  }
  getDay(date: unknown, clock = this.clock()) { return this.queries.getDay(date, clock) }
  getDailyReport() { return this.queries.getDailyReport(this.clock()) }
  getHistoryDates(input: unknown): string[] {
    const value = object(input); fields(value, ['from', 'to'])
    const from = validDate(value.from), to = validDate(value.to)
    if (from > to) throw new AppError('VALIDATION', '日期范围不正确。')
    return this.repository.historyDates(from, to)
  }
  listPlans(): RepeatPlan[] { return this.repository.plans() }

  createOnce(input: unknown): Occurrence {
    const value = object(input)
    fields(value, ['requestId', 'title', 'scheduledDate', 'scheduledTime', 'reminderEnabled', 'scene', 'priority', 'category'])
    const key = identifier(value.requestId, 'requestId'), data = onceFields(value)
    return this.write(clock => {
      const existing = this.repository.byCreationKey(key)
      if (existing) return existing
      const item: Occurrence = { ...data, id: randomUUID(), creationKey: key, planId: null, slotId: null, planVersion: null,
        sourceDate: data.scheduledDate, sourceTime: data.scheduledTime, sourceZone: clock.timeZone,
        scheduleZone: clock.timeZone, dueAtMs: data.scheduledTime === null ? null : dueAt(data.scheduledDate, data.scheduledTime, clock.timeZone),
        category: data.category ?? null, priority: data.priority ?? 'normal', priorityOverride: false,
        status: 'pending', cancelReason: null, manualOverride: false, scheduleVersion: 1, completedAtMs: null,
        version: 1, createdAtMs: clock.nowMs, updatedAtMs: clock.nowMs }
      this.repository.insert(item)
      return item
    })
  }
  updateOnce(input: unknown): Occurrence {
    const value = object(input)
    fields(value, ['id', 'expectedVersion', 'title', 'scheduledDate', 'scheduledTime', 'reminderEnabled', 'scene', 'priority', 'category'])
    const id = identifier(value.id), expected = version(value.expectedVersion), data = onceFields(value)
    return this.write(clock => {
      const item = requireFound(this.repository.get(id))
      checkVersion(item.version, expected)
      if (item.planId !== null || item.status === 'cancelled') throw new AppError('CONFLICT', '只能编辑未删除的一次性任务。')
      const rescheduled = data.scheduledDate !== item.scheduledDate || data.scheduledTime !== item.scheduledTime
      if (rescheduled && (item.status === 'completed' || (item.dueAtMs !== null && item.dueAtMs <= clock.nowMs))) {
        throw new AppError('CONFLICT', '已经发生的任务保留原时间，可使用移到今天。')
      }
      const next = { ...item, ...data }
      if (rescheduled) {
        this.reminderRecords.acknowledge(id, clock.nowMs)
        next.scheduleZone = clock.timeZone
        next.dueAtMs = data.scheduledTime === null ? null : dueAt(data.scheduledDate, data.scheduledTime, clock.timeZone)
        next.scheduleVersion++
      }
      return this.saveOccurrence(next, clock)
    })
  }
  setPriority(ref: unknown, input: unknown): Occurrence {
    const desired = priority(input)
    return this.write(clock => {
      const item = this.resolve(ref, clock)
      if (item.status === 'cancelled') throw new AppError('CONFLICT', '已取消的任务不能修改优先级。')
      if (item.priority === desired) return item
      return this.saveOccurrence({ ...item, priority: desired, priorityOverride: item.planId !== null }, clock)
    })
  }
  setCompleted(ref: unknown, completed: unknown): CompletionResult {
    const desired = boolean(completed, 'completed')
    return this.write(clock => {
      const item = this.resolve(ref, clock)
      if (item.status === 'cancelled') throw new AppError('CONFLICT', '已取消的任务不能修改完成状态。')
      const before = this.getDay(item.scheduledDate, clock).progress
      const changed = (item.status === 'completed') !== desired
      const next = changed ? this.saveOccurrence({ ...item, status: desired ? 'completed' : 'pending', completedAtMs: desired ? clock.nowMs : null }, clock) : item
      if (desired) this.reminderRecords.acknowledge(item.id, clock.nowMs)
      const after = this.getDay(item.scheduledDate, clock).progress
      return { occurrence: next, changed, before, after,
        allCompleted: changed && desired && item.scheduledDate === clock.today && before.total > before.completed && after.total > 0 && after.completed === after.total }
    })
  }
  removeOccurrence(ref: unknown): Occurrence {
    return this.write(clock => {
      const item = this.resolve(ref, clock)
      if (item.status === 'cancelled' && item.cancelReason === 'user_removed') return item
      this.reminderRecords.acknowledge(item.id, clock.nowMs)
      return this.saveOccurrence({ ...item, status: 'cancelled', cancelReason: 'user_removed', completedAtMs: null }, clock)
    })
  }
  moveToToday(ref: unknown): Occurrence {
    return this.write(clock => {
      const item = this.resolve(ref, clock)
      if (item.status !== 'pending') throw new AppError('CONFLICT', '只能移动未完成的任务。')
      if (item.scheduledDate === clock.today) return item
      this.reminderRecords.acknowledge(item.id, clock.nowMs)
      return this.saveOccurrence({ ...item, scheduledDate: clock.today, scheduledTime: null, dueAtMs: null,
        scheduleZone: clock.timeZone, manualOverride: true, scheduleVersion: item.scheduleVersion + 1 }, clock)
    })
  }

  createPlan(input: unknown): RepeatPlan {
    const value = object(input)
    fields(value, ['requestId', 'title', 'startDate', 'endDate', 'reminderEnabled', 'scene', 'times', 'priority', 'recurrence', 'category'])
    const key = identifier(value.requestId, 'requestId'), data = planFields(value)
    const times = this.validateTimes(value.times)
    return this.write(clock => {
      const existing = this.repository.planByCreationKey(key)
      if (existing) return existing
      const id = randomUUID()
      const plan: RepeatPlan = { ...data, id, creationKey: key, state: 'active', version: 1,
        category: data.category ?? null, priority: data.priority ?? 'normal', recurrence: data.recurrence ?? { type: 'daily' },
        effectiveFromMs: data.startDate === clock.today ? dayStart(clock.today, clock.timeZone) : clock.nowMs,
        createdAtMs: clock.nowMs, updatedAtMs: clock.nowMs,
        slots: times.map((localTime, sortOrder) => ({ id: randomUUID(), planId: id, localTime, active: true, sortOrder })) }
      this.repository.insertPlan(plan)
      this.reconcilePlan(plan, clock)
      return plan
    })
  }
  updatePlan(input: unknown): RepeatPlan {
    const value = object(input)
    fields(value, ['id', 'expectedVersion', 'title', 'startDate', 'endDate', 'reminderEnabled', 'scene', 'slots', 'priority', 'recurrence', 'category'])
    const id = identifier(value.id), expected = version(value.expectedVersion), data = planFields(value)
    if (!Array.isArray(value.slots)) throw new AppError('VALIDATION', '请设置时间槽。')
    const entries = value.slots.map(entry => {
      const slot = object(entry); fields(slot, ['id', 'localTime'])
      return { id: slot.id === undefined ? undefined : identifier(slot.id), localTime: validTime(slot.localTime) }
    })
    this.validateTimes(entries.map(entry => entry.localTime))
    const ids = entries.flatMap(entry => entry.id ? [entry.id] : [])
    if (new Set(ids).size !== ids.length) throw new AppError('VALIDATION', '时间槽标识不能重复。')
    return this.write(clock => {
      const old = requireFound(this.repository.plan(id))
      checkVersion(old.version, expected)
      if (old.state === 'ended') throw new AppError('CONFLICT', '已结束的计划不能编辑。')
      for (const slotId of ids) if (!old.slots.some(slot => slot.id === slotId && slot.active)) throw new AppError('CONFLICT', '时间槽已变化，请重新读取。')
      const slots: PlanSlot[] = old.slots.map(slot => ({ ...slot, active: false }))
      entries.forEach((entry, sortOrder) => {
        const index = slots.findIndex(slot => slot.id === entry.id)
        const slot = { id: entry.id ?? randomUUID(), planId: id, localTime: entry.localTime, active: true, sortOrder }
        if (index === -1) slots.push(slot); else slots[index] = slot
      })
      const plan = { ...old, ...data, slots, effectiveFromMs: clock.nowMs, version: old.version + 1, updatedAtMs: clock.nowMs }
      this.repository.savePlan(plan)
      this.reconcilePlan(plan, clock)
      return plan
    })
  }
  setPaused(idInput: unknown, pausedInput: unknown): RepeatPlan {
    const id = identifier(idInput), paused = boolean(pausedInput, 'paused')
    return this.changePlanState(id, paused ? 'paused' : 'active')
  }
  endPlan(idInput: unknown): RepeatPlan { return this.changePlanState(identifier(idInput), 'ended') }
  private changePlanState(id: string, state: RepeatPlan['state']): RepeatPlan {
    return this.write(clock => {
      const old = requireFound(this.repository.plan(id))
      if (old.state === state) return old
      if (old.state === 'ended') throw new AppError('CONFLICT', '已结束的计划不能恢复。')
      const next = { ...old, state, effectiveFromMs: clock.nowMs, version: old.version + 1, updatedAtMs: clock.nowMs }
      this.repository.savePlan(next)
      this.reconcilePlan(next, clock)
      return next
    })
  }
  private validateTimes(input: unknown): string[] {
    if (!Array.isArray(input) || input.length < 1 || input.length > 1440) throw new AppError('VALIDATION', '每天至少设置一个执行时间，同一时间不能重复。')
    const times = input.map(entry => validTime(entry))
    if (new Set(times).size !== times.length) throw new AppError('VALIDATION', '同一计划内的时间不能重复。')
    return times
  }
  private resolve(input: unknown, clock: ClockSnapshot): Occurrence {
    const ref = object(input)
    if ('id' in ref) { fields(ref, ['id']); return requireFound(this.repository.get(identifier(ref.id))) }
    fields(ref, ['planId', 'sourceDate', 'slotId', 'expectedPlanVersion'])
    const plan = requireFound(this.repository.plan(identifier(ref.planId)))
    checkVersion(plan.version, version(ref.expectedPlanVersion))
    const date = validDate(ref.sourceDate), slotId = identifier(ref.slotId)
    const slot = requireFound(plan.slots.find(slot => slot.id === slotId))
    const existing = this.repository.byIdentity(plan.id, date, slot.id)
    if (existing) return existing
    if (date <= clock.today) throw new AppError('CONFLICT', '该日期没有已生成的实例。')
    const due = candidate(plan, slot, date, clock.timeZone)
    if (due === null) throw new AppError('CONFLICT', '这次安排已失效，请重新读取。')
    const item = this.fromPlan(plan, slot, date, due, clock)
    this.repository.insert(item)
    return item
  }
  private fromPlan(plan: RepeatPlan, slot: PlanSlot, date: string, due: number, clock: ClockSnapshot): Occurrence {
    return { id: randomUUID(), creationKey: null, planId: plan.id, slotId: slot.id, planVersion: plan.version,
      sourceDate: date, sourceTime: slot.localTime, sourceZone: clock.timeZone,
      scheduledDate: date, scheduledTime: slot.localTime, scheduleZone: clock.timeZone, dueAtMs: due,
      title: plan.title, category: plan.category, priority: plan.priority, priorityOverride: false, scene: plan.scene, status: 'pending', cancelReason: null, manualOverride: false,
      reminderEnabled: plan.reminderEnabled, scheduleVersion: 1, completedAtMs: null,
      version: 1, createdAtMs: clock.nowMs, updatedAtMs: clock.nowMs }
  }
  private saveOccurrence(item: Occurrence, clock: ClockSnapshot): Occurrence {
    const next = { ...item, version: item.version + 1, updatedAtMs: clock.nowMs }
    this.repository.save(next)
    return next
  }
  private reconcilePlan(plan: RepeatPlan, clock: ClockSnapshot): void {
    for (const item of this.repository.subsequent(plan.id, clock.today)) {
      if (item.status === 'completed' || item.manualOverride || item.cancelReason === 'user_removed' || (item.dueAtMs !== null && item.dueAtMs <= clock.nowMs)) continue
      const slot = plan.slots.find(slot => slot.id === item.slotId)
      const due = slot ? candidate(plan, slot, item.sourceDate, clock.timeZone) : null
      // A changed slot moved into the past must not create or restore an extra occurrence today.
      if (!slot || due === null || due <= clock.nowMs) {
        const reason: CancelReason = plan.state === 'paused' ? 'plan_paused' : plan.state === 'ended' ? 'plan_ended' : 'plan_changed'
        if (item.status !== 'cancelled' || item.cancelReason !== reason) {
          this.reminderRecords.acknowledge(item.id, clock.nowMs)
          this.saveOccurrence({ ...item, status: 'cancelled', cancelReason: reason }, clock)
        }
      } else {
        const rescheduled = item.dueAtMs !== due || item.scheduledTime !== slot.localTime || item.scheduleZone !== clock.timeZone
        const next = { ...item, title: plan.title, priority: item.priorityOverride ? item.priority : plan.priority, scene: plan.scene, reminderEnabled: plan.reminderEnabled,
          scheduledTime: slot.localTime, dueAtMs: due, scheduleZone: clock.timeZone,
          status: 'pending' as const, cancelReason: null, planVersion: plan.version,
          scheduleVersion: item.scheduleVersion + Number(rescheduled) }
        if (rescheduled) this.reminderRecords.acknowledge(item.id, clock.nowMs)
        if (JSON.stringify(next) !== JSON.stringify(item)) this.saveOccurrence(next, clock)
      }
    }
    for (const slot of plan.slots) {
      const due = candidate(plan, slot, clock.today, clock.timeZone)
      if (due === null || this.repository.byIdentity(plan.id, clock.today, slot.id)) continue
      this.repository.insert(this.fromPlan(plan, slot, clock.today, due, clock))
    }
  }
  private reconcileTimeZone(clock: ClockSnapshot): void {
    for (const item of this.repository.futurePending(clock.nowMs)) {
      if (item.scheduleZone === clock.timeZone || item.scheduledTime === null) continue
      const due = dueAt(item.scheduledDate, item.scheduledTime, clock.timeZone)
      this.reminderRecords.acknowledge(item.id, clock.nowMs)
      this.saveOccurrence({ ...item, scheduleZone: clock.timeZone, dueAtMs: due, scheduleVersion: item.scheduleVersion + 1 }, clock)
    }
  }
}
