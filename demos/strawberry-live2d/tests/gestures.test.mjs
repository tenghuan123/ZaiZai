import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gestures, sampleGesture } from '../src/gestures.ts'
import { neutralPose, scenes } from '../src/scenes.ts'
import { ActingMotion } from '../src/acting-motion.ts'
import { resolveEyeFrame } from '../src/eye-motion.ts'

test('every reusable gesture stays in the visually checked model range and returns to the original pose', () => {
  const bounds = {
    ParamAngleX: [-4, 4], ParamAngleZ: [-12, 12], ParamBodyAngleZ: [-1.5, 1.5],
    ParamArmL: [0, .6], ParamArmR: [0, .6], ParamMouthForm: [0, 1],
    ParamEyeLOpen: [0, 1], ParamEyeROpen: [0, 1]
  }
  for (const [id, gesture] of Object.entries(gestures)) {
    assert.deepEqual(sampleGesture(id, 0), neutralPose)
    assert.deepEqual(sampleGesture(id, 1), neutralPose)
    assert.deepEqual(sampleGesture(id, 5), neutralPose)
    assert.deepEqual(sampleGesture(id, Number.NaN), neutralPose)
    assert.ok(gesture.frames.every((frame, i) => !i || frame.at > gesture.frames[i - 1].at))
    for (let i = 0; i <= 1000; i++) for (const [key, value] of Object.entries(sampleGesture(id, i / 1000))) {
      assert.ok(Number.isFinite(value) && value >= bounds[key][0] && value <= bounds[key][1], `${id}: ${key} = ${value}`)
    }
  }
  for (const scene of scenes) for (const beat of scene.beats) assert.ok(gestures[beat.gesture])
})

test('complete gesture playback settles at neutral at 30 and 120 FPS, including independent arms and eyes', () => {
  for (const [id, gesture] of Object.entries(gestures)) for (const fps of [30, 120]) {
    const motion = new ActingMotion(neutralPose), duration = gesture.durationMs / 1000
    let closed = 0, longestHalf = 0, half = 0
    for (let frame = 0; frame < (duration + 1) * fps; frame++) {
      const progress = Math.min(1, frame / fps / duration)
      motion.advance(sampleGesture(id, progress), 1 / fps)
      const eye = resolveEyeFrame(motion.pose.ParamEyeLOpen)
      closed += Number(eye === 0)
      half = eye === .5 ? half + 1 : 0; longestHalf = Math.max(longestHalf, half)
      assert.equal(motion.pose.ParamArmR, 0)
    }
    for (const key of Object.keys(neutralPose)) assert.ok(Math.abs(motion.pose[key] - neutralPose[key]) < .003, `${id} failed to restore ${key}`)
    if (id === 'smile' || id === 'sleepy') {
      assert.ok(closed / fps > 1.5, `${id} never clearly holds closed`)
      assert.ok(longestHalf / fps < .4, `${id} lingers half closed`)
    }
  }
})
