import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { DispatchState, Reminder, Settings } from '../../shared/contracts'

interface ReminderRow {
  id: string; title: string; due_at: number; created_at: number; dispatch_state: DispatchState
  submitted_at: number | null; completed_at: number | null; acknowledged_at: number | null; last_error: string | null
}

const defaultSettings: Settings = {
  displayMode: 'expanded', alwaysOnTop: true, offworkTime: '18:00', position: null
}

function fromRow(row: ReminderRow): Reminder {
  return { id: row.id, title: row.title, dueAt: row.due_at, createdAt: row.created_at,
    dispatchState: row.dispatch_state, submittedAt: row.submitted_at, completedAt: row.completed_at,
    acknowledgedAt: row.acknowledged_at, lastError: row.last_error }
}

export class Store {
  private readonly db: Database.Database

  constructor(readonly path: string) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    const version = this.db.pragma('user_version', { simple: true }) as number
    if (version > 1) throw new Error('M0 数据版本较新，请使用匹配版本打开。')
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS m0_reminders (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, due_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
          dispatch_state TEXT NOT NULL CHECK(dispatch_state IN ('pending','claimed','submitted','failed','uncertain','missed')),
          submitted_at INTEGER, completed_at INTEGER, acknowledged_at INTEGER, last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS m0_pending_due ON m0_reminders(due_at)
          WHERE dispatch_state = 'pending' AND completed_at IS NULL;
        CREATE TABLE IF NOT EXISTS m0_settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
        PRAGMA user_version = 1;
      `)
      this.db.prepare('INSERT OR IGNORE INTO m0_settings(id,value) VALUES(1,?)').run(JSON.stringify(defaultSettings))
      this.db.prepare("UPDATE m0_reminders SET dispatch_state='uncertain',last_error=? WHERE dispatch_state='claimed'")
        .run('上次提交结果不明，已保留应用内提醒。')
    })()
    this.getSettings()
  }

  getSettings(): Settings {
    const row = this.db.prepare('SELECT value FROM m0_settings WHERE id=1').get() as { value: string }
    const value = JSON.parse(row.value) as Settings
    if (!['expanded', 'compact'].includes(value.displayMode) || typeof value.alwaysOnTop !== 'boolean' ||
      !(value.offworkTime === null || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.offworkTime)) ||
      !(value.position === null || (Number.isFinite(value.position.x) && Number.isFinite(value.position.y)))) {
      throw new Error('本地窗口设置损坏，请保留数据并检查，应用不会自动重置。')
    }
    return value
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const value = { ...this.getSettings(), ...patch }
    this.db.prepare('UPDATE m0_settings SET value=? WHERE id=1').run(JSON.stringify(value))
    return value
  }

  list(): Reminder[] {
    return (this.db.prepare('SELECT * FROM m0_reminders ORDER BY due_at,created_at').all() as ReminderRow[]).map(fromRow)
  }

  get(id: string): Reminder | undefined {
    const row = this.db.prepare('SELECT * FROM m0_reminders WHERE id=?').get(id) as ReminderRow | undefined
    return row && fromRow(row)
  }

  schedule(title: string, dueAt: number, now: number): Reminder {
    const value: Reminder = { id: randomUUID(), title, dueAt, createdAt: now,
      dispatchState: 'pending', submittedAt: null, completedAt: null, acknowledgedAt: null, lastError: null }
    this.db.prepare("INSERT INTO m0_reminders(id,title,due_at,created_at,dispatch_state) VALUES(?,?,?,?,'pending')")
      .run(value.id, title, dueAt, now)
    return value
  }

  setCompleted(id: string, completed: boolean, now: number): void {
    const item = this.get(id)
    if (!item) throw new Error('这条提醒不存在。')
    if ((item.completedAt !== null) === completed) return
    this.db.prepare('UPDATE m0_reminders SET completed_at=?,acknowledged_at=CASE WHEN ? THEN ? ELSE acknowledged_at END WHERE id=?')
      .run(completed ? now : null, completed ? 1 : 0, now, id)
  }

  acknowledge(id: string, now: number): void {
    this.db.prepare('UPDATE m0_reminders SET acknowledged_at=COALESCE(acknowledged_at,?) WHERE id=?').run(now, id)
  }

  claimDue(now: number, dayStart: number): Reminder[] {
    return this.db.transaction(() => {
      const rows = this.db.prepare("SELECT * FROM m0_reminders WHERE dispatch_state='pending' AND completed_at IS NULL AND due_at BETWEEN ? AND ? ORDER BY due_at")
        .all(dayStart, now) as ReminderRow[]
      const claim = this.db.prepare("UPDATE m0_reminders SET dispatch_state='claimed' WHERE id=? AND dispatch_state='pending'")
      for (const row of rows) claim.run(row.id)
      return rows.map(row => fromRow({ ...row, dispatch_state: 'claimed' }))
    })()
  }

  expireBefore(dayStart: number): number {
    return this.db.prepare("UPDATE m0_reminders SET dispatch_state='missed',last_error=? WHERE dispatch_state='pending' AND due_at<? AND completed_at IS NULL")
      .run('已错过原日期，保留在清单中，不补发旧日期通知。', dayStart).changes
  }

  finishDispatch(ids: string[], outcome: { state: 'submitted' | 'failed'; error?: string }, now: number): void {
    this.db.transaction(() => {
      const update = this.db.prepare("UPDATE m0_reminders SET dispatch_state=?,submitted_at=?,last_error=? WHERE id=? AND dispatch_state='claimed'")
      for (const id of ids) update.run(outcome.state, outcome.state === 'submitted' ? now : null, outcome.error ?? null, id)
    })()
  }

  nextDue(): number | null {
    const row = this.db.prepare("SELECT MIN(due_at) AS due FROM m0_reminders WHERE dispatch_state='pending' AND completed_at IS NULL").get() as { due: number | null }
    return row.due
  }

  close(): void { this.db.close() }
}
