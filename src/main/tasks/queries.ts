import type { DayItem, DayView, Occurrence, Progress } from '../../shared/tasks'
import type { ClockSnapshot } from '../domain/time'
import { validDate } from '../domain/time'
import { candidate } from '../domain/recurrence'
import { TaskRepository } from './repository'

export function progress(items: { status: Occurrence['status'] }[]): Progress {
  const active = items.filter(item => item.status !== 'cancelled')
  const completed = active.filter(item => item.status === 'completed').length
  return { total: active.length, completed, percentage: active.length ? Math.round(completed / active.length * 100) : 0 }
}
export class TaskQueries {
  constructor(private readonly repository: TaskRepository) {}
  getDay(input: unknown, clock: ClockSnapshot): DayView {
    const date = validDate(input)
    const kind = date < clock.today ? 'past' : date === clock.today ? 'today' : 'future'
    const saved = this.repository.day(date)
    const items: DayItem[] = saved.filter(item => item.status !== 'cancelled')
      .map(occurrence => ({ kind: 'saved', ref: { id: occurrence.id }, occurrence }))
    if (kind === 'future') {
      for (const plan of this.repository.plans()) for (const slot of plan.slots) {
        const due = candidate(plan, slot, date, clock.timeZone)
        // Query by source identity, even if a saved exception was moved to another day or cancelled.
        if (due === null || this.repository.byIdentity(plan.id, date, slot.id)) continue
        items.push({ kind: 'preview', ref: { planId: plan.id, sourceDate: date, slotId: slot.id, expectedPlanVersion: plan.version },
          title: plan.title, scene: plan.scene, scheduledDate: date, scheduledTime: slot.localTime,
          scheduleZone: clock.timeZone, dueAtMs: due, reminderEnabled: plan.reminderEnabled })
      }
    }
    items.sort((a, b) => {
      const x = a.kind === 'saved' ? a.occurrence : a
      const y = b.kind === 'saved' ? b.occurrence : b
      if (a.kind === 'saved' && b.kind === 'saved' && a.occurrence.status === 'completed' && b.occurrence.status === 'completed') {
        return (b.occurrence.completedAtMs ?? 0) - (a.occurrence.completedAtMs ?? 0)
      }
      return (x.scheduledTime ?? '99:99').localeCompare(y.scheduledTime ?? '99:99') || x.title.localeCompare(y.title)
    })
    return { date, kind, activated: this.repository.isActivated(date), items,
      progress: progress(items.map(item => item.kind === 'saved' ? item.occurrence : { status: 'pending' })) }
  }
}
