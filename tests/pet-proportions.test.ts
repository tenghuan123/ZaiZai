import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spriteSlices } from '../src/shared/pet-proportions'
import type { PetProportions } from '../src/shared/pet-proportions'

const root = 'resources/pets/strawberry-bunny-v3'
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'))
const calibration = JSON.parse(readFileSync(`${root}/source/proportions.json`, 'utf8'))
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`)

test('idle and packs without proportion calibration retain their original pixels and framing', () => {
  assert.equal(manifest.states.idle.proportions, undefined)
  assert.deepEqual(spriteSlices(320, 320, 95), [{ sourceY: 0, sourceHeight: 320, x: 0, y: 0, width: 320, height: 320 }])
})

test('each neutral action matches idle neck and soles while scaling its head uniformly', () => {
  for (const [action, source] of Object.entries(calibration.neutralLandmarks) as [string, { crownY: number; neckY: number; footY: number }][]) {
    const p = manifest.states[action].proportions as PetProportions
    const [body, head] = spriteSlices(320, 320, 0, p)
    close(body.y, calibration.reference.neckY)
    close(body.y + (source.footY - body.sourceY) * body.height / body.sourceHeight, calibration.reference.footY)
    close(head.width / 320, head.height / head.sourceHeight)
    close(head.y + head.height, body.y)
    close(head.x, body.x)
  }
})

test('pose registration preserves crouch and flight offsets instead of pinning the feet to the ground', () => {
  const p: PetProportions = { headScale: 0.9, bodyScale: 1.1, neckY: 160, footY: 306,
    poses: [[0, 160, 306], [1, 200, 306], [2, 130, 276], [3, 160, 306]] }
  for (const [frame, neck, foot] of p.poses!) {
    const [body, head] = spriteSlices(320, 320, frame, p)
    close(body.y + (foot - neck) * p.bodyScale, foot)
    close(head.y + head.height, body.y)
    assert.ok(head.sourceHeight > 0 && body.sourceHeight > 0)
  }
  const poses = p.poses!
  assert.ok(Math.min(...poses.map(pose => pose[2])) < p.footY - 20)
  assert.ok(Math.max(...poses.map(pose => pose[1])) > p.neckY + 30)
  assert.deepEqual(spriteSlices(320, 320, 3, p), spriteSlices(320, 320, 0, p))
})
