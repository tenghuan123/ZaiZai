import type Database from 'better-sqlite3'
import type { Occurrence, PlanSlot, RepeatPlan } from '../../shared/tasks'

const occurrenceColumns = {
  id: 'id', creationKey: 'creation_key', planId: 'plan_id', slotId: 'slot_id', planVersion: 'plan_version',
  sourceDate: 'source_date', sourceTime: 'source_time', sourceZone: 'source_zone',
  scheduledDate: 'scheduled_date', scheduledTime: 'scheduled_time', scheduleZone: 'schedule_zone', dueAtMs: 'due_at_ms',
  title: 'title', scene: 'scene', status: 'status', cancelReason: 'cancel_reason', manualOverride: 'manual_override',
  reminderEnabled: 'reminder_enabled', scheduleVersion: 'schedule_version', completedAtMs: 'completed_at_ms',
  version: 'version', createdAtMs: 'created_at_ms', updatedAtMs: 'updated_at_ms'
} as const
const planColumns = {
  id: 'id', creationKey: 'creation_key', title: 'title', state: 'state', startDate: 'start_date', endDate: 'end_date',
  reminderEnabled: 'reminder_enabled', scene: 'scene', effectiveFromMs: 'effective_from_ms', version: 'version',
  createdAtMs: 'created_at_ms', updatedAtMs: 'updated_at_ms'
} as const
function select(columns: Record<string, string>): string {
  return Object.entries(columns).map(([key, column]) => `${column} AS ${key}`).join(',')
}
function bindings(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, typeof entry === 'boolean' ? Number(entry) : entry]))
}
const occurrenceSelect = select(occurrenceColumns)
const planSelect = select(planColumns)
function occurrence(row: Occurrence | undefined): Occurrence | undefined {
  return row && { ...row, manualOverride: !!row.manualOverride, reminderEnabled: !!row.reminderEnabled }
}

export class TaskRepository {
  constructor(readonly db: Database.Database) {}
  get(id: string): Occurrence | undefined {
    return occurrence(this.db.prepare(`SELECT ${occurrenceSelect} FROM task_occurrences WHERE id=?`).get(id) as Occurrence | undefined)
  }
  byCreationKey(key: string): Occurrence | undefined {
    return occurrence(this.db.prepare(`SELECT ${occurrenceSelect} FROM task_occurrences WHERE creation_key=?`).get(key) as Occurrence | undefined)
  }
  byIdentity(planId: string, date: string, slotId: string): Occurrence | undefined {
    return occurrence(this.db.prepare(`SELECT ${occurrenceSelect} FROM task_occurrences WHERE plan_id=? AND source_date=? AND slot_id=?`)
      .get(planId, date, slotId) as Occurrence | undefined)
  }
  day(date: string): Occurrence[] {
    return (this.db.prepare(`SELECT ${occurrenceSelect} FROM task_occurrences WHERE scheduled_date=?`).all(date) as Occurrence[])
      .map(row => occurrence(row)!)
  }
  subsequent(planId: string, from: string): Occurrence[] {
    return (this.db.prepare(`SELECT ${occurrenceSelect} FROM task_occurrences WHERE plan_id=? AND source_date>=?`).all(planId, from) as Occurrence[])
      .map(row => occurrence(row)!)
  }
  futurePending(nowMs: number): Occurrence[] {
    return (this.db.prepare(`SELECT ${occurrenceSelect} FROM task_occurrences WHERE status='pending' AND due_at_ms>?`).all(nowMs) as Occurrence[])
      .map(row => occurrence(row)!)
  }
  insert(item: Occurrence): void {
    const entries = Object.entries(occurrenceColumns)
    this.db.prepare(`INSERT INTO task_occurrences(${entries.map(([, col]) => col)}) VALUES(${entries.map(([key]) => `@${key}`)})`).run(bindings(item))
  }
  save(item: Occurrence): void {
    const entries = Object.entries(occurrenceColumns).filter(([key]) => key !== 'id')
    this.db.prepare(`UPDATE task_occurrences SET ${entries.map(([key, col]) => `${col}=@${key}`)} WHERE id=@id`).run(bindings(item))
  }
  plans(): RepeatPlan[] {
    return (this.db.prepare(`SELECT ${planSelect} FROM repeat_plans ORDER BY created_at_ms,id`).all() as RepeatPlan[])
      .map(row => ({ ...row, reminderEnabled: !!row.reminderEnabled, slots: this.slots(row.id) }))
  }
  plan(id: string): RepeatPlan | undefined { return this.plans().find(plan => plan.id === id) }
  planByCreationKey(key: string): RepeatPlan | undefined { return this.plans().find(plan => plan.creationKey === key) }
  private slots(planId: string): PlanSlot[] {
    return (this.db.prepare('SELECT id,plan_id AS planId,local_time AS localTime,active,sort_order AS sortOrder FROM plan_slots WHERE plan_id=? ORDER BY sort_order,id')
      .all(planId) as PlanSlot[]).map(row => ({ ...row, active: !!row.active }))
  }
  insertPlan(plan: RepeatPlan): void {
    const { slots, ...value } = plan
    const entries = Object.entries(planColumns)
    this.db.prepare(`INSERT INTO repeat_plans(${entries.map(([, col]) => col)}) VALUES(${entries.map(([key]) => `@${key}`)})`).run(bindings(value))
    this.saveSlots(plan.id, slots)
  }
  savePlan(plan: RepeatPlan): void {
    const { slots, ...value } = plan
    const entries = Object.entries(planColumns).filter(([key]) => key !== 'id')
    this.db.prepare(`UPDATE repeat_plans SET ${entries.map(([key, col]) => `${col}=@${key}`)} WHERE id=@id`).run(bindings(value))
    this.saveSlots(plan.id, slots)
  }
  private saveSlots(planId: string, slots: PlanSlot[]): void {
    // Disable first so swapping two existing times cannot violate the partial unique index midway.
    this.db.prepare('UPDATE plan_slots SET active=0 WHERE plan_id=?').run(planId)
    const save = this.db.prepare(`INSERT INTO plan_slots(id,plan_id,local_time,active,sort_order) VALUES(@id,@planId,@localTime,@active,@sortOrder)
      ON CONFLICT(id) DO UPDATE SET local_time=excluded.local_time,active=excluded.active,sort_order=excluded.sort_order`)
    for (const slot of slots) save.run(bindings(slot))
  }
  activate(date: string, zone: string, nowMs: number): void {
    this.db.prepare('INSERT OR IGNORE INTO calendar_days VALUES(?,?,?)').run(date, zone, nowMs)
  }
  isActivated(date: string): boolean { return !!this.db.prepare('SELECT 1 FROM calendar_days WHERE local_date=?').get(date) }
  historyDates(from: string, to: string): string[] {
    return (this.db.prepare(`SELECT local_date AS date FROM calendar_days WHERE local_date BETWEEN ? AND ?
      UNION SELECT scheduled_date AS date FROM task_occurrences WHERE scheduled_date BETWEEN ? AND ? ORDER BY date DESC`)
      .all(from, to, from, to) as { date: string }[]).map(row => row.date)
  }
}
