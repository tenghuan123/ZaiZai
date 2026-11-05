import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blinkOpenness, resolveEyeFrame } from '../src/eye-motion.ts'
import { ActingMotion } from '../src/acting-motion.ts'
import { neutralPose } from '../src/scenes.ts'
import { gestures } from '../src/gestures.ts'

test('only opaque painted eye keyforms are sent to the model, including former ghosting values', () => {
  for (let i = 0; i <= 1000; i++) {
    assert.ok([0, .5, 1].includes(resolveEyeFrame(i / 1000)))
  }
  assert.equal(resolveEyeFrame(.1), 0)
  assert.equal(resolveEyeFrame(.35), .5)
  assert.equal(resolveEyeFrame(.65), .5)
  assert.equal(resolveEyeFrame(.8), 1)
  assert.equal(resolveEyeFrame(1, 0), 0)
})

test('every blink fully closes and holds at 30, 60 and 120 FPS, independent of frame alignment', () => {
  assert.equal(blinkOpenness(0), 1)
  for (const fps of [30, 60, 120]) for (const alignment of [0, .25, .5, .75]) {
    const frames = []
    for (let i = 0; i < fps * .5; i++) {
      const time = 3.95 + (i + alignment) / fps
      frames.push(resolveEyeFrame(1, blinkOpenness(time)))
    }
    assert.equal(frames[0], 1)
    assert.equal(frames.at(-1), 1)
    assert.ok(frames.filter(value => value === 0).length / fps >= .06)
    const firstClosed = frames.indexOf(0), lastClosed = frames.lastIndexOf(0)
    assert.ok(frames.slice(firstClosed, lastClosed + 1).every(value => value === 0))
  }
})

test('closed-eye dialogue reaches full closure and stays closed; scripts do not linger on half-lidded eyes', () => {
  for (const gesture of Object.values(gestures)) for (const frame of gesture.frames) {
    for (const id of ['ParamEyeLOpen', 'ParamEyeROpen']) {
      if (frame.pose[id] !== undefined) assert.ok([0, 1].includes(frame.pose[id]))
    }
  }
  const motion = new ActingMotion(neutralPose)
  const target = { ...neutralPose, ParamEyeLOpen: 0 }
  for (let frame = 0; frame < 180; frame++) {
    motion.advance(target, 1 / 60)
    if (frame >= 12) assert.equal(resolveEyeFrame(motion.pose.ParamEyeLOpen), 0)
    assert.equal(resolveEyeFrame(motion.pose.ParamEyeROpen), 1)
  }
})
