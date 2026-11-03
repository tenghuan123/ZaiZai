import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILT_IN_PET_ID, BUILT_IN_PET_IDS, PET_ACTIONS, selectPetPlayback, spriteFrame } from '../src/shared/pet'
import { AppError } from '../src/main/domain/errors'
import { fixture } from './helpers'

test('pending reminders own pet presentation, including explicit water and stretch scenes', () => {
  const reaction = { id: 'completed-task', action: 'all_done' as const }
  assert.deepEqual(selectPetPlayback({ id: 'due', scene: 'water' }, reaction, 'react'),
    { key: 'reminder:due:water', action: 'drink_water', loop: true })
  assert.equal(selectPetPlayback({ id: 'due', scene: 'stretch' }, null, 'idle').action, 'stretch')
  assert.equal(selectPetPlayback({ id: 'due', scene: 'generic' }, reaction, 'drink_water').action, 'remind')
  assert.equal(selectPetPlayback(null, reaction, 'react').action, 'all_done')
  assert.equal(selectPetPlayback(null, null, 'react').loop, true)
  assert.deepEqual(selectPetPlayback(null, null, null), { key: 'idle', action: 'idle', loop: true })
})

test('a new click restarts the same response, but ordinary data refresh does not restart it', () => {
  const first = selectPetPlayback(null, { id: 'first', action: 'react' }, null)
  assert.deepEqual(selectPetPlayback(null, { id: 'first', action: 'react' }, null), first)
  assert.notEqual(selectPetPlayback(null, { id: 'second', action: 'react' }, null).key, first.key)
})

test('sprite playback holds the final one-shot frame and wraps loops without entering padding cells', () => {
  assert.deepEqual(spriteFrame(0, 56, 24, false), { index: 0, finished: false })
  assert.deepEqual(spriteFrame(2300, 56, 24, false), { index: 55, finished: false })
  assert.deepEqual(spriteFrame(2400, 56, 24, false), { index: 55, finished: true })
  assert.deepEqual(spriteFrame(4000, 96, 24, true), { index: 0, finished: false })
  assert.equal(spriteFrame(3990, 96, 24, true).index, 95)
})

for (const id of BUILT_IN_PET_IDS) test(`${id}: all seven bundled sheets match their manifest and registered identity`, () => {
  const folder = resolve('resources/pets', id)
  const manifest = JSON.parse(readFileSync(resolve(folder, 'manifest.json'), 'utf8'))
  assert.equal(manifest.id, id)
  assert.deepEqual(Object.keys(manifest.states), [...PET_ACTIONS])
  assert.ok(manifest.quotes.react.length > 0 && manifest.quotes.celebrate && manifest.quotes.allDone)
  for (const action of PET_ACTIONS) {
    const state = manifest.states[action]
    assert.equal(state.src, `${action}.png`)
    const png = readFileSync(resolve(folder, state.src))
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    assert.equal(png.readUInt32BE(16), state.cols * manifest.canvasSize[0])
    assert.equal(png.readUInt32BE(20), Math.ceil(state.frames / state.cols) * manifest.canvasSize[1])
    assert.ok(state.fps > 0 && state.frames > 0)
  }
})

test('UI pet selection accepts installed characters and rejects unknown IDs, stale changes and failed writes atomically', () => {
  const f = fixture()
  try {
    f.once({ title: '切换角色保留的任务' })
    const before = f.settings.getSettings()
    const tasks = f.tasks.getDay('2026-11-02')
    let next = before
    for (const petId of BUILT_IN_PET_IDS) {
      const previous = next
      next = f.settings.updateFromUI({ expectedVersion: previous.version, patch: { petId } })
      assert.deepEqual(next, { ...previous, version: previous.version + 1, petId })
    }
    assert.throws(() => f.settings.updateFromUI({ expectedVersion: before.version, patch: { petId: BUILT_IN_PET_ID } }),
      (error: unknown) => error instanceof AppError && error.code === 'CONFLICT')
    for (const petId of ['other-pack', '../hu-xianya', 'builtin-cat', '', null]) {
      assert.throws(() => f.settings.updateFromUI({ expectedVersion: next.version, patch: { petId } }),
        (error: unknown) => error instanceof AppError && error.code === 'VALIDATION' && error.field === 'petId')
    }
    assert.deepEqual(f.settings.getSettings(), next)
    f.connection.db.pragma('query_only=ON')
    assert.throws(() => f.settings.updateFromUI({ expectedVersion: next.version, patch: { petId: BUILT_IN_PET_ID } }), /readonly/)
    assert.deepEqual(f.settings.getSettings(), next)
    assert.deepEqual(f.tasks.getDay('2026-11-02'), tasks)
  } finally { f.close() }
})

test('the old built-in placeholder resolves to V3 without resetting preferences or unrelated pack IDs', () => {
  const f = fixture()
  try {
    const before = f.settings.getSettings()
    assert.equal(before.petId, BUILT_IN_PET_ID)
    const legacy = { ...before, petId: 'builtin-cat', offworkTime: '19:10', alwaysOnTop: false }
    f.connection.db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(legacy))
    assert.deepEqual(f.settings.getSettings(), { ...legacy, petId: BUILT_IN_PET_ID })
    f.settings.updateSettings({ displayMode: 'compact' })
    const saved = JSON.parse((f.connection.db.prepare('SELECT value FROM app_settings').get() as { value: string }).value)
    assert.equal(saved.petId, BUILT_IN_PET_ID)
    assert.equal(saved.offworkTime, '19:10')
    f.settings.updateSettings({ petId: 'other-pack' })
    assert.equal(f.settings.getSettings().petId, 'other-pack')
  } finally { f.close() }
})
