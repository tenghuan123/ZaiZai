import { PANEL_HEIGHT_OFFSET, PET_AREA, PET_WINDOW_SIZE } from '../../shared/window'
import type { WindowDirection, WindowLayout } from '../../shared/window'

export interface Point { x: number; y: number }
interface Size { width: number; height: number }
export interface Rect extends Point, Size {}
const PANEL_PET_GAP = 6

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

export function placeTaskPanel(anchor: Point, expandedSize: Size, area: Rect): { bounds: Rect; direction: WindowDirection } {
  const width = Math.min(expandedSize.width, area.width)
  const desiredHeight = expandedSize.height - PANEL_HEIGHT_OFFSET
  const panelBottom = anchor.y - PANEL_PET_GAP
  const panelTop = anchor.y + PET_AREA.height + PANEL_PET_GAP
  const above = panelBottom - area.y
  const below = area.y + area.height - panelTop
  const opensUp = below < desiredHeight && above > below
  const right = area.x + area.width - anchor.x
  const left = anchor.x + PET_AREA.width - area.x
  const opensLeft = right < width && left > right
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
