export const STANDARD_SIZE = { width: 356, height: 480 }
export const LARGE_SIZE = { width: 440, height: 610 }
export const MIN_SIZE = STANDARD_SIZE
export const MAX_SIZE = { width: 520, height: 780 }

// The pet keeps the same position within this area when the window grows around it.
export const PET_AREA = { width: 154, height: 138 }

export interface WindowLayout {
  horizontal: 'left' | 'right'
  vertical: 'up' | 'down'
  inset: { x: number; y: number }
}
