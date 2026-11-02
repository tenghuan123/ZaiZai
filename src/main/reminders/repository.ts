import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Reminder } from '../../shared/contracts'
import type { ClockSnapshot } from '../domain/time'

export type DeliveryOutcome = { state: 'submitted' | 'failed' | 'unavailable'; error?: string }
export interface ClaimedReminder extends Reminder { dispatchId: string }
interface ReminderRow {
  id: string; title: string; due_at_ms: number; created_at_ms: number; completed_at_ms: number | null
  state: Reminder['dispatchState'] | null; submitted_at_ms: number | null; acknowledged_at_ms: number | null; error_message: string | null
}
const projection = `SELECT o.id,o.title,o.due_at_ms,o.created_at_ms,o.completed_at_ms,
  d.state,d.submitted_at_ms,d.acknowledged_at_ms,d.error_message FROM task_occurrences o
  LEFT JOIN reminder_dispatches d ON d.occurrence_id=o.id AND d.schedule_version=o.schedule_version`
function reminder(row: ReminderRow): Reminder {
  return { id: row.id, title: row.title, dueAt: row.due_at_ms, createdAt: row.created_at_ms,
    completedAt: row.completed_at_ms, dispatchState: row.state ?? 'pending',
    submittedAt: row.submitted_at_ms, acknowledgedAt: row.acknowledged_at_ms, lastError: row.error_message }
}
export class ReminderRepository {
  constructor(private readonly db: Database.Database) {}
  recoverClaims(): number {
    return this.db.prepare(`UPDATE reminder_dispatches SET state='uncertain',error_code='INTERRUPTED',
      error_message='上次提交结果不明，已保留应用内提醒。' WHERE state='claimed'`).run().changes
  }
  acknowledge(occurrenceId: string, nowMs: number): void {
    this.db.prepare('UPDATE reminder_dispatches SET acknowledged_at_ms=COALESCE(acknowledged_at_ms,?) WHERE occurrence_id=?').run(nowMs, occurrenceId)
  }
  listDay(date: string): Reminder[] {
    return (this.db.prepare(`${projection} WHERE o.scheduled_date=? AND o.status<>'cancelled' AND o.due_at_ms IS NOT NULL ORDER BY o.due_at_ms,o.id`)
      .all(date) as ReminderRow[]).map(reminder)
  }
  active(clock: ClockSnapshot): string[] {
    return (this.db.prepare(`${projection} WHERE o.scheduled_date=? AND o.status='pending' AND o.reminder_enabled=1
      AND o.due_at_ms<=? AND d.acknowledged_at_ms IS NULL AND d.id IS NOT NULL ORDER BY o.due_at_ms,o.id`)
      .all(clock.today, clock.nowMs) as ReminderRow[]).map(row => row.id)
  }
  claimDue(clock: ClockSnapshot): ClaimedReminder[] {
    return this.db.transaction(() => {
      const rows = this.db.prepare(`${projection} WHERE o.scheduled_date=? AND o.status='pending' AND o.reminder_enabled=1
        AND o.due_at_ms<=? AND d.id IS NULL ORDER BY o.due_at_ms,o.id`).all(clock.today, clock.nowMs) as ReminderRow[]
      const batch = randomUUID()
      const claim = this.db.prepare(`INSERT INTO reminder_dispatches(id,occurrence_id,schedule_version,batch_id,state,claimed_at_ms)
        SELECT ?,id,schedule_version,?,'claimed',? FROM task_occurrences WHERE id=?`)
      return rows.map(row => {
        const dispatchId = randomUUID()
        claim.run(dispatchId, batch, clock.nowMs, row.id)
        return { ...reminder(row), dispatchState: 'claimed' as const, dispatchId }
      })
    })()
  }
  finishDispatch(dispatchIds: string[], outcome: DeliveryOutcome, nowMs: number): void {
    this.db.transaction(() => {
      const update = this.db.prepare(`UPDATE reminder_dispatches SET state=?,submitted_at_ms=?,error_code=?,error_message=? WHERE id=? AND state='claimed'`)
      for (const id of dispatchIds) update.run(outcome.state, outcome.state === 'submitted' ? nowMs : null,
        outcome.state === 'submitted' ? null : outcome.state.toUpperCase(), outcome.error ?? null, id)
    })()
  }
  nextDue(today: string): number | null {
    const row = this.db.prepare(`SELECT MIN(o.due_at_ms) AS due FROM task_occurrences o
      WHERE o.scheduled_date=? AND o.status='pending' AND o.reminder_enabled=1 AND o.due_at_ms IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM reminder_dispatches d WHERE d.occurrence_id=o.id AND d.schedule_version=o.schedule_version)`)
      .get(today) as { due: number | null }
    return row.due
  }
}
