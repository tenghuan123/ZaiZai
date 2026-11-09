import { BUILT_IN_PET_ID, PET_ACTIONS } from '../../../../shared/pet'
import type { PetAction } from '../../../../shared/pet'
import type { PetProportions } from '../../../../shared/pet-proportions'
import bunnyManifest from '../../../../../resources/pets/strawberry-bunny-v3/manifest.json'
import bunnyIdle from '../../../../../resources/pets/strawberry-bunny-v3/idle.png?url'
import bunnyReact from '../../../../../resources/pets/strawberry-bunny-v3/react.png?url'
import bunnyCelebrate from '../../../../../resources/pets/strawberry-bunny-v3/celebrate.png?url'
import bunnyAllDone from '../../../../../resources/pets/strawberry-bunny-v3/all_done.png?url'
import bunnyRemind from '../../../../../resources/pets/strawberry-bunny-v3/remind.png?url'
import bunnyDrinkWater from '../../../../../resources/pets/strawberry-bunny-v3/drink_water.png?url'
import bunnyStretch from '../../../../../resources/pets/strawberry-bunny-v3/stretch.png?url'
import xiangXiangMaoManifest from '../../../../../resources/pets/xiang-xiang-mao/manifest.json'
import xiangXiangMaoIdle from '../../../../../resources/pets/xiang-xiang-mao/idle.png?url'
import xiangXiangMaoReact from '../../../../../resources/pets/xiang-xiang-mao/react.png?url'
import xiangXiangMaoCelebrate from '../../../../../resources/pets/xiang-xiang-mao/celebrate.png?url'
import xiangXiangMaoAllDone from '../../../../../resources/pets/xiang-xiang-mao/all_done.png?url'
import xiangXiangMaoRemind from '../../../../../resources/pets/xiang-xiang-mao/remind.png?url'
import xiangXiangMaoDrinkWater from '../../../../../resources/pets/xiang-xiang-mao/drink_water.png?url'
import xiangXiangMaoStretch from '../../../../../resources/pets/xiang-xiang-mao/stretch.png?url'
import chouChouWangManifest from '../../../../../resources/pets/chou-chou-wang/manifest.json'
import chouChouWangIdle from '../../../../../resources/pets/chou-chou-wang/idle.png?url'
import chouChouWangReact from '../../../../../resources/pets/chou-chou-wang/react.png?url'
import chouChouWangCelebrate from '../../../../../resources/pets/chou-chou-wang/celebrate.png?url'
import chouChouWangAllDone from '../../../../../resources/pets/chou-chou-wang/all_done.png?url'
import chouChouWangRemind from '../../../../../resources/pets/chou-chou-wang/remind.png?url'
import chouChouWangDrinkWater from '../../../../../resources/pets/chou-chou-wang/drink_water.png?url'
import chouChouWangStretch from '../../../../../resources/pets/chou-chou-wang/stretch.png?url'
import zhuZhuManifest from '../../../../../resources/pets/zhu-zhu/manifest.json'
import zhuZhuIdle from '../../../../../resources/pets/zhu-zhu/idle.png?url'
import zhuZhuReact from '../../../../../resources/pets/zhu-zhu/react.png?url'
import zhuZhuCelebrate from '../../../../../resources/pets/zhu-zhu/celebrate.png?url'
import zhuZhuAllDone from '../../../../../resources/pets/zhu-zhu/all_done.png?url'
import zhuZhuRemind from '../../../../../resources/pets/zhu-zhu/remind.png?url'
import zhuZhuDrinkWater from '../../../../../resources/pets/zhu-zhu/drink_water.png?url'
import zhuZhuStretch from '../../../../../resources/pets/zhu-zhu/stretch.png?url'

export interface PetSpriteState {
  src: string; frames: number; cols: number; fps: number; loop: boolean; url: string; proportions?: PetProportions
}
export interface PetPack {
  id: string; name: string; version: string; frameWidth: number; frameHeight: number
  states: Record<PetAction, PetSpriteState>; quotes: typeof bunnyManifest.quotes
}

interface PetManifest {
  id: string; name: string; version: string; canvasSize: number[]; quotes: typeof bunnyManifest.quotes
  states: Record<PetAction, Omit<PetSpriteState, 'url'>>
}

function createPetPack(manifest: PetManifest, sources: Record<PetAction, string>): PetPack {
  return { id: manifest.id, name: manifest.name, version: manifest.version,
    frameWidth: manifest.canvasSize[0], frameHeight: manifest.canvasSize[1], quotes: manifest.quotes,
    states: Object.fromEntries(PET_ACTIONS.map(action => [action, { ...manifest.states[action], url: sources[action] }])) as Record<PetAction, PetSpriteState> }
}

export const petPacks: PetPack[] = [
  createPetPack(bunnyManifest, { idle: bunnyIdle, react: bunnyReact, celebrate: bunnyCelebrate, all_done: bunnyAllDone,
    remind: bunnyRemind, drink_water: bunnyDrinkWater, stretch: bunnyStretch }),
  createPetPack(xiangXiangMaoManifest, { idle: xiangXiangMaoIdle, react: xiangXiangMaoReact, celebrate: xiangXiangMaoCelebrate, all_done: xiangXiangMaoAllDone,
    remind: xiangXiangMaoRemind, drink_water: xiangXiangMaoDrinkWater, stretch: xiangXiangMaoStretch }),
  createPetPack(chouChouWangManifest, { idle: chouChouWangIdle, react: chouChouWangReact, celebrate: chouChouWangCelebrate, all_done: chouChouWangAllDone,
    remind: chouChouWangRemind, drink_water: chouChouWangDrinkWater, stretch: chouChouWangStretch }),
  createPetPack(zhuZhuManifest, { idle: zhuZhuIdle, react: zhuZhuReact, celebrate: zhuZhuCelebrate, all_done: zhuZhuAllDone,
    remind: zhuZhuRemind, drink_water: zhuZhuDrinkWater, stretch: zhuZhuStretch })
]

export function getPetPack(id: string = BUILT_IN_PET_ID): PetPack {
  return petPacks.find(pack => pack.id === id) ?? petPacks[0]
}

export const petActionLabels: Record<PetAction, string> = {
  idle: '待机眨眼', react: '挥手回应', celebrate: '鼓掌庆祝', all_done: '跳跃欢呼',
  remind: '摇铃提醒', drink_water: '喝水提醒', stretch: '头顶伸展'
}
