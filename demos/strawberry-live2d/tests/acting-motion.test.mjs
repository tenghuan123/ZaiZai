import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ActingMotion } from '../src/acting-motion.ts'
import { neutralPose } from '../src/scenes.ts'

test('gesture timing is consistent at 30 and 120 FPS and settles without overshooting', () => {
  const target = { ...neutralPose, ParamAngleZ: 16, ParamBodyAngleZ: 3, ParamArmL: .6 }
  const runs = [30, 120].map(fps => {
    const motion = new ActingMotion(neutralPose)
    for (let frame = 0; frame < fps; frame++) {
      motion.advance(target, 1 / fps)
      assert.ok(motion.pose.ParamArmL >= 0 && motion.pose.ParamArmL <= .6)
      assert.ok(motion.pose.ParamAngleZ >= 0 && motion.pose.ParamAngleZ <= 16)
    }
    return motion.pose
  })
  for (const id of Object.keys(target)) assert.ok(Math.abs(runs[0][id] - runs[1][id]) < 1e-10)
  assert.ok(Math.abs(runs[0].ParamAngleZ - 16) < .01)
})

test('head leads the body, pause preserves the pose, and returning to neutral restores the artwork', () => {
  const motion = new ActingMotion(neutralPose)
  const target = { ...neutralPose, ParamAngleZ: 16, ParamBodyAngleZ: 4, ParamArmL: .6 }
  motion.advance(target, .1)
  assert.ok(motion.pose.ParamAngleZ / 16 > motion.pose.ParamBodyAngleZ / 4)
  assert.ok(motion.pose.ParamArmL < .15)
  const paused = { ...motion.pose }
  motion.advance(target, 0)
  assert.deepEqual(motion.pose, paused)
  for (let frame = 0; frame < 300; frame++) motion.advance(neutralPose, 1 / 60)
  for (const id of Object.keys(neutralPose)) assert.ok(Math.abs(motion.pose[id] - neutralPose[id]) < 1e-10)
})
