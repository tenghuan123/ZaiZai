export interface Rect { x: number; y: number; width: number; height: number }
export const WINDOW_SIZE = { expanded: { width: 356, height: 560 }, compact: { width: 356, height: 224 } } as const

export function fitToWorkArea(bounds: Rect, area: Rect): Rect {
  return { ...bounds,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))) }
}
