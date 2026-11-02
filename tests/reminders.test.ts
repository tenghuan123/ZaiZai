import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixture } from './helpers'
import { ReminderService } from '../src/main/reminders/service'
import type { DeliveryOutcome } from '../src/main/reminders/repository'

test('early completion is excluded, same-time due items coalesce, and undo never resubmits a processed reminder', async () => {
  const f = fixture()
  const submitted: string[][] = []
  const service = new ReminderService(f.records, f.tasks, async items => {
    submitted.push(items.map(item => item.id)); return { state: 'submitted' }
  }, () => {}, error => { throw error }, f.clock)
  try {
    const early = f.once({ scheduledTime: '13:00' })
    f.tasks.setCompleted({ id: early.id }, true)
    const a = f.once({ title: '喝水', scheduledTime: '13:00' })
    const b = f.once({ title: '活动', scheduledTime: '13:00' })
    f.setTime('2026-11-02', '13:01')
    await service.checkNow('timer')
    assert.deepEqual(submitted[0].sort(), [a.id, b.id].sort())
    f.tasks.setCompleted({ id: a.id }, true)
    f.tasks.setCompleted({ id: a.id }, false)
    await service.checkNow('resume')
    assert.equal(submitted.length, 1)
    assert.ok(f.records.listDay(f.clock().today).find(item => item.id === a.id)?.acknowledgedAt)
    assert.ok(!f.records.active(f.clock()).includes(a.id))
    assert.ok(f.records.active(f.clock()).includes(b.id))
  } finally { service.dispose(); f.close() }
})

test('claim restart becomes uncertain and preserves the same reminder ID without automatic retry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-m1-recovery-')), file = join(dir, 'data.sqlite3')
  let f = fixture(file)
  try {
    const item = f.once({ scheduledTime: '11:00' })
    const claimed = f.records.claimDue(f.clock())
    assert.equal(claimed.length, 1)
    f.close(); f = fixture(file)
    assert.equal(f.records.recoverClaims(), 1)
    assert.equal(f.records.listDay(f.clock().today)[0].dispatchState, 'uncertain')
    assert.deepEqual(f.connection.db.prepare('SELECT id FROM reminder_dispatches').get(), { id: claimed[0].dispatchId })
    assert.equal(f.records.claimDue(f.clock()).length, 0)
    assert.deepEqual(f.records.active(f.clock()), [item.id])
    assert.equal(f.records.nextDue(f.clock().today), null)
  } finally { f.close(); rmSync(dir, { recursive: true }) }
})

test('resume only submits current day and leaves old tasks incomplete without fabricated dispatch records', async () => {
  const f = fixture()
  const submitted: string[][] = []
  const service = new ReminderService(f.records, f.tasks, async items => {
    submitted.push(items.map(item => item.id)); return { state: 'submitted' }
  }, () => {}, error => { throw error }, f.clock)
  try {
    const old = f.once({ scheduledDate: '2026-11-01', scheduledTime: '11:00' })
    const today = f.once({ scheduledTime: '11:00' })
    await service.checkNow('resume')
    assert.deepEqual(submitted, [[today.id]])
    assert.equal(f.repository.get(old.id)?.status, 'pending')
    assert.equal(f.connection.db.prepare('SELECT id FROM reminder_dispatches WHERE occurrence_id=?').get(old.id), undefined)
    assert.equal(f.records.nextDue(f.clock().today), null)
  } finally { service.dispose(); f.close() }
})

test('unavailable and thrown native failures remain actionable without a polling retry loop', async () => {
  for (const unavailable of [true, false]) {
    const f = fixture()
    let calls = 0
    const errors: unknown[] = []
    const service = new ReminderService(f.records, f.tasks, async () => {
      calls++
      if (unavailable) return { state: 'unavailable', error: '系统不支持' }
      throw new Error('native failure')
    }, () => {}, error => errors.push(error), f.clock)
    try {
      const item = f.once({ scheduledTime: '11:00' })
      await service.checkNow('timer'); await service.checkNow('resume')
      assert.equal(calls, 1)
      assert.equal(f.records.listDay(f.clock().today)[0].dispatchState, unavailable ? 'unavailable' : 'failed')
      assert.equal(errors.length, unavailable ? 0 : 1)
      assert.deepEqual(f.records.active(f.clock()), [item.id])
    } finally { service.dispose(); f.close() }
  }
})

test('completion and reminder acknowledgment roll back together when either write fails', () => {
  const f = fixture()
  try {
    const item = f.once({ scheduledTime: '11:00' })
    const [claim] = f.records.claimDue(f.clock())
    f.records.finishDispatch([claim.dispatchId], { state: 'submitted' }, f.clock().nowMs)
    f.connection.db.exec("CREATE TRIGGER reject_ack BEFORE UPDATE OF acknowledged_at_ms ON reminder_dispatches BEGIN SELECT RAISE(ABORT,'write failed'); END")
    assert.throws(() => f.tasks.setCompleted({ id: item.id }, true), /write failed/)
    assert.equal(f.repository.get(item.id)?.status, 'pending')
    assert.equal(f.records.listDay(f.clock().today)[0].acknowledgedAt, null)
  } finally { f.close() }
})

test('overlapping async checks and a late result cannot affect a newly scheduled version', async () => {
  const f = fixture()
  let calls = 0
  let finish!: (outcome: DeliveryOutcome) => void
  const service = new ReminderService(f.records, f.tasks, () => {
    calls++; return new Promise(resolve => { finish = resolve })
  }, () => {}, error => { throw error }, f.clock)
  try {
    const future = f.once({ scheduledDate: '2026-11-03', scheduledTime: '10:00' })
    // A system clock rollback makes an already claimed schedule future again, allowing a legitimate edit.
    f.setTime('2026-11-03', '10:01')
    const checking = service.checkNow('timer')
    await service.checkNow('resume')
    f.setTime('2026-11-03', '09:00')
    const updated = f.tasks.updateOnce({ id: future.id, expectedVersion: future.version, title: future.title,
      scheduledDate: '2026-11-03', scheduledTime: '11:00', reminderEnabled: true, scene: 'generic' })
    finish({ state: 'submitted' }); await checking
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(calls, 1)
    assert.equal(updated.scheduleVersion, 2)
    assert.equal(f.records.listDay(f.clock().today)[0].dispatchState, 'pending')
    assert.equal(f.records.nextDue(f.clock().today), updated.dueAtMs)
  } finally { service.dispose(); f.close() }
})

test('shutdown prevents late native results from writing after database close', async () => {
  const f = fixture()
  let finish!: (outcome: DeliveryOutcome) => void
  const errors: unknown[] = []
  let calls = 0
  const service = new ReminderService(f.records, f.tasks, () => {
    calls++; return new Promise(resolve => { finish = resolve })
  }, () => {}, error => errors.push(error), f.clock)
  f.once({ scheduledTime: '11:00' })
  const checking = service.checkNow('timer')
  service.dispose(); f.close()
  finish({ state: 'submitted' }); await checking
  await service.checkNow('resume')
  assert.equal(calls, 1)
  assert.deepEqual(errors, [])
})

test('completion before due followed by undo still waits normally; disabled and untimed tasks never dispatch', () => {
  const f = fixture()
  try {
    const future = f.once({ scheduledTime: '15:00' })
    f.tasks.setCompleted({ id: future.id }, true); f.tasks.setCompleted({ id: future.id }, false)
    f.once({ scheduledTime: '11:00', reminderEnabled: false }); f.once()
    assert.deepEqual(f.records.claimDue(f.clock()), [])
    f.setTime('2026-11-02', '15:01')
    assert.deepEqual(f.records.claimDue(f.clock()).map(item => item.id), [future.id])
  } finally { f.close() }
})
