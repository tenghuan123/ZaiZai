export interface PetProportions {
  headScale: number
  bodyScale: number
  neckY: number
  footY: number
  // [first playback frame, neck Y, foot Y]; holds through repeated exposures.
  poses?: number[][]
}

export interface SpriteSlice {
  sourceY: number; sourceHeight: number
  x: number; y: number; width: number; height: number
}

export function spriteSlices(width: number, height: number, frame: number, proportions?: PetProportions): SpriteSlice[] {
  if (!proportions) return [{ sourceY: 0, sourceHeight: height, x: 0, y: 0, width, height }]
  const { headScale, bodyScale } = proportions
  let { neckY, footY } = proportions
  for (const [start, neck, foot] of proportions.poses ?? []) {
    if (start > frame) break
    neckY = neck; footY = foot
  }
  // Keep the head uniform in both axes and the soles stationary. Adjusting only
  // the whole frame would trade the oversized head for a shorter character.
  const x = width * (1 - headScale) / 2
  const drawWidth = width * headScale
  const neck = footY - (footY - neckY) * bodyScale
  return [
    { sourceY: neckY, sourceHeight: height - neckY, x, y: neck, width: drawWidth, height: (height - neckY) * bodyScale },
    { sourceY: 0, sourceHeight: neckY, x, y: neck - neckY * headScale, width: drawWidth, height: neckY * headScale }
  ]
}
