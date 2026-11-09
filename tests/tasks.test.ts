import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fixture, saved } from './helpers'
import { AppError } from '../src/main/domain/errors'
import { dueAt, nextDayStart, clockSnapshot } from '../src/main/domain/time'

function conflict(action: () => unknown): void { assert.throws(action, (error: unknown) => error instanceof AppError && error.code === 'CONFLICT') }

test('one-off creation retries, completion and deletion are idempotent; only completion can celebrate', () => {
  const f = fixture()
  try {
    const requestId = randomUUID()
    const item = f.once({ requestId, title: '  整理文件  ' })
    assert.equal(item.title, '整理文件')
    assert.equal(f.once({ requestId }).id, item.id)
    const first = f.tasks.setCompleted({ id: item.id }, true)
    assert.deepEqual(first.before, { completed: 0, total: 1, percentage: 0 })
    assert.equal(first.allCompleted, true)
    assert.equal(f.tasks.setCompleted({ id: item.id }, true).changed, false)
    assert.equal(f.tasks.setCompleted({ id: item.id }, true).allCompleted, false)
    assert.equal(f.tasks.setCompleted({ id: item.id }, false).occurrence.completedAtMs, null)
    const deleted = f.tasks.removeOccurrence({ id: item.id })
    assert.equal(deleted.cancelReason, 'user_removed')
    assert.equal(f.tasks.removeOccurrence({ id: item.id }).version, deleted.version)
    conflict(() => f.tasks.setCompleted({ id: item.id }, true))
    assert.deepEqual(f.tasks.getDay('2026-11-02').progress, { completed: 0, total: 0, percentage: 0 })
  } finally { f.close() }
})

test('main-process validation rejects invalid dates, time, Unicode title length, duplicate times and arbitrary fields', () => {
  const f = fixture()
  try {
    for (const scheduledDate of ['2026-02-30', '2026-2-01', '0000-01-01']) assert.throws(() => f.once({ scheduledDate }), AppError)
    assert.throws(() => f.once({ scheduledTime: '24:00' }), AppError)
    assert.throws(() => f.once({ title: '😀'.repeat(61) }), AppError)
    assert.equal([...f.once({ title: '😀'.repeat(60) }).title].length, 60)
    assert.throws(() => f.plan({ times: ['10:00', '10:00'] }), AppError)
    assert.throws(() => f.plan({ times: [] }), AppError)
    assert.throws(() => f.plan({ startDate: '2026-11-03', endDate: '2026-11-02' }), AppError)
    assert.throws(() => f.tasks.createOnce({ title: 'x', path: '/tmp' }), AppError)
    assert.throws(() => f.tasks.createOnce({ requestId: randomUUID(), title: '无效分类', category: 'other',
      scheduledDate: f.clock().today, scheduledTime: null, reminderEnabled: false }), AppError)
    assert.throws(() => f.tasks.setCompleted({ id: randomUUID() }, 'false'), AppError)
  } finally { f.close() }
})

test('daily report uses local completion dates across scheduled days and excludes undone or removed tasks', () => {
  const f = fixture()
  try {
    const yesterday = '2026-11-01', today = '2026-11-02', tomorrow = '2026-11-03'
    const previous = f.once({ scheduledDate: today })
    const work = f.once({ scheduledDate: yesterday, category: 'work' })
    const life = f.once({ category: 'life' })
    const uncategorized = f.once()
    f.setTime(yesterday, '23:59')
    f.tasks.setCompleted({ id: previous.id }, true)
    f.setTime(today, '00:00')
    const first = f.tasks.setCompleted({ id: work.id }, true).occurrence
    f.setTime(today, '09:00')
    f.tasks.setCompleted({ id: life.id }, true)
    f.tasks.setCompleted({ id: uncategorized.id }, true)
    f.setTime(tomorrow, '00:00')
    f.tasks.setCompleted({ id: f.once().id }, true)
    f.setTime(today)
    const report = f.tasks.getDailyReport()
    assert.equal(report.date, today)
    assert.equal(report.timeZone, 'Asia/Shanghai')
    assert.deepEqual(report.items[0], { id: work.id, title: work.title, category: 'work', completedAtMs: first.completedAtMs })
    assert.deepEqual(new Set(report.items.slice(1).map(item => item.category)), new Set(['life', null]))
    f.tasks.setCompleted({ id: life.id }, false)
    f.tasks.removeOccurrence({ id: uncategorized.id })
    assert.deepEqual(f.tasks.getDailyReport().items.map(item => item.id), [work.id])
    const fields = { id: first.id, title: first.title, scheduledDate: yesterday, scheduledTime: null, reminderEnabled: false }
    const saved = f.tasks.updateOnce({ ...fields, expectedVersion: first.version })
    assert.equal(saved.category, 'work')
    f.tasks.updateOnce({ ...fields, expectedVersion: saved.version, category: null })
    assert.equal(f.tasks.getDailyReport().items[0].category, null)
  } finally { f.close() }
})

test('plan categories follow edits through previews, completed history and ending without rewriting completion', () => {
  const f = fixture()
  try {
    const plan = f.plan({ category: 'life', times: ['10:00'] })
    const today = f.clock().today, tomorrow = '2026-11-03'
    const [item] = saved(f.tasks.getDay(today))
    assert.equal(item.category, 'life')
    const [preview] = f.tasks.getDay(tomorrow).items
    assert.equal(preview.kind === 'preview' && preview.category, 'life')
    const completed = f.tasks.setCompleted({ id: item.id }, true).occurrence
    const fields = { id: plan.id, title: plan.title, startDate: plan.startDate, endDate: plan.endDate,
      reminderEnabled: plan.reminderEnabled, slots: plan.slots.map(slot => ({ id: slot.id, localTime: slot.localTime })) }
    const updated = f.tasks.updatePlan({ ...fields, expectedVersion: plan.version, category: 'work' })
    assert.equal(f.tasks.updatePlan({ ...fields, expectedVersion: updated.version }).category, 'work')
    const [updatedPreview] = f.tasks.getDay(tomorrow).items
    assert.equal(updatedPreview.kind === 'preview' && updatedPreview.category, 'work')
    f.tasks.endPlan(plan.id)
    assert.equal(f.tasks.getDay(tomorrow).items.length, 0)
    assert.deepEqual(saved(f.tasks.getDay(today))[0], { ...completed, category: 'work' })
    assert.equal(f.tasks.getDailyReport().items[0].category, 'work')
  } finally { f.close() }
})

test('multi-slot plans generate once per source identity; read-only date queries never generate history', () => {
  const f = fixture()
  try {
    const plan = f.plan()
    assert.equal(saved(f.tasks.getDay('2026-11-02')).length, 2)
    for (let n = 0; n < 3; n++) f.tasks.ensureToday()
    const today = saved(f.tasks.getDay('2026-11-02'))
    assert.equal(today.length, 2)
    f.tasks.setCompleted({ id: today[0].id }, true)
    assert.equal(f.tasks.getDay('2026-11-02').progress.completed, 1)
    const changes = f.connection.db.prepare('SELECT total_changes() AS n').get()
    for (let n = 0; n < 3; n++) {
      assert.equal(f.tasks.getDay('2026-11-03').items.length, 2)
      assert.equal(f.tasks.getDay('2026-11-01').activated, false)
      assert.equal(f.tasks.getDay('2026-11-01').items.length, 0)
    }
    assert.deepEqual(f.connection.db.prepare('SELECT total_changes() AS n').get(), changes)
    f.setTime('2026-11-04')
    f.tasks.coordinateDay()
    assert.equal(f.tasks.getDay('2026-11-03').activated, false)
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 0)
    assert.equal(saved(f.tasks.getDay('2026-11-04')).length, 2)
    assert.equal(f.repository.plan(plan.id)?.version, 1)
  } finally { f.close() }
})

test('removing and moving recurring occurrences never recreates a source; dates roll back without duplicates', () => {
  const f = fixture()
  try {
    f.plan()
    const old = saved(f.tasks.getDay('2026-11-02'))
    f.tasks.removeOccurrence({ id: old[0].id })
    f.setTime('2026-11-03')
    f.tasks.ensureToday()
    const moved = f.tasks.moveToToday({ id: old[1].id })
    assert.equal(moved.sourceDate, '2026-11-02')
    assert.equal(moved.scheduledTime, null)
    assert.equal(moved.id, old[1].id)
    assert.equal(f.tasks.moveToToday({ id: moved.id }).version, moved.version)
    assert.equal(saved(f.tasks.getDay('2026-11-03')).length, 3)
    f.setTime('2026-11-02')
    f.tasks.ensureToday()
    assert.equal(f.tasks.getDay('2026-11-02').items.length, 0)
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 3)
  } finally { f.close() }
})

test('slot edits preserve already due, completed and moved facts, but reschedule future pending slots with stable IDs', () => {
  const f = fixture()
  try {
    let plan = f.plan({ times: ['10:00', '14:00', '15:00'] })
    const original = saved(f.tasks.getDay('2026-11-02'))
    f.tasks.setCompleted({ id: original.find(item => item.scheduledTime === '14:00')!.id }, true)
    plan = f.tasks.updatePlan({ expectedVersion: plan.version, slots: plan.slots.map((slot, index) => ({ id: slot.id, localTime: ['13:00', '16:00', '17:00'][index] })),
      id: plan.id, title: '新标题', startDate: plan.startDate, endDate: plan.endDate, reminderEnabled: false, scene: plan.scene,
    })
    const today = saved(f.tasks.getDay('2026-11-02'))
    assert.equal(today.length, 3)
    assert.deepEqual(today.find(item => item.scheduledTime === '10:00'), original.find(item => item.scheduledTime === '10:00'))
    assert.equal(today.find(item => item.status === 'completed')?.scheduledTime, '14:00')
    const future = today.find(item => item.scheduledTime === '17:00')!
    assert.equal(future.id, original.find(item => item.scheduledTime === '15:00')?.id)
    assert.equal(future.title, '新标题')
    assert.equal(future.reminderEnabled, false)
    assert.equal(future.scheduleVersion, 2)
    assert.deepEqual(f.tasks.getDay('2026-11-03').items.map(item => item.kind === 'preview' ? item.scheduledTime : ''), ['13:00', '16:00', '17:00'])
    assert.equal(plan.version, 2)
  } finally { f.close() }
})

test('pause/resume/end preserve due history and user cancellation; no backlog is generated during pause', () => {
  const f = fixture()
  try {
    const plan = f.plan({ times: ['10:00', '13:00', '15:00', '17:00'] })
    const today = saved(f.tasks.getDay('2026-11-02'))
    const removed = today.find(item => item.scheduledTime === '17:00')!
    f.tasks.removeOccurrence({ id: removed.id })
    const paused = f.tasks.setPaused(plan.id, true)
    assert.equal(f.tasks.setPaused(plan.id, true).version, paused.version)
    assert.deepEqual(saved(f.tasks.getDay('2026-11-02')).map(item => item.scheduledTime), ['10:00'])
    f.setTime('2026-11-02', '14:00')
    f.tasks.setPaused(plan.id, false)
    assert.deepEqual(saved(f.tasks.getDay('2026-11-02')).map(item => item.scheduledTime), ['10:00', '15:00'])
    assert.equal(f.repository.get(today.find(item => item.scheduledTime === '13:00')!.id)?.status, 'cancelled')
    assert.equal(f.repository.get(removed.id)?.cancelReason, 'user_removed')
    f.tasks.endPlan(plan.id)
    assert.deepEqual(saved(f.tasks.getDay('2026-11-02')).map(item => item.scheduledTime), ['10:00'])
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 0)
    conflict(() => f.tasks.setPaused(plan.id, false))
  } finally { f.close() }
})

test('future previews materialize only on commands and honor stale versions and cancelled source identities', () => {
  const f = fixture()
  try {
    const plan = f.plan()
    const preview = f.tasks.getDay('2026-11-03').items[0]
    assert.equal(preview.kind, 'preview')
    const completed = f.tasks.setCompleted(preview.ref, true)
    assert.equal(completed.before.total, 2)
    assert.equal(completed.after.total, 2)
    assert.equal(completed.allCompleted, false)
    assert.equal(f.tasks.getDay('2026-11-03').activated, false)
    const other = f.tasks.getDay('2026-11-03').items.find(item => item.kind === 'preview')!
    const moved = f.tasks.moveToToday(other.ref)
    assert.equal(moved.sourceDate, '2026-11-03')
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 1)
    f.tasks.removeOccurrence({ id: completed.occurrence.id })
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 0)
    f.tasks.setPaused(plan.id, true)
    conflict(() => f.tasks.setCompleted(preview.ref, false))
  } finally { f.close() }
})

test('one-off edits use optimistic versions and change reminder versions only for real scheduling changes', () => {
  const f = fixture()
  try {
    const item = f.once({ scheduledTime: '15:00' })
    const edited = f.tasks.updateOnce({ id: item.id, expectedVersion: item.version, title: '新名称',
      scheduledDate: item.scheduledDate, scheduledTime: '15:00', reminderEnabled: false, scene: 'generic' })
    assert.equal(edited.scheduleVersion, 1)
    conflict(() => f.tasks.updateOnce({ id: item.id, expectedVersion: 1, title: '旧草稿',
      scheduledDate: item.scheduledDate, scheduledTime: '16:00', reminderEnabled: true, scene: 'generic' }))
    const scheduled = f.tasks.updateOnce({ id: item.id, expectedVersion: edited.version, title: '新名称',
      scheduledDate: item.scheduledDate, scheduledTime: '16:00', reminderEnabled: true, scene: 'generic' })
    assert.equal(scheduled.scheduleVersion, 2)
    assert.equal(scheduled.sourceTime, '15:00')
  } finally { f.close() }
})

test('plan creation keys deduplicate; date limits are inclusive; new past slots start after today', () => {
  const f = fixture()
  try {
    const requestId = randomUUID()
    let plan = f.plan({ requestId, endDate: '2026-11-03', times: ['15:00'] })
    assert.equal(f.plan({ requestId }).id, plan.id)
    plan = f.tasks.updatePlan({ id: plan.id, expectedVersion: plan.version, title: plan.title, startDate: plan.startDate,
      endDate: plan.endDate, reminderEnabled: true, scene: plan.scene,
      slots: [{ id: plan.slots[0].id, localTime: '15:00' }, { localTime: '09:00' }] })
    assert.deepEqual(saved(f.tasks.getDay('2026-11-02')).map(item => item.scheduledTime), ['15:00'])
    assert.equal(f.tasks.getDay('2026-11-03').items.length, 2)
    assert.equal(f.tasks.getDay('2026-11-04').items.length, 0)
    f.setTime('2026-11-03')
    f.tasks.ensureToday()
    assert.equal(saved(f.tasks.getDay('2026-11-03')).length, 2)
    assert.equal(plan.slots.filter(slot => slot.active).length, 2)
  } finally { f.close() }
})

test('slot swaps are atomic, while removing and readding a slot creates a new identity', () => {
  const f = fixture()
  try {
    let plan = f.plan({ times: ['15:00', '17:00'] })
    const before = plan.slots.map(slot => slot.id)
    plan = f.tasks.updatePlan({ id: plan.id, expectedVersion: plan.version, title: plan.title, startDate: plan.startDate,
      endDate: null, reminderEnabled: true, scene: plan.scene, slots: [{ id: before[0], localTime: '17:00' }, { id: before[1], localTime: '15:00' }] })
    assert.deepEqual(plan.slots.map(slot => slot.id), before)
    plan = f.tasks.updatePlan({ id: plan.id, expectedVersion: plan.version, title: plan.title, startDate: plan.startDate,
      endDate: null, reminderEnabled: true, scene: plan.scene, slots: [{ id: before[0], localTime: '17:00' }, { localTime: '15:00' }] })
    assert.equal(plan.slots.find(slot => slot.id === before[1])?.active, false)
    assert.notEqual(plan.slots.find(slot => slot.active && slot.localTime === '15:00')?.id, before[1])
    assert.equal(f.tasks.getDay('2026-11-02').items.length, 2)
  } finally { f.close() }
})

test('plan write failure rolls back slots, day activation, occurrences and plan version', () => {
  const f = fixture()
  try {
    f.connection.db.exec("CREATE TRIGGER fail_slot BEFORE INSERT ON plan_slots WHEN NEW.sort_order=1 BEGIN SELECT RAISE(ABORT,'disk failure'); END")
    assert.throws(() => f.plan(), /disk failure/)
    assert.equal(f.tasks.listPlans().length, 0)
    assert.equal(f.tasks.getDay('2026-11-02').activated, false)
    assert.equal(f.tasks.getDay('2026-11-02').items.length, 0)
  } finally { f.close() }
})

test('time-zone changes only recalculate future pending arrangements; completed history stays fixed', () => {
  const f = fixture()
  try {
    const past = f.once({ scheduledTime: '10:00' })
    const completed = f.once({ scheduledTime: '16:00' })
    f.tasks.setCompleted({ id: completed.id }, true)
    const future = f.once({ scheduledTime: '17:00' })
    f.setZone('Asia/Tokyo')
    f.tasks.coordinateDay()
    assert.deepEqual(f.repository.get(past.id), past)
    assert.equal(f.repository.get(completed.id)?.scheduleZone, 'Asia/Shanghai')
    assert.equal(f.repository.get(future.id)?.scheduleZone, 'Asia/Tokyo')
    assert.equal(f.repository.get(future.id)?.dueAtMs, dueAt('2026-11-02', '17:00', 'Asia/Tokyo'))
    assert.equal(f.repository.get(future.id)?.sourceZone, 'Asia/Shanghai')
    assert.equal(f.repository.get(future.id)?.scheduleVersion, 2)
  } finally { f.close() }
})

test('DST uses the earlier repeated time, shifts missing time forward, and computes real local day boundaries', () => {
  assert.equal(new Date(dueAt('2026-11-01', '01:30', 'America/New_York')).toISOString(), '2026-11-01T05:30:00.000Z')
  assert.equal(new Date(dueAt('2026-03-08', '02:30', 'America/New_York')).toISOString(), '2026-03-08T07:30:00.000Z')
  const spring = clockSnapshot(dueAt('2026-03-08', '00:00', 'America/New_York'), 'America/New_York')
  const autumn = clockSnapshot(dueAt('2026-11-01', '00:00', 'America/New_York'), 'America/New_York')
  assert.equal(nextDayStart(spring) - spring.nowMs, 23 * 3600_000)
  assert.equal(nextDayStart(autumn) - autumn.nowMs, 25 * 3600_000)
})
