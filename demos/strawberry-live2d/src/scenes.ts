import type { GestureId } from './gestures'

export interface ActingPose {
  ParamAngleX: number
  ParamAngleZ: number
  ParamBodyAngleZ: number
  ParamEyeLOpen: number
  ParamEyeROpen: number
  ParamMouthForm: number
  ParamArmL: number
  ParamArmR: number
  ParamElbowL: number
  ParamElbowR: number
  ParamWristL: number
  ParamWristR: number
}

export const neutralPose: ActingPose = {
  ParamAngleX: 0, ParamAngleZ: 0, ParamBodyAngleZ: 0,
  ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamMouthForm: 0,
  ParamArmL: 0, ParamArmR: 0,
  ParamElbowL: 0, ParamElbowR: 0, ParamWristL: 0, ParamWristR: 0
}

export interface Beat {
  id: string
  text: string
  emotion: string
  direction: string
  pauseAfterMs: number
  gesture: GestureId
  accent?: 'sweat' | 'sparkle' | 'sleep'
}

export interface Scene { id: string; title: string; description: string; beats: Beat[] }

export const scenes: Scene[] = [
  {
    id: 'take-it-easy', title: '别急，先别急', description: '认真安慰 → 停顿 → 歪头坏笑',
    beats: [
      { id: 'hurry-1', text: '我知道你很急。', emotion: '认真安慰', direction: '轻轻抬手，注视你', pauseAfterMs: 550,
        gesture: 'explain' },
      { id: 'hurry-2', text: '但你先别急。', emotion: '一本正经地调皮', direction: '歪头，收起手，露出坏笑', pauseAfterMs: 1500,
        gesture: 'curious', accent: 'sweat' }
    ]
  },
  {
    id: 'effort', title: '努力的另一面', description: '认真解释 → 留白 → 放松偷笑',
    beats: [
      { id: 'effort-1', text: '努力不一定会成功。', emotion: '认真讲道理', direction: '轻抬手，认真解释，再收回来', pauseAfterMs: 650,
        gesture: 'explain' },
      { id: 'effort-2', text: '但不努力，一定会很轻松。', emotion: '得意偷笑', direction: '闭眼笑，轻轻晃一下', pauseAfterMs: 1500,
        gesture: 'smile', accent: 'sparkle' }
    ]
  },
  {
    id: 'rest', title: '休息也是正经事', description: '关心提醒 → 停顿 → 困困地接梗',
    beats: [
      { id: 'rest-1', text: '久坐成疾。', emotion: '有点担心', direction: '抬手提醒，眉眼认真', pauseAfterMs: 550,
        gesture: 'explain' },
      { id: 'rest-2', text: '还是要多躺。', emotion: '困困的', direction: '放下手，闭眼歪头', pauseAfterMs: 1700,
        gesture: 'sleepy', accent: 'sleep' }
    ]
  }
]
