export type DisplayMode = 'expanded' | 'compact'
export type DispatchState = 'pending' | 'claimed' | 'submitted' | 'failed' | 'uncertain' | 'missed'

export interface Reminder {
  id: string
  title: string
  dueAt: number
  createdAt: number
  dispatchState: DispatchState
  submittedAt: number | null
  completedAt: number | null
  acknowledgedAt: number | null
  lastError: string | null
}

export interface Settings {
  displayMode: DisplayMode
  alwaysOnTop: boolean
  offworkTime: string | null
  position: { x: number; y: number } | null
}

export interface WindowState {
  mode: DisplayMode
  visible: boolean
  alwaysOnTop: boolean
  animationsPaused: boolean
  bounds: { x: number; y: number; width: number; height: number }
}

export interface Snapshot {
  revision: number
  sessionId: string
  platform: string
  reminders: Reminder[]
  activeReminderIds: string[]
  settings: Settings
  window: WindowState
  focusedReminderId: string | null
  diagnostics: {
    trayReady: boolean
    notificationSupported: boolean
    databasePath: string
    versions: { electron: string; chrome: string; node: string }
  }
}

export type AppResult<T> = { ok: true; value: T } | { ok: false; error: string }
export interface ScheduleInput { title: string; delaySeconds: number; hideAfterScheduling: boolean }

export interface DesktopAPI {
  bootstrap(): Promise<AppResult<Snapshot>>
  scheduleReminder(input: ScheduleInput): Promise<AppResult<{ id: string }>>
  setCompleted(input: { id: string; completed: boolean }): Promise<AppResult<void>>
  acknowledgeReminder(id: string): Promise<AppResult<void>>
  setMode(mode: DisplayMode): Promise<AppResult<void>>
  setAlwaysOnTop(enabled: boolean): Promise<AppResult<void>>
  setOffworkTime(time: string | null): Promise<AppResult<void>>
  hide(): Promise<AppResult<void>>
  requestClose(): Promise<AppResult<void>>
  quit(): Promise<AppResult<void>>
  beginDrag(): Promise<AppResult<void>>
  endDrag(): Promise<AppResult<void>>
  subscribe(listener: () => void): () => void
}

export const channels = {
  bootstrap: 'app:bootstrap', schedule: 'reminders:schedule', complete: 'reminders:set-completed',
  acknowledge: 'reminders:acknowledge', mode: 'window:mode', alwaysOnTop: 'window:always-on-top',
  offworkTime: 'settings:offwork-time', hide: 'window:hide', close: 'window:request-close',
  quit: 'app:quit', dragStart: 'window:drag-start', dragEnd: 'window:drag-end', changed: 'app:changed'
} as const
