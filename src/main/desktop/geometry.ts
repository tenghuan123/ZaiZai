export interface Rect { x: number; y: number; width: number; height: number }
import { STANDARD_SIZE } from '../../shared/window'
export const WINDOW_SIZE = { expanded: STANDARD_SIZE, compact: { width: 356, height: 224 } } as const

export function fitToWorkArea(bounds: Rect, area: Rect): Rect {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height)
  return { width, height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) }
}
