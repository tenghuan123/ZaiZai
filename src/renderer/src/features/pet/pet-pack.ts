import { PET_ACTIONS } from '../../../../shared/pet'
import type { PetAction } from '../../../../shared/pet'
import manifest from '../../../../../resources/pets/strawberry-bunny-v3/manifest.json'
import idle from '../../../../../resources/pets/strawberry-bunny-v3/idle.png?url'
import react from '../../../../../resources/pets/strawberry-bunny-v3/react.png?url'
import celebrate from '../../../../../resources/pets/strawberry-bunny-v3/celebrate.png?url'
import all_done from '../../../../../resources/pets/strawberry-bunny-v3/all_done.png?url'
import remind from '../../../../../resources/pets/strawberry-bunny-v3/remind.png?url'
import drink_water from '../../../../../resources/pets/strawberry-bunny-v3/drink_water.png?url'
import stretch from '../../../../../resources/pets/strawberry-bunny-v3/stretch.png?url'

const sources: Record<PetAction, string> = { idle, react, celebrate, all_done, remind, drink_water, stretch }
export interface PetSpriteState { src: string; frames: number; cols: number; fps: number; loop: boolean; url: string }
export const petPack = { id: manifest.id, name: '草莓兔女孩', version: manifest.version,
  frameWidth: manifest.canvasSize[0], frameHeight: manifest.canvasSize[1] }
export const petStates = Object.fromEntries(PET_ACTIONS.map(action => [action, { ...manifest.states[action], url: sources[action] }])) as Record<PetAction, PetSpriteState>
export const petActionLabels: Record<PetAction, string> = {
  idle: '待机眨眼', react: '挥手回应', celebrate: '鼓掌庆祝', all_done: '跳跃欢呼',
  remind: '摇铃提醒', drink_water: '喝水提醒', stretch: '头顶伸展'
}
