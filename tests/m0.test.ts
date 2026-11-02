import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/main/database/store'
import { ReminderService } from '../src/main/reminders/service'
import { fitToWorkArea } from '../src/main/desktop/geometry'

test('SQLite preserves reminders, completion and window settings across reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'buddy-store-'))
  const file = join(directory, 'm0.sqlite3')
  let store = new Store(file)
  try {
    const item = store.schedule('重启后保留', 20_000, 10_000)
    store.setCompleted(item.id, true, 15_000)
    store.updateSettings({ displayMode: 'compact', position: { x: -900, y: 100 } })
    store.close()
    store = new Store(file)
    assert.equal(store.get(item.id)?.completedAt, 15_000)
    assert.equal(store.getSettings().displayMode, 'compact')
    assert.deepEqual(store.getSettings().position, { x: -900, y: 100 })
  } finally { store.close(); rmSync(directory, { recursive: true }) }
})

test('claim survives restart as uncertain and never submits a duplicate automatically', () => {
  const directory = mkdtempSync(join(tmpdir(), 'buddy-recovery-'))
  const file = join(directory, 'm0.sqlite3')
  const now = new Date(2026, 10, 2, 12).getTime()
  let store = new Store(file)
  try {
    const item = store.schedule('提交边界', now - 1000, now - 5000)
    assert.equal(store.claimDue(now, now - 60_000).length, 1)
    store.close()
    store = new Store(file)
    assert.equal(store.get(item.id)?.dispatchState, 'uncertain')
    assert.equal(store.claimDue(now + 1000, now - 60_000).length, 0)
    assert.equal(store.nextDue(), null)
  } finally { store.close(); rmSync(directory, { recursive: true }) }
})

test('reminders complete before due are excluded; undo does not repeat a submitted reminder', async () => {
  const store = new Store(':memory:')
  let now = new Date(2026, 10, 2, 12).getTime()
  const submitted: string[][] = []
  const service = new ReminderService(store, async items => {
    submitted.push(items.map(item => item.id)); return { state: 'submitted' }
  }, () => {}, error => { throw error }, () => now)
  try {
    const early = service.schedule('提前完成', 5)
    store.setCompleted(early.id, true, now)
    const due = service.schedule('到点提交', 5)
    now += 6000
    await service.checkNow('timer')
    assert.deepEqual(submitted, [[due.id]])
    store.setCompleted(due.id, true, now)
    store.setCompleted(due.id, false, now)
    await service.checkNow('resume')
    assert.equal(submitted.length, 1)
    assert.equal(store.get(due.id)?.acknowledgedAt, now)
  } finally { service.dispose(); store.close() }
})

test('resume coalesces current-day due reminders and leaves older dates without notification', async () => {
  const store = new Store(':memory:')
  const now = new Date(2026, 10, 2, 12).getTime()
  const calls: { ids: string[]; reason: string }[] = []
  const old = store.schedule('昨天事项', now - 24 * 3600_000, now - 25 * 3600_000)
  const first = store.schedule('喝水', now - 10_000, now - 60_000)
  const second = store.schedule('运动', now - 5000, now - 60_000)
  const service = new ReminderService(store, async (items, reason) => {
    calls.push({ ids: items.map(item => item.id), reason }); return { state: 'submitted' }
  }, () => {}, error => { throw error }, () => now)
  try {
    await service.checkNow('resume')
    assert.deepEqual(calls, [{ ids: [first.id, second.id], reason: 'resume' }])
    assert.equal(store.get(old.id)?.dispatchState, 'missed')
    assert.equal(store.get(old.id)?.completedAt, null)
    assert.equal(store.nextDue(), null)
  } finally { service.dispose(); store.close() }
})

test('unexpected native submission failure becomes visible failure and is not retried in a loop', async () => {
  const store = new Store(':memory:')
  const now = new Date(2026, 10, 2, 12).getTime()
  const item = store.schedule('失败保留', now - 1, now - 1000)
  const errors: unknown[] = []
  let count = 0
  const service = new ReminderService(store, async () => {
    count++; throw new Error('native failure')
  }, () => {}, error => { errors.push(error) }, () => now)
  try {
    await service.checkNow('timer')
    await service.checkNow('timer')
    assert.equal(count, 1)
    assert.equal(store.get(item.id)?.dispatchState, 'failed')
    assert.equal(store.get(item.id)?.lastError, 'native failure')
    assert.equal(errors.length, 1)
  } finally { service.dispose(); store.close() }
})

test('an old-date reminder updates the visible state even when no current reminder is submitted', async () => {
  const store = new Store(':memory:')
  const now = new Date(2026, 10, 2, 12).getTime()
  const item = store.schedule('昨日事项', now - 24 * 3600_000, now - 25 * 3600_000)
  let changes = 0
  const service = new ReminderService(store, async () => { throw new Error('old reminders must not submit') },
    () => { changes++ }, error => { throw error }, () => now)
  try {
    await service.checkNow('startup')
    assert.equal(store.get(item.id)?.dispatchState, 'missed')
    assert.equal(changes, 1)
  } finally { service.dispose(); store.close() }
})

test('overlapping resume checks do not duplicate a claimed notification', async () => {
  const store = new Store(':memory:')
  const now = new Date(2026, 10, 2, 12).getTime()
  store.schedule('只提交一次', now - 1, now - 1000)
  let submissions = 0
  let finish!: (outcome: { state: 'submitted' }) => void
  const service = new ReminderService(store, () => {
    submissions++
    return new Promise(resolve => { finish = resolve })
  }, () => {}, error => { throw error }, () => now)
  try {
    const first = service.checkNow('timer')
    await service.checkNow('resume')
    finish({ state: 'submitted' })
    await first
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(submissions, 1)
    assert.equal(store.list()[0].dispatchState, 'submitted')
  } finally { service.dispose(); store.close() }
})

test('shutdown prevents new checks and late native results from writing to a closed database', async () => {
  const store = new Store(':memory:')
  const now = new Date(2026, 10, 2, 12).getTime()
  store.schedule('退出', now - 1, now - 1000)
  let resolveDelivery!: (value: { state: 'submitted' }) => void
  let deliveries = 0
  const errors: unknown[] = []
  const service = new ReminderService(store, () => {
    deliveries++
    return new Promise(resolve => { resolveDelivery = resolve })
  }, () => {}, error => { errors.push(error) }, () => now)
  const checking = service.checkNow('timer')
  service.dispose()
  store.close()
  resolveDelivery({ state: 'submitted' })
  await checking
  await service.checkNow('resume')
  assert.equal(deliveries, 1)
  assert.deepEqual(errors, [])
})

test('window recovery clamps to work areas including negative-coordinate secondary screens', () => {
  assert.deepEqual(fitToWorkArea({ x: 2400, y: 1400, width: 356, height: 560 }, { x: 0, y: 30, width: 1440, height: 870 }),
    { x: 1084, y: 340, width: 356, height: 560 })
  assert.deepEqual(fitToWorkArea({ x: -3000, y: -200, width: 356, height: 224 }, { x: -1920, y: 0, width: 1920, height: 1080 }),
    { x: -1920, y: 0, width: 356, height: 224 })
})
