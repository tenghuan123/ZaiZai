import { BUILT_IN_PET_ID, PET_ACTIONS } from '../../../../shared/pet'
import type { PetAction } from '../../../../shared/pet'
import bunnyManifest from '../../../../../resources/pets/strawberry-bunny-v3/manifest.json'
import bunnyIdle from '../../../../../resources/pets/strawberry-bunny-v3/idle.png?url'
import bunnyReact from '../../../../../resources/pets/strawberry-bunny-v3/react.png?url'
import bunnyCelebrate from '../../../../../resources/pets/strawberry-bunny-v3/celebrate.png?url'
import bunnyAllDone from '../../../../../resources/pets/strawberry-bunny-v3/all_done.png?url'
import bunnyRemind from '../../../../../resources/pets/strawberry-bunny-v3/remind.png?url'
import bunnyDrinkWater from '../../../../../resources/pets/strawberry-bunny-v3/drink_water.png?url'
import bunnyStretch from '../../../../../resources/pets/strawberry-bunny-v3/stretch.png?url'
import xianyaManifest from '../../../../../resources/pets/hu-xianya/manifest.json'
import xianyaIdle from '../../../../../resources/pets/hu-xianya/idle.png?url'
import xianyaReact from '../../../../../resources/pets/hu-xianya/react.png?url'
import xianyaCelebrate from '../../../../../resources/pets/hu-xianya/celebrate.png?url'
import xianyaAllDone from '../../../../../resources/pets/hu-xianya/all_done.png?url'
import xianyaRemind from '../../../../../resources/pets/hu-xianya/remind.png?url'
import xianyaDrinkWater from '../../../../../resources/pets/hu-xianya/drink_water.png?url'
import xianyaStretch from '../../../../../resources/pets/hu-xianya/stretch.png?url'
import tengHuanManifest from '../../../../../resources/pets/teng-huan/manifest.json'
import tengHuanIdle from '../../../../../resources/pets/teng-huan/idle.png?url'
import tengHuanReact from '../../../../../resources/pets/teng-huan/react.png?url'
import tengHuanCelebrate from '../../../../../resources/pets/teng-huan/celebrate.png?url'
import tengHuanAllDone from '../../../../../resources/pets/teng-huan/all_done.png?url'
import tengHuanRemind from '../../../../../resources/pets/teng-huan/remind.png?url'
import tengHuanDrinkWater from '../../../../../resources/pets/teng-huan/drink_water.png?url'
import tengHuanStretch from '../../../../../resources/pets/teng-huan/stretch.png?url'
import tengJunlongManifest from '../../../../../resources/pets/teng-junlong/manifest.json'
import tengJunlongIdle from '../../../../../resources/pets/teng-junlong/idle.png?url'
import tengJunlongReact from '../../../../../resources/pets/teng-junlong/react.png?url'
import tengJunlongCelebrate from '../../../../../resources/pets/teng-junlong/celebrate.png?url'
import tengJunlongAllDone from '../../../../../resources/pets/teng-junlong/all_done.png?url'
import tengJunlongRemind from '../../../../../resources/pets/teng-junlong/remind.png?url'
import tengJunlongDrinkWater from '../../../../../resources/pets/teng-junlong/drink_water.png?url'
import tengJunlongStretch from '../../../../../resources/pets/teng-junlong/stretch.png?url'

export interface PetSpriteState { src: string; frames: number; cols: number; fps: number; loop: boolean; url: string }
export interface PetPack {
  id: string; name: string; version: string; frameWidth: number; frameHeight: number
  states: Record<PetAction, PetSpriteState>; quotes: typeof bunnyManifest.quotes
}

function createPetPack(manifest: typeof bunnyManifest, sources: Record<PetAction, string>): PetPack {
  return { id: manifest.id, name: manifest.name, version: manifest.version,
    frameWidth: manifest.canvasSize[0], frameHeight: manifest.canvasSize[1], quotes: manifest.quotes,
    states: Object.fromEntries(PET_ACTIONS.map(action => [action, { ...manifest.states[action], url: sources[action] }])) as Record<PetAction, PetSpriteState> }
}

export const petPacks: PetPack[] = [
  createPetPack(bunnyManifest, { idle: bunnyIdle, react: bunnyReact, celebrate: bunnyCelebrate, all_done: bunnyAllDone,
    remind: bunnyRemind, drink_water: bunnyDrinkWater, stretch: bunnyStretch }),
  createPetPack(xianyaManifest, { idle: xianyaIdle, react: xianyaReact, celebrate: xianyaCelebrate, all_done: xianyaAllDone,
    remind: xianyaRemind, drink_water: xianyaDrinkWater, stretch: xianyaStretch }),
  createPetPack(tengHuanManifest, { idle: tengHuanIdle, react: tengHuanReact, celebrate: tengHuanCelebrate, all_done: tengHuanAllDone,
    remind: tengHuanRemind, drink_water: tengHuanDrinkWater, stretch: tengHuanStretch }),
  createPetPack(tengJunlongManifest, { idle: tengJunlongIdle, react: tengJunlongReact, celebrate: tengJunlongCelebrate, all_done: tengJunlongAllDone,
    remind: tengJunlongRemind, drink_water: tengJunlongDrinkWater, stretch: tengJunlongStretch })
]

export function getPetPack(id: string = BUILT_IN_PET_ID): PetPack {
  return petPacks.find(pack => pack.id === id) ?? petPacks[0]
}

export const petActionLabels: Record<PetAction, string> = {
  idle: '待机眨眼', react: '挥手回应', celebrate: '鼓掌庆祝', all_done: '跳跃欢呼',
  remind: '摇铃提醒', drink_water: '喝水提醒', stretch: '头顶伸展'
}
