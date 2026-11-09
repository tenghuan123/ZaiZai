import type { CompletionResult, CreateOnceInput, CreatePlanInput, DayView, Occurrence, OccurrenceRef, Priority, RepeatPlan, UpdateOnceInput, UpdatePlanInput } from './tasks'
import type { UpdateState } from './updates'
import type { WindowDirection, WindowLayout } from './window'
import type { PetAction } from './pet'
import type { HumorContent } from './humor'
export type DisplayMode = 'expanded' | 'compact'
export type PanelTarget = { kind: 'settings' } | { kind: 'reminder'; reminderId: string }
export type PetPresentation = { kind: 'preview'; action: PetAction | null }
  | { kind: 'feedback'; text: string; reaction?: 'celebrate' | 'all_done' | null }
export type DispatchState = 'pending' | 'claimed' | 'submitted' | 'failed' | 'unavailable' | 'uncertain'
// Read-only presentation of a timed occurrence and its current dispatch. Never a second task record.
export interface Reminder {
  id: string; title: string; dueAt: number; createdAt: number; dispatchState: DispatchState
  submittedAt: number | null; completedAt: number | null; acknowledgedAt: number | null; lastError: string | null
}
export interface Settings {
  version: number; displayMode: DisplayMode; alwaysOnTop: boolean; offworkTime: string | null
  defaultReminderEnabled: boolean; position: { x: number; y: number } | null
  openAtLogin: boolean; reminderSoundEnabled: boolean; expandedSize: { width: number; height: number }
  petId: string; petDisplay: Record<string, { scale: number; anchorX: number; anchorY: number }>
}
export type SettingsPatch = Partial<Pick<Settings, 'offworkTime' | 'defaultReminderEnabled' | 'alwaysOnTop' | 'petId' | 'openAtLogin' | 'reminderSoundEnabled' | 'expandedSize'>>
export interface WindowState {
  mode: DisplayMode; visible: boolean; alwaysOnTop: boolean; animationsPaused: boolean
  bounds: { x: number; y: number; width: number; height: number }
  layout: WindowLayout
  petAnchor: { x: number; y: number }
  panel: { visible: boolean; bounds: WindowState['bounds']; direction: WindowDirection }
  panelRequest: { sequence: number; target: PanelTarget } | null
}
export interface Snapshot {
  revision: number; sessionId: string; platform: string; today: DayView
  reminders: Reminder[]; activeReminderIds: string[]; settings: Settings; window: WindowState
  diagnostics: { trayReady: boolean; notificationSupported: boolean; databasePath: string; backupPath: string | null
    versions: { electron: string; chrome: string; node: string } }
}
export interface AppFailure {
  code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'STORAGE' | 'UNAVAILABLE'; message: string; field?: string
}
export type AppResult<T> = { ok: true; value: T; sessionId: string; revision: number } | { ok: false; error: AppFailure }
export interface AppEvent {
  sessionId: string; revision: number; kind: 'data-changed' | 'reminders-changed' | 'window-changed' | 'clock-changed'
}
export interface DesktopAPI {
  bootstrap(): Promise<AppResult<Snapshot>>
  updates: {
    getState(): Promise<AppResult<UpdateState>>
    check(): Promise<AppResult<void>>
    install(): Promise<AppResult<void>>
    subscribe(listener: (state: UpdateState) => void): () => void
  }
  tasks: {
    getDay(date: string): Promise<AppResult<DayView>>
    getHistoryDates(range: { from: string; to: string }): Promise<AppResult<string[]>>
    createOnce(input: CreateOnceInput): Promise<AppResult<Occurrence>>
    updateOnce(input: UpdateOnceInput): Promise<AppResult<Occurrence>>
    setPriority(ref: OccurrenceRef, priority: Priority): Promise<AppResult<Occurrence>>
    setCompleted(ref: OccurrenceRef, completed: boolean): Promise<AppResult<CompletionResult>>
    removeOccurrence(ref: OccurrenceRef): Promise<AppResult<Occurrence>>
    moveToToday(ref: OccurrenceRef): Promise<AppResult<Occurrence>>
  }
  plans: {
    list(): Promise<AppResult<RepeatPlan[]>>
    create(input: CreatePlanInput): Promise<AppResult<RepeatPlan>>
    update(input: UpdatePlanInput): Promise<AppResult<RepeatPlan>>
    setPaused(id: string, paused: boolean): Promise<AppResult<RepeatPlan>>
    end(id: string): Promise<AppResult<RepeatPlan>>
  }
  settings: { update(input: { expectedVersion: number; patch: SettingsPatch }): Promise<AppResult<Settings>> }
  acknowledgeReminder(id: string): Promise<AppResult<void>>
  setMode(mode: DisplayMode): Promise<AppResult<void>>
  openPanel(target: PanelTarget): Promise<AppResult<void>>
  presentPet(presentation: PetPresentation): Promise<AppResult<void>>
  getHumorContent(): Promise<AppResult<HumorContent>>
  subscribePet(listener: (presentation: PetPresentation) => void): () => void
  hide(): Promise<AppResult<void>>
  requestClose(): Promise<AppResult<void>>
  quit(): Promise<AppResult<void>>
  beginDrag(): Promise<AppResult<void>>
  moveDrag(): Promise<AppResult<void>>
  endDrag(): Promise<AppResult<void>>
  beginResize(): Promise<AppResult<void>>
  endResize(): Promise<AppResult<void>>
  previewReminderSound(): Promise<AppResult<void>>
  showContextMenu(): Promise<AppResult<void>>
  subscribeSound(listener: () => void): () => void
  subscribe(listener: (event: AppEvent) => void): () => void
}
export const channels = {
  updateState: 'updates:state', updateCheck: 'updates:check', updateInstall: 'updates:install', updateChanged: 'updates:changed',
  bootstrap: 'app:bootstrap', day: 'tasks:get-day', history: 'tasks:history-dates', createOnce: 'tasks:create-once',
  updateOnce: 'tasks:update-once', complete: 'tasks:set-completed', remove: 'tasks:remove', move: 'tasks:move-today',
  priority: 'tasks:set-priority',
  plans: 'plans:list', createPlan: 'plans:create', updatePlan: 'plans:update', pausePlan: 'plans:set-paused', endPlan: 'plans:end',
  settings: 'settings:update', acknowledge: 'reminders:acknowledge', mode: 'window:mode',
  openPanel: 'window:open-panel', presentPet: 'window:present-pet', petPresentation: 'window:pet-presentation',
  humorContent: 'pet:humor-content',
  hide: 'window:hide', close: 'window:request-close', quit: 'app:quit', dragStart: 'window:drag-start',
  dragMove: 'window:drag-move', dragEnd: 'window:drag-end', resizeStart: 'window:resize-start', resizeEnd: 'window:resize-end',
  previewSound: 'reminders:preview-sound', playSound: 'reminders:play-sound', contextMenu: 'window:context-menu', changed: 'app:changed'
} as const
