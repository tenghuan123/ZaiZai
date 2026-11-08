export const STANDARD_SIZE = { width: 356, height: 480 }
export const LARGE_SIZE = { width: 440, height: 610 }
export const MIN_SIZE = STANDARD_SIZE
export const MAX_SIZE = { width: 520, height: 780 }

// The pet keeps the same position within this area when the window grows around it.
export const PET_AREA = { width: 154, height: 138 }
export const PET_WINDOW_SIZE = { width: 356, height: 184 }
// Saved presets include the space originally reserved for the pet above the card.
export const PANEL_HEIGHT_OFFSET = 102

export interface WindowDirection {
  horizontal: 'left' | 'right'
  vertical: 'up' | 'down'
}

export interface WindowLayout extends WindowDirection {
  // Available span from the pet along the chosen directions, independent of the window size.
  room: { width: number; height: number }
}
