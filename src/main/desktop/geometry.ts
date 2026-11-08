import { PET_AREA, STANDARD_SIZE } from '../../shared/window'
import type { WindowLayout } from '../../shared/window'

export interface Point { x: number; y: number }
interface Size { width: number; height: number }
export interface Rect extends Point, Size {}
export const WINDOW_SIZE = { expanded: STANDARD_SIZE, compact: { width: 356, height: 224 } } as const

export function fitToWorkArea(bounds: Rect, area: Rect): Rect {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height)
  return { width, height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) }
}

export function placeWindow(anchor: Point, size: Size, expandedSize: Size, area: Rect): { bounds: Rect; layout: WindowLayout } {
  const pet = fitToWorkArea({ ...anchor, ...PET_AREA }, area)
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  const right = area.x + area.width - pet.x
  const left = pet.x + pet.width - area.x
  const down = area.y + area.height - pet.y
  const up = pet.y + pet.height - area.y
  const opensLeft = right < expandedSize.width && left > right
  const opensUp = down < expandedSize.height && up > down
  const bounds = fitToWorkArea({
    x: opensLeft ? pet.x + pet.width - width : pet.x,
    y: opensUp ? pet.y + pet.height - height : pet.y,
    width, height
  }, area)
  return { bounds, layout: {
    horizontal: opensLeft ? 'left' : 'right',
    vertical: opensUp ? 'up' : 'down',
    inset: {
      x: opensLeft ? bounds.x + width - pet.x - pet.width : pet.x - bounds.x,
      y: opensUp ? bounds.y + height - pet.y - pet.height : pet.y - bounds.y
    }
  } }
}

export function petAnchor(bounds: Rect, { horizontal, vertical, inset }: WindowLayout): Point {
  return {
    x: bounds.x + (horizontal === 'left' ? Math.max(0, bounds.width - PET_AREA.width - inset.x) : inset.x),
    y: bounds.y + (vertical === 'up' ? Math.max(0, bounds.height - PET_AREA.height - inset.y) : inset.y)
  }
}
