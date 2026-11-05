import type { ActingPose } from './scenes'

const response: Record<keyof ActingPose, number> = {
  ParamAngleX: 10, ParamAngleZ: 10, ParamBodyAngleZ: 7,
  ParamEyeLOpen: 24, ParamEyeROpen: 24, ParamMouthForm: 14,
  ParamArmL: 8, ParamArmR: 8,
  ParamElbowL: 12, ParamElbowR: 12, ParamWristL: 16, ParamWristR: 16
}

/** Critical damping gives gestures a soft start and stop; the body follows the head. */
export class ActingMotion {
  readonly pose: ActingPose
  private velocity: ActingPose

  constructor(initial: ActingPose) {
    this.pose = { ...initial }
    this.velocity = Object.fromEntries(Object.keys(initial).map(id => [id, 0])) as unknown as ActingPose
  }

  advance(target: ActingPose, seconds: number): ActingPose {
    for (const id of Object.keys(target) as (keyof ActingPose)[]) {
      const speed = response[id], offset = this.pose[id] - target[id]
      const force = this.velocity[id] + speed * offset, decay = Math.exp(-speed * seconds)
      this.pose[id] = target[id] + (offset + force * seconds) * decay
      this.velocity[id] = (this.velocity[id] - speed * force * seconds) * decay
    }
    return this.pose
  }
}
