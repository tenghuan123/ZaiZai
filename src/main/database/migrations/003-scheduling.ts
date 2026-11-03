import type Database from 'better-sqlite3'
import { STANDARD_SIZE } from '../../../shared/window'

export function addSchedulingPreferences(db: Database.Database): void {
  db.exec(`
    ALTER TABLE repeat_plans ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent'));
    ALTER TABLE repeat_plans ADD COLUMN recurrence TEXT NOT NULL DEFAULT '{"type":"daily"}' CHECK(json_valid(recurrence));
    ALTER TABLE task_occurrences ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent'));
    ALTER TABLE task_occurrences ADD COLUMN priority_override INTEGER NOT NULL DEFAULT 0 CHECK(priority_override IN (0,1));
  `)
  const row = db.prepare('SELECT value FROM app_settings WHERE id=1').get() as { value: string }
  // Only add this version's fields; invalid existing values must still fail validation and roll back.
  const settings = { openAtLogin: false, reminderSoundEnabled: true, expandedSize: STANDARD_SIZE, ...JSON.parse(row.value) }
  db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(settings))
}
