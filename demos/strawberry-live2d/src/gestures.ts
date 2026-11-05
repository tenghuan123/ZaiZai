import { neutralPose, type ActingPose } from './scenes.ts'

export type GestureId = 'explain' | 'greet' | 'curious' | 'smile' | 'sleepy'
interface Keyframe { at: number; pose: Partial<ActingPose> }
export interface Gesture {
  title: string
  description: string
  durationMs: number
  frames: Keyframe[]
}

// Shoulder, elbow and wrist have independent keys in the articulated rig. Each clip
// includes its return, so composition never leaves an arm or closed eye behind.
export const gestures: Record<GestureId, Gesture> = {
  explain: {
    title: '轻抬手', description: '手先起，头轻轻跟上，停一下再放回。', durationMs: 3200,
    frames: [
      { at: 0, pose: {} },
      { at: .1, pose: { ParamArmL: .15, ParamElbowL: .04, ParamAngleX: -1 } },
      { at: .24, pose: { ParamArmL: .2, ParamElbowL: .12, ParamAngleX: -4, ParamAngleZ: -6 } },
      { at: .65, pose: { ParamArmL: .18, ParamElbowL: .1, ParamAngleX: -3, ParamAngleZ: -6 } },
      { at: .8, pose: { ParamArmL: .1, ParamElbowL: .04, ParamAngleX: -1, ParamAngleZ: -3 } },
      { at: 1, pose: {} }
    ]
  },
  greet: {
    title: '挥手招呼', description: '抬臂、弯肘，手在脸旁轻摆两次，再慢慢放下。', durationMs: 4600,
    frames: [
      { at: 0, pose: {} },
      { at: .1, pose: { ParamArmL: .4, ParamElbowL: .25, ParamAngleZ: -2, ParamMouthForm: .2 } },
      { at: .24, pose: { ParamArmL: .95, ParamElbowL: 1, ParamAngleZ: -6, ParamMouthForm: .35 } },
      { at: .34, pose: { ParamArmL: .95, ParamElbowL: 1, ParamWristL: -.65, ParamAngleZ: -6, ParamMouthForm: .35 } },
      { at: .44, pose: { ParamArmL: .95, ParamElbowL: 1, ParamWristL: .65, ParamAngleZ: -5, ParamMouthForm: .35 } },
      { at: .54, pose: { ParamArmL: .95, ParamElbowL: 1, ParamWristL: -.65, ParamAngleZ: -6, ParamMouthForm: .35 } },
      { at: .64, pose: { ParamArmL: .95, ParamElbowL: 1, ParamWristL: .65, ParamAngleZ: -5, ParamMouthForm: .35 } },
      { at: .72, pose: { ParamArmL: .9, ParamElbowL: .95, ParamAngleZ: -4, ParamMouthForm: .3 } },
      { at: .86, pose: { ParamArmL: .35, ParamElbowL: .45, ParamAngleZ: -2, ParamMouthForm: .2 } },
      { at: 1, pose: {} }
    ]
  },
  curious: {
    title: '歪头思考', description: '轻轻歪头看你，留一点反应时间。', durationMs: 3400,
    frames: [
      { at: 0, pose: {} },
      { at: .1, pose: { ParamAngleX: -2, ParamAngleZ: 6 } },
      { at: .28, pose: { ParamAngleX: -3, ParamAngleZ: 12, ParamMouthForm: .6 } },
      { at: .72, pose: { ParamAngleX: -3, ParamAngleZ: 12, ParamMouthForm: .6 } },
      { at: .88, pose: { ParamAngleX: -1, ParamAngleZ: 4, ParamMouthForm: .3 } },
      { at: 1, pose: {} }
    ]
  },
  smile: {
    title: '闭眼偷笑', description: '先露出笑意，闭眼停留，再慢慢睁开。', durationMs: 3800,
    frames: [
      { at: 0, pose: {} },
      { at: .08, pose: { ParamAngleZ: -4, ParamMouthForm: .6 } },
      { at: .2, pose: { ParamAngleZ: -12, ParamMouthForm: 1, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamArmL: .06 } },
      { at: .74, pose: { ParamAngleZ: -12, ParamMouthForm: 1, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamArmL: .06 } },
      { at: .86, pose: { ParamAngleZ: -6, ParamMouthForm: .7, ParamEyeLOpen: 0, ParamEyeROpen: 0 } },
      { at: 1, pose: {} }
    ]
  },
  sleepy: {
    title: '困困收尾', description: '缓缓歪头、闭眼休息，最后回到自然姿态。', durationMs: 4400,
    frames: [
      { at: 0, pose: {} },
      { at: .1, pose: { ParamAngleZ: 4, ParamMouthForm: .2 } },
      { at: .26, pose: { ParamAngleZ: 12, ParamBodyAngleZ: 1.2, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamMouthForm: .6 } },
      { at: .72, pose: { ParamAngleZ: 12, ParamBodyAngleZ: 1.2, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamMouthForm: .6 } },
      { at: .85, pose: { ParamAngleZ: 5, ParamBodyAngleZ: .3, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamMouthForm: .4 } },
      { at: 1, pose: {} }
    ]
  }
}

/** Audio time (or the silent preview clock) is the sole timeline authority. */
export function sampleGesture(id: GestureId, progress: number): ActingPose {
  const time = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  const frames = gestures[id].frames
  const next = frames.findIndex(frame => frame.at >= time)
  if (next <= 0) return { ...neutralPose, ...frames[0].pose }
  const start = frames[next - 1], end = frames[next]
  const fraction = (time - start.at) / (end.at - start.at)
  const blend = fraction * fraction * (3 - 2 * fraction)
  const pose = { ...neutralPose }
  for (const key of Object.keys(pose) as (keyof ActingPose)[]) {
    const from = start.pose[key] ?? neutralPose[key], to = end.pose[key] ?? neutralPose[key]
    pose[key] = from + (to - from) * blend
  }
  return pose
}
