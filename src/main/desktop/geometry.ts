import { PANEL_FRAME_INSET, PANEL_HEIGHT_OFFSET, PET_AREA, PET_BUTTON, PET_WINDOW_SIZE } from '../../shared/window'
import type { HitRegion, WindowDirection, WindowLayout } from '../../shared/window'

export interface Point { x: number; y: number }
interface Size { width: number; height: number }
export interface Rect extends Point, Size {}
const PANEL_PET_GAP = 4

export function hitsRegion(point: Point, { x, y, width, height, radius }: HitRegion): boolean {
  const dx = point.x - x, dy = point.y - y
  if (dx < 0 || dy < 0 || dx >= width || dy >= height) return false
  const corner = Math.min(radius, width / 2, height / 2)
  const insetX = Math.max(0, corner - dx, dx - (width - corner))
  const insetY = Math.max(0, corner - dy, dy - (height - corner))
  return insetX ** 2 + insetY ** 2 <= corner ** 2
}

export function fitToWorkArea(bounds: Rect, area: Rect): Rect {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height)
  return { width, height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) }
}

export function placePetWindow(anchor: Point, area: Rect): { bounds: Rect; layout: WindowLayout } {
  const pet = fitToWorkArea({ ...anchor, ...PET_AREA }, area)
  const width = Math.min(PET_WINDOW_SIZE.width, area.width)
  const height = Math.min(PET_WINDOW_SIZE.height, area.height)
  const right = area.x + area.width - pet.x
  const left = pet.x + pet.width - area.x
  const down = area.y + area.height - pet.y
  const up = pet.y + pet.height - area.y
  const opensLeft = right < width && left > right
  const opensUp = down < height && up > down
  const bounds = fitToWorkArea({
    x: opensLeft ? pet.x + pet.width - width : pet.x,
    y: opensUp ? pet.y + pet.height - height : pet.y,
    width, height
  }, area)
  return { bounds, layout: {
    horizontal: opensLeft ? 'left' : 'right',
    vertical: opensUp ? 'up' : 'down',
    room: { width: opensLeft ? left : right, height: opensUp ? up : down }
  } }
}

export function petAnchor(bounds: Rect, { horizontal, vertical, room }: WindowLayout): Point {
  const offsetX = horizontal === 'left' ? Math.min(bounds.width, room.width) - PET_AREA.width : bounds.width - room.width
  const offsetY = vertical === 'up' ? Math.min(bounds.height, room.height) - PET_AREA.height : bounds.height - room.height
  return {
    x: bounds.x + Math.max(0, offsetX),
    y: bounds.y + Math.max(0, offsetY)
  }
}

export function placeTaskPanel(anchor: Point, expandedSize: Size, area: Rect, fixedDirection?: WindowDirection): { bounds: Rect; direction: WindowDirection } {
  const width = Math.min(expandedSize.width, area.width)
  const desiredHeight = expandedSize.height - PANEL_HEIGHT_OFFSET
  // The native windows can overlap in their transparent margins.
  const petTop = anchor.y + PET_BUTTON.top
  const panelBottom = petTop - PANEL_PET_GAP + PANEL_FRAME_INSET
  const panelTop = petTop + PET_BUTTON.height + PANEL_PET_GAP - PANEL_FRAME_INSET
  const above = panelBottom - area.y
  const below = area.y + area.height - panelTop
  const opensUp = fixedDirection ? fixedDirection.vertical === 'up' : below < desiredHeight && above > below
  const right = area.x + area.width - anchor.x
  const left = anchor.x + PET_AREA.width - area.x
  const opensLeft = fixedDirection ? fixedDirection.horizontal === 'left' : right < width && left > right
  const height = Math.max(1, Math.min(desiredHeight, opensUp ? above : below))
  return {
    bounds: fitToWorkArea({
      x: opensLeft ? anchor.x + PET_AREA.width - width : anchor.x,
      y: opensUp ? panelBottom - height : panelTop,
      width, height
    }, area),
    direction: { horizontal: opensLeft ? 'left' : 'right', vertical: opensUp ? 'up' : 'down' }
  }
}
