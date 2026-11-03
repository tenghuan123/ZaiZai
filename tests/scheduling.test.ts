import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixture, saved } from './helpers'
import { Connection, MigrationError } from '../src/main/database/connection'
import { createTaskModel } from '../src/main/database/migrations/002-task-model'
import { SettingsService } from '../src/main/settings/service'
import { AppError } from '../src/main/domain/errors'

const monday = '2026-11-02'
test('urgent tasks sort before normal tasks, time then untimed; priority edits never resubmit reminders', () => {
  const f = fixture()
  try {
    f.once({ title: '普通早', scheduledTime: '10:00' })
    f.once({ title: '紧急无时间', priority: 'urgent' })
    const late = f.once({ title: '紧急晚', scheduledTime: '18:00', priority: 'urgent' })
    f.once({ title: '紧急早', scheduledTime: '17:00', priority: 'urgent' })
    assert.deepEqual(saved(f.tasks.getDay(monday)).map(item => item.title), ['紧急早', '紧急晚', '紧急无时间', '普通早'])
    const changed = f.tasks.setPriority({ id: late.id }, 'normal')
    assert.equal(changed.scheduleVersion, late.scheduleVersion)
    assert.equal(f.tasks.setPriority({ id: late.id }, 'normal').version, changed.version)
    f.tasks.setCompleted({ id: late.id }, true)
    assert.equal(f.tasks.getDay(monday).progress.completed, 1)
    assert.deepEqual(saved(f.tasks.getDay(monday)).filter(item => item.status === 'pending').map(item => item.title), ['紧急早', '紧急无时间', '普通早'])
    assert.throws(() => f.tasks.setPriority({ id: late.id }, 'other'), AppError)
  } finally { f.close() }
})

test('weekly plans filter today, future previews, materialization and inclusive end date', () => {
  const f = fixture()
  try {
    f.plan({ recurrence: { type: 'weekly', weekdays: [5, 1] }, endDate: '2026-11-06' })
    assert.equal(saved(f.tasks.getDay(monday)).length, 2)
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 0)
    const friday = f.tasks.getDay('2026-11-06')
    assert.equal(friday.items.length, 2)
    const materialized = f.tasks.setCompleted(friday.items[0].ref, true).occurrence
    f.setTime('2026-11-06'); f.tasks.ensureToday()
    assert.equal(saved(f.tasks.getDay('2026-11-06')).length, 2)
    assert.equal(f.repository.get(materialized.id)?.status, 'completed')
    assert.equal(f.tasks.getDay('2026-11-09').items.length, 0)
  } finally { f.close() }
})

test('monthly missing days skip without rolling into another month', () => {
  const f = fixture()
  try {
    f.plan({ recurrence: { type: 'monthly', days: [31], lastDay: false }, times: ['18:00'] })
    assert.equal(f.tasks.getDay('2026-11-30').items.length, 0)
    assert.equal(f.tasks.getDay('2026-12-01').items.length, 0)
    assert.equal(f.tasks.getDay('2026-12-31').items.length, 1)

  } finally { f.close() }
})

test('monthly last day supports February and overlaps selected dates only once', () => {
  const f = fixture()
  try {
    f.plan({ recurrence: { type: 'monthly', days: [31], lastDay: true }, times: ['18:00'] })
    for (const date of ['2026-11-30', '2026-12-31', '2027-02-28', '2028-02-29']) assert.equal(f.tasks.getDay(date).items.length, 1, date)
    for (const date of ['2027-02-27', '2028-02-28', '2026-12-30']) assert.equal(f.tasks.getDay(date).items.length, 0, date)
  } finally { f.close() }
})

test('changing cycle preserves due/completed history, cancels future nonmatches and rejects stale previews', () => {
  const f = fixture()
  try {
    const plan = f.plan({ times: ['10:00', '15:00', '17:00'] })
    const today = saved(f.tasks.getDay(monday)), preview = f.tasks.getDay('2026-11-03').items[0]
    f.tasks.setCompleted({ id: today.find(item => item.scheduledTime === '15:00')!.id }, true)
    f.tasks.updatePlan({ id: plan.id, expectedVersion: plan.version, title: plan.title, startDate: plan.startDate, endDate: null,
      reminderEnabled: true, recurrence: { type: 'weekly', weekdays: [5] }, slots: plan.slots.map(slot => ({ id: slot.id, localTime: slot.localTime })) })
    assert.deepEqual(saved(f.tasks.getDay(monday)).map(item => item.scheduledTime), ['10:00', '15:00'])
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 0)
    assert.equal(f.tasks.getDay('2026-11-06').items.length, 3)
    assert.throws(() => f.tasks.setCompleted(preview.ref, true), AppError)
    f.tasks.setPaused(plan.id, true)
    assert.equal(f.tasks.getDay('2026-11-06').items.length, 0)
    f.tasks.setPaused(plan.id, false)
    assert.equal(f.tasks.getDay('2026-11-06').items.length, 3)
  } finally { f.close() }
})

test('a recurring instance priority override survives reconciliation without altering plan or other dates', () => {
  const f = fixture()
  try {
    const plan = f.plan({ priority: 'urgent' })
    const preview = f.tasks.getDay('2026-11-03').items[0]
    const changed = f.tasks.setPriority(preview.ref, 'normal')
    f.once()
    assert.equal(f.repository.get(changed.id)?.priority, 'normal')
    assert.equal(f.repository.get(changed.id)?.priorityOverride, true)
    assert.equal(f.repository.plan(plan.id)?.priority, 'urgent')
    const other = f.tasks.getDay('2026-11-04').items[0]
    assert.equal(other.kind === 'preview' ? other.priority : other.occurrence.priority, 'urgent')
  } finally { f.close() }
})

test('empty, duplicate and out-of-range cycle dates are rejected before any write', () => {
  const f = fixture()
  try {
    for (const recurrence of [{ type: 'weekly', weekdays: [] }, { type: 'weekly', weekdays: [0] }, { type: 'weekly', weekdays: [1, 1] },
      { type: 'monthly', days: [], lastDay: false }, { type: 'monthly', days: [32], lastDay: false }, { type: 'daily', weekdays: [1] }]) {
      assert.throws(() => f.plan({ recurrence: recurrence as never }), AppError)
    }
    assert.equal(f.tasks.listPlans().length, 0)
  } finally { f.close() }
})

test('v2 upgrade backs up first, preserves facts and preferences, and rolls back fully on failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zaizai-v3-')), file = join(directory, 'data.sqlite3')
  const old = new Database(file)
  let migrated: Connection | undefined
  try {
    createTaskModel(old)
    old.pragma('user_version=2')
    old.exec(`INSERT INTO repeat_plans VALUES('old-plan','old-plan-key','保留每日计划','active','2026-11-02',NULL,1,'generic',0,1,0,0);
      INSERT INTO task_occurrences(id,creation_key,source_date,source_zone,scheduled_date,schedule_zone,title,scene,status,manual_override,reminder_enabled,schedule_version,version,created_at_ms,updated_at_ms)
      VALUES('old-task','old-key','2026-11-02','Asia/Shanghai','2026-11-02','Asia/Shanghai','保留原任务','generic','pending',0,1,1,1,0,0);`)
    const row = old.prepare('SELECT value FROM app_settings').get() as { value: string }
    const settings = JSON.parse(row.value)
    delete settings.openAtLogin; delete settings.reminderSoundEnabled; delete settings.expandedSize
    settings.offworkTime = '19:30'
    old.prepare('UPDATE app_settings SET value=?').run(JSON.stringify(settings))
    old.exec("CREATE TRIGGER fail_v3 BEFORE UPDATE ON app_settings BEGIN SELECT RAISE(ABORT,'upgrade failure'); END")
    assert.throws(() => new Connection(file), MigrationError)
    assert.equal(old.pragma('user_version', { simple: true }), 2)
    assert.equal((old.prepare('PRAGMA table_info(repeat_plans)').all() as { name: string }[]).some(col => col.name === 'priority'), false)
    old.exec('DROP TRIGGER fail_v3')
    migrated = new Connection(file)
    assert.ok(migrated.backupPath)
    assert.deepEqual(migrated.db.prepare('SELECT id,title,priority,recurrence FROM repeat_plans').get(), { id: 'old-plan', title: '保留每日计划', priority: 'normal', recurrence: '{"type":"daily"}' })
    assert.deepEqual(migrated.db.prepare('SELECT id,title,priority,priority_override FROM task_occurrences').get(), { id: 'old-task', title: '保留原任务', priority: 'normal', priority_override: 0 })
    const result = JSON.parse((migrated.db.prepare('SELECT value FROM app_settings').get() as { value: string }).value)
    assert.equal(result.offworkTime, '19:30'); assert.equal(result.openAtLogin, false)
    assert.deepEqual(result.expandedSize, { width: 356, height: 480 })
  } finally { migrated?.close(); old.close(); rmSync(directory, { recursive: true }) }
})

test('system login item rejection and window failure roll back settings and system state; stale input never calls native APIs', () => {
  const f = fixture()
  let system = false, reject = false, failWindow = false, writes = 0
  const service = new SettingsService(f.settings, { read: () => system, write: enabled => {
    writes++; system = enabled; if (reject && enabled) throw new AppError('UNAVAILABLE', 'system rejected')
  } }, () => { if (failWindow) throw new AppError('UNAVAILABLE', 'window rejected') }, () => {})
  try {
    const before = f.settings.getSettings()
    reject = true
    assert.throws(() => service.update({ expectedVersion: before.version, patch: { openAtLogin: true } }), /system rejected/)
    assert.equal(system, false); assert.deepEqual(f.settings.getSettings(), before)
    reject = false
    const next = service.update({ expectedVersion: before.version, patch: { openAtLogin: true, reminderSoundEnabled: false } })
    assert.equal(system, true); assert.equal(next.reminderSoundEnabled, false)
    const count = writes
    assert.throws(() => service.update({ expectedVersion: before.version, patch: { openAtLogin: false } }), AppError)
    assert.equal(writes, count)
    failWindow = true
    assert.throws(() => service.update({ expectedVersion: next.version, patch: { openAtLogin: false, expandedSize: { width: 440, height: 610 } } }), /window rejected/)
    assert.equal(system, true); assert.deepEqual(f.settings.getSettings(), next)
    assert.throws(() => service.update({ expectedVersion: next.version, patch: { expandedSize: { width: 100, height: 610 } } }), AppError)
  } finally { f.close() }
})
