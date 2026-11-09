import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Connection, MigrationError, schemaVersion } from '../src/main/database/connection'
import { createTaskModel } from '../src/main/database/migrations/002-task-model'
import { addSchedulingPreferences } from '../src/main/database/migrations/003-scheduling'
import { fixture, saved } from './helpers'
import { fitToWorkArea, petAnchor, placePetWindow, placeTaskPanel } from '../src/main/desktop/geometry'
import { LARGE_SIZE, PANEL_FRAME_INSET, PET_AREA, PET_BUTTON } from '../src/shared/window'
import { AppError } from '../src/main/domain/errors'

function m0(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL'); db.pragma('wal_autocheckpoint = 0')
  db.exec(`CREATE TABLE m0_reminders(id TEXT PRIMARY KEY,title TEXT NOT NULL,due_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
    dispatch_state TEXT NOT NULL,submitted_at INTEGER,completed_at INTEGER,acknowledged_at INTEGER,last_error TEXT);
    CREATE TABLE m0_settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL); PRAGMA user_version=1;`)
  db.prepare('INSERT INTO m0_settings VALUES(1,?)').run(JSON.stringify({ displayMode: 'compact', alwaysOnTop: false, offworkTime: '18:30', position: { x: -900, y: 100 } }))
  return db
}

test('new database has six tables, strict checks, foreign keys, restricted historical deletes and stable unique identities', () => {
  const f = fixture()
  try {
    assert.equal(f.connection.db.pragma('user_version', { simple: true }), schemaVersion)
    assert.equal(f.connection.db.pragma('foreign_keys', { simple: true }), 1)
    assert.equal(f.connection.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length, 6)
    const plan = f.plan(), other = f.plan({ times: ['16:00'] })
    const item = saved(f.tasks.getDay('2026-11-02')).find(item => item.planId === plan.id)!
    assert.throws(() => f.connection.db.prepare('UPDATE task_occurrences SET slot_id=? WHERE id=?').run(other.slots[0].id, item.id), /FOREIGN KEY/)
    assert.throws(() => f.connection.db.prepare('DELETE FROM repeat_plans WHERE id=?').run(plan.id), /FOREIGN KEY/)
    assert.throws(() => f.connection.db.prepare('UPDATE task_occurrences SET plan_version=NULL WHERE id=?').run(item.id), /CHECK/)
    assert.throws(() => f.connection.db.prepare("UPDATE task_occurrences SET status='completed' WHERE id=?").run(item.id), /CHECK/)
    assert.throws(() => f.repository.insert({ ...item, id: randomUUID(), status: 'cancelled', cancelReason: 'user_removed' }), /UNIQUE/)
    assert.throws(() => f.connection.db.prepare('UPDATE plan_slots SET local_time=? WHERE id=?').run(plan.slots[0].localTime, plan.slots[1].id), /UNIQUE/)
    const [claim] = f.records.claimDue(f.clock())
    assert.throws(() => f.connection.db.prepare(`INSERT INTO reminder_dispatches(id,occurrence_id,schedule_version,batch_id,state,claimed_at_ms)
      VALUES(?,?,1,?,'claimed',?)`).run(randomUUID(), claim.id, randomUUID(), f.clock().nowMs), /UNIQUE/)
  } finally { f.close() }
})

test('reopen preserves settings, task IDs and completion; schema upgrade is not repeated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-m1-reopen-')), file = join(dir, 'data.sqlite3')
  let f = fixture(file)
  try {
    const item = f.once()
    f.tasks.setCompleted({ id: item.id }, true)
    f.settings.updateSettings({ displayMode: 'compact', position: { x: -900, y: 100 }, defaultReminderEnabled: false })
    f.close(); f = fixture(file)
    assert.equal(f.repository.get(item.id)?.status, 'completed')
    assert.equal(f.settings.getSettings().defaultReminderEnabled, false)
    assert.equal(f.settings.getSettings().displayMode, 'compact')
    assert.deepEqual(f.settings.getSettings().position, { x: -900, y: 100 })
    assert.equal(f.connection.backupPath, null)
  } finally { f.close(); rmSync(dir, { recursive: true }) }
})

test('M0 migration backs up committed WAL data, keeps IDs, exact times, dispatch results and preferences', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-m1-migrate-')), file = join(dir, 'm0.sqlite3')
  const old = m0(file)
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  const due = Date.parse('2026-11-02T04:00:05.123Z')
  const insert = old.prepare('INSERT INTO m0_reminders VALUES(?,?,?,?,?,?,?,?,?)')
  insert.run(ids[0], '已提交', due, due - 10_000, 'submitted', due + 1, due + 2, due + 2, null)
  insert.run(ids[1], '提交中', due, due - 10_000, 'claimed', null, null, null, null)
  insert.run(ids[2], '错过昨天', due - 86400_000, due - 86400_000, 'missed', null, null, null, '不补发')
  let connection: Connection | undefined
  try {
    connection = new Connection(file, 'Asia/Shanghai')
    assert.ok(connection.backupPath)
    const backup = new Database(connection.backupPath!, { readonly: true })
    try {
      assert.equal(backup.pragma('user_version', { simple: true }), 1)
      assert.equal((backup.prepare('SELECT count(*) AS n FROM m0_reminders').get() as { n: number }).n, 3)
      assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok')
    } finally { backup.close() }
    const rows = connection.db.prepare('SELECT * FROM task_occurrences ORDER BY id').all() as { id: string; due_at_ms: number; source_zone: string }[]
    assert.equal(rows.length, 3)
    assert.equal(rows.find(row => row.id === ids[0])?.due_at_ms, due)
    assert.equal(rows[0].source_zone, 'Asia/Shanghai')
    assert.deepEqual(connection.db.prepare('SELECT state FROM reminder_dispatches ORDER BY state').all(), [{ state: 'submitted' }, { state: 'unavailable' }, { state: 'uncertain' }])
    assert.equal(connection.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'm0_%'").all().length, 0)
    assert.equal(JSON.parse((connection.db.prepare('SELECT value FROM app_settings').get() as { value: string }).value).displayMode, 'compact')
  } finally { connection?.close(); old.close(); rmSync(dir, { recursive: true }) }
})

test('v3 migration keeps completed tasks and plans, with no inferred categories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-v4-migrate-')), file = join(dir, 'data.sqlite3')
  const old = new Database(file)
  const completedAt = Date.parse('2026-11-02T03:30:00Z')
  let f: ReturnType<typeof fixture> | undefined
  try {
    createTaskModel(old)
    addSchedulingPreferences(old)
    old.pragma('user_version=3')
    old.exec(`INSERT INTO repeat_plans(id,creation_key,title,state,start_date,reminder_enabled,scene,effective_from_ms,version,created_at_ms,updated_at_ms)
      VALUES('legacy-plan','legacy-plan-key','喝水','active','2026-11-02',0,'water',0,1,0,0);
      INSERT INTO task_occurrences(id,creation_key,source_date,source_zone,scheduled_date,schedule_zone,title,scene,status,manual_override,
        reminder_enabled,schedule_version,completed_at_ms,version,created_at_ms,updated_at_ms)
      VALUES('legacy-task','legacy-task-key','2026-11-01','Asia/Shanghai','2026-11-01','Asia/Shanghai','拉伸','stretch','completed',
        0,0,1,${completedAt},1,0,${completedAt});`)
    old.close()
    f = fixture(file)
    assert.match(f.connection.backupPath ?? '', /\.pre-v4-.*\.bak$/)
    assert.equal(f.tasks.listPlans()[0].category, null)
    assert.deepEqual(f.tasks.getDailyReport().items, [{ id: 'legacy-task', title: '拉伸', category: null, completedAtMs: completedAt }])
    assert.equal(f.connection.db.pragma('user_version', { simple: true }), schemaVersion)
  } finally { f?.close(); if (old.open) old.close(); rmSync(dir, { recursive: true }) }
})

test('migration failure rolls back schema and version and leaves a restorable pre-migration backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-m1-fail-')), file = join(dir, 'm0.sqlite3')
  const old = m0(file)
  old.prepare('INSERT INTO m0_reminders VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(), '', 10_000, 1, 'pending', null, null, null, null)
  try {
    assert.throws(() => new Connection(file, 'Asia/Shanghai'), (error: unknown) => error instanceof MigrationError && !!error.backupPath)
    assert.equal(old.pragma('user_version', { simple: true }), 1)
    assert.equal(old.prepare("SELECT name FROM sqlite_master WHERE name='task_occurrences'").all().length, 0)
    assert.equal((old.prepare('SELECT count(*) AS n FROM m0_reminders').get() as { n: number }).n, 1)
    assert.equal(readdirSync(dir).filter(name => name.endsWith('.bak')).length, 1)
  } finally { old.close(); rmSync(dir, { recursive: true }) }
})

test('newer or unversioned existing databases are rejected without reset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-m1-newer-')), file = join(dir, 'data.sqlite3')
  let old = new Database(file)
  try {
    old.exec('CREATE TABLE existing(value TEXT); INSERT INTO existing VALUES(\'preserve\'); PRAGMA user_version=99;')
    old.close()
    assert.throws(() => new Connection(file), /数据版本较新/)
    old = new Database(file)
    assert.deepEqual(old.prepare('SELECT * FROM existing').get(), { value: 'preserve' })
    old.pragma('user_version=0'); old.close()
    assert.throws(() => new Connection(file), /没有版本号/)
    old = new Database(file)
    assert.deepEqual(old.prepare('SELECT * FROM existing').get(), { value: 'preserve' })
  } finally { old.close(); rmSync(dir, { recursive: true }) }
})

test('settings reject stale edits and unknown keys; SQLite write failure leaves saved data unchanged', () => {
  const f = fixture()
  try {
    const current = f.settings.getSettings()
    const next = f.settings.updateFromUI({ expectedVersion: current.version, patch: { defaultReminderEnabled: false } })
    assert.equal(next.defaultReminderEnabled, false)
    assert.throws(() => f.settings.updateFromUI({ expectedVersion: current.version, patch: { alwaysOnTop: false } }), AppError)
    assert.throws(() => f.settings.updateFromUI({ expectedVersion: next.version, patch: { filePath: '/tmp/anything' } }), AppError)
    assert.throws(() => f.settings.updateFromUI({ expectedVersion: next.version, patch: { offworkTime: '25:00' } }), AppError)
    f.connection.db.pragma('query_only=ON')
    assert.throws(() => f.settings.updateFromUI({ expectedVersion: next.version, patch: { alwaysOnTop: false } }), /readonly/)
    assert.throws(() => f.once(), /readonly/)
    assert.deepEqual(f.settings.getSettings(), next)
    assert.equal(f.tasks.getDay('2026-11-02').items.length, 0)
  } finally { f.close() }
})

test('window recovery fits negative-coordinate secondary screens', () => {
  assert.deepEqual(fitToWorkArea({ x: 2400, y: 1400, width: 356, height: 560 }, { x: 0, y: 30, width: 1440, height: 870 }),
    { x: 1084, y: 340, width: 356, height: 560 })
  assert.deepEqual(fitToWorkArea({ x: -3000, y: -200, width: 356, height: 224 }, { x: -1920, y: 0, width: 1920, height: 1080 }),
    { x: -1920, y: 0, width: 356, height: 224 })
})

test('the panel opens on the available sides of a separate pet window on a secondary display', () => {
  const area = { x: -1440, y: 40, width: 1440, height: 860 }
  for (const horizontal of ['left', 'right'] as const) {
    for (const vertical of ['up', 'down'] as const) {
      const anchor = {
        x: horizontal === 'left' ? area.x + area.width - PET_AREA.width : area.x,
        y: vertical === 'up' ? area.y + area.height - PET_AREA.height : area.y
      }
      const pet = placePetWindow(anchor, area)
      const panel = placeTaskPanel(anchor, LARGE_SIZE, area)
      assert.deepEqual(petAnchor(pet.bounds, pet.layout), anchor)
      assert.deepEqual(fitToWorkArea(pet.bounds, area), pet.bounds)
      assert.deepEqual(fitToWorkArea(panel.bounds, area), panel.bounds)
      assert.deepEqual(panel.direction, { horizontal, vertical })
      const petTop = anchor.y + PET_BUTTON.top
      const cardTop = panel.bounds.y + PANEL_FRAME_INSET
      const cardBottom = panel.bounds.y + panel.bounds.height - PANEL_FRAME_INSET
      assert.equal(vertical === 'up' ? petTop - cardBottom : cardTop - petTop - PET_BUTTON.height, 4)
    }
  }
})

test('panel placement shrinks to the free space beside the pet without covering the character', () => {
  const area = { x: 0, y: 25, width: 620, height: 700 }
  const anchor = { x: 270, y: 400 }
  const pet = placePetWindow(anchor, area)
  const { bounds, direction } = placeTaskPanel(anchor, LARGE_SIZE, area)
  assert.deepEqual(petAnchor(pet.bounds, pet.layout), anchor)
  assert.deepEqual(direction, { horizontal: 'left', vertical: 'up' })
  assert.deepEqual(fitToWorkArea(bounds, area), bounds)
  assert.equal(bounds.y, area.y)
  assert.equal(anchor.y + PET_BUTTON.top - (bounds.y + bounds.height - PANEL_FRAME_INSET), 4)
})
