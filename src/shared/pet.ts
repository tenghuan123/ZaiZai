import type { Scene } from './tasks'

export const BUILT_IN_PET_ID = 'strawberry-bunny-v3'
export const BUILT_IN_PET_IDS = [BUILT_IN_PET_ID, 'hu-xianya', 'teng-huan', 'teng-junlong'] as const
export function isBuiltInPetId(value: unknown): boolean {
  return BUILT_IN_PET_IDS.some(id => id === value)
}
export const PET_ACTIONS = ['idle', 'react', 'celebrate', 'all_done', 'remind', 'drink_water', 'stretch'] as const
export type PetAction = typeof PET_ACTIONS[number]
export interface PetReaction { id: string; action: 'react' | 'celebrate' | 'all_done' }
export interface PetPlayback { key: string; action: PetAction; loop: boolean }

export function selectPetPlayback(reminder: { id: string; scene: Scene } | null, reaction: PetReaction | null, preview: PetAction | null): PetPlayback {
  if (reminder) return { key: `reminder:${reminder.id}:${reminder.scene}`,
    action: reminder.scene === 'water' ? 'drink_water' : reminder.scene === 'stretch' ? 'stretch' : 'remind', loop: true }
  if (reaction) return { key: `reaction:${reaction.id}`, action: reaction.action, loop: false }
  if (preview) return { key: `preview:${preview}`, action: preview, loop: true }
  return { key: 'idle', action: 'idle', loop: true }
}

export function spriteFrame(elapsedMs: number, frames: number, fps: number, loop: boolean): { index: number; finished: boolean } {
  const tick = Math.max(0, Math.floor(elapsedMs * fps / 1000))
  return { index: loop ? tick % frames : Math.min(tick, frames - 1), finished: !loop && tick >= frames }
}
