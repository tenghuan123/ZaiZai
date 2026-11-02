import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { clockSnapshot, localTimeAt } from '../../domain/time'
import { defaultSettings, validateSettings } from '../../settings/repository'

export function createTaskModel(db: Database.Database): void {
  db.exec(`
    CREATE TABLE repeat_plans (
      id TEXT PRIMARY KEY, creation_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 60),
      state TEXT NOT NULL CHECK(state IN ('active','paused','ended')), start_date TEXT NOT NULL, end_date TEXT,
      reminder_enabled INTEGER NOT NULL CHECK(reminder_enabled IN (0,1)), scene TEXT NOT NULL CHECK(scene IN ('generic','water','stretch')),
      effective_from_ms INTEGER NOT NULL, version INTEGER NOT NULL CHECK(version>=1), created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
      CHECK(end_date IS NULL OR end_date>=start_date)
    ) STRICT;
    CREATE TABLE plan_slots (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES repeat_plans(id) ON DELETE RESTRICT,
      local_time TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)), sort_order INTEGER NOT NULL,
      UNIQUE(plan_id,id)
    ) STRICT;
    CREATE UNIQUE INDEX uq_active_slot_time ON plan_slots(plan_id,local_time) WHERE active=1;
    CREATE TABLE task_occurrences (
      id TEXT PRIMARY KEY, creation_key TEXT UNIQUE, plan_id TEXT REFERENCES repeat_plans(id) ON DELETE RESTRICT,
      slot_id TEXT, plan_version INTEGER, source_date TEXT NOT NULL, source_time TEXT, source_zone TEXT NOT NULL,
      scheduled_date TEXT NOT NULL, scheduled_time TEXT, schedule_zone TEXT NOT NULL, due_at_ms INTEGER,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 60), scene TEXT NOT NULL CHECK(scene IN ('generic','water','stretch')),
      status TEXT NOT NULL CHECK(status IN ('pending','completed','cancelled')),
      cancel_reason TEXT CHECK(cancel_reason IN ('user_removed','plan_paused','plan_changed','plan_ended')),
      manual_override INTEGER NOT NULL CHECK(manual_override IN (0,1)), reminder_enabled INTEGER NOT NULL CHECK(reminder_enabled IN (0,1)),
      schedule_version INTEGER NOT NULL CHECK(schedule_version>=1), completed_at_ms INTEGER,
      version INTEGER NOT NULL CHECK(version>=1), created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
      FOREIGN KEY(plan_id,slot_id) REFERENCES plan_slots(plan_id,id) ON DELETE RESTRICT,
      CHECK((plan_id IS NULL AND slot_id IS NULL AND plan_version IS NULL AND creation_key IS NOT NULL) OR
        (plan_id IS NOT NULL AND slot_id IS NOT NULL AND plan_version IS NOT NULL AND plan_version>=1 AND source_time IS NOT NULL AND creation_key IS NULL)),
      CHECK((scheduled_time IS NULL AND due_at_ms IS NULL) OR (scheduled_time IS NOT NULL AND due_at_ms IS NOT NULL)),
      CHECK((status='completed' AND completed_at_ms IS NOT NULL AND cancel_reason IS NULL) OR
        (status='pending' AND completed_at_ms IS NULL AND cancel_reason IS NULL) OR
        (status='cancelled' AND completed_at_ms IS NULL AND cancel_reason IS NOT NULL))
    ) STRICT;
    CREATE UNIQUE INDEX uq_repeat_occurrence ON task_occurrences(plan_id,source_date,slot_id) WHERE plan_id IS NOT NULL;
    CREATE INDEX ix_occurrence_day_status ON task_occurrences(scheduled_date,status);
    CREATE INDEX ix_occurrence_due ON task_occurrences(due_at_ms) WHERE status='pending' AND reminder_enabled=1 AND due_at_ms IS NOT NULL;
    CREATE TABLE reminder_dispatches (
      id TEXT PRIMARY KEY, occurrence_id TEXT NOT NULL REFERENCES task_occurrences(id) ON DELETE RESTRICT,
      schedule_version INTEGER NOT NULL CHECK(schedule_version>=1), batch_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('claimed','submitted','failed','unavailable','uncertain')),
      claimed_at_ms INTEGER NOT NULL, submitted_at_ms INTEGER, acknowledged_at_ms INTEGER, error_code TEXT, error_message TEXT,
      CHECK((state='submitted' AND submitted_at_ms IS NOT NULL) OR (state<>'submitted' AND submitted_at_ms IS NULL))
    ) STRICT;
    CREATE UNIQUE INDEX uq_reminder_schedule ON reminder_dispatches(occurrence_id,schedule_version);
    CREATE TABLE calendar_days (local_date TEXT PRIMARY KEY, zone_at_activation TEXT NOT NULL, activated_at_ms INTEGER NOT NULL) STRICT;
    CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
  `)
  db.prepare('INSERT INTO app_settings(id,value) VALUES(1,?)').run(JSON.stringify(defaultSettings))
}

interface M0Reminder {
  id: string; title: string; due_at: number; created_at: number; dispatch_state: string
  submitted_at: number | null; completed_at: number | null; acknowledged_at: number | null; last_error: string | null
}
export function importM0(db: Database.Database, timeZone: string): void {
  const setting = db.prepare('SELECT value FROM m0_settings WHERE id=1').get() as { value: string } | undefined
  if (!setting) throw new Error('M0 设置记录缺失。')
  const settings = validateSettings({ ...defaultSettings, ...JSON.parse(setting.value), version: 1 })
  db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(settings))
  const insert = db.prepare(`INSERT INTO task_occurrences(id,creation_key,source_date,source_time,source_zone,
    scheduled_date,scheduled_time,schedule_zone,due_at_ms,title,scene,status,manual_override,reminder_enabled,
    schedule_version,completed_at_ms,version,created_at_ms,updated_at_ms)
    VALUES(@id,@id,@date,@time,@zone,@date,@time,@zone,@due,@title,'generic',@status,0,1,1,@completed,1,@created,@created)`)
  const dispatch = db.prepare(`INSERT INTO reminder_dispatches(id,occurrence_id,schedule_version,batch_id,state,
    claimed_at_ms,submitted_at_ms,acknowledged_at_ms,error_code,error_message) VALUES(?,?,1,?,?,?,?,?,?,?)`)
  for (const row of db.prepare('SELECT * FROM m0_reminders').all() as M0Reminder[]) {
    insert.run({ id: row.id, date: clockSnapshot(row.due_at, timeZone).today, time: localTimeAt(row.due_at, timeZone),
      zone: timeZone, due: row.due_at, title: row.title, status: row.completed_at === null ? 'pending' : 'completed',
      completed: row.completed_at, created: row.created_at })
    if (row.dispatch_state !== 'pending') {
      const state = row.dispatch_state === 'claimed' ? 'uncertain' : row.dispatch_state === 'missed' ? 'unavailable' : row.dispatch_state
      dispatch.run(randomUUID(), row.id, randomUUID(), state, row.created_at,
        state === 'submitted' ? row.submitted_at : null, row.acknowledged_at,
        row.dispatch_state === 'missed' ? 'M0_MISSED' : null, row.last_error)
    }
  }
  db.exec('DROP TABLE m0_reminders; DROP TABLE m0_settings;')
}
