export type Scene = 'generic' | 'water' | 'stretch'
export type PlanState = 'active' | 'paused' | 'ended'
export type OccurrenceStatus = 'pending' | 'completed' | 'cancelled'
export type CancelReason = 'user_removed' | 'plan_paused' | 'plan_changed' | 'plan_ended'

export interface PlanSlot { id: string; planId: string; localTime: string; active: boolean; sortOrder: number }
export interface RepeatPlan {
  id: string; creationKey: string; title: string; state: PlanState
  startDate: string; endDate: string | null; reminderEnabled: boolean; scene: Scene
  effectiveFromMs: number; version: number; createdAtMs: number; updatedAtMs: number
  slots: PlanSlot[]
}
export interface Occurrence {
  id: string; creationKey: string | null; planId: string | null; slotId: string | null; planVersion: number | null
  sourceDate: string; sourceTime: string | null; sourceZone: string
  scheduledDate: string; scheduledTime: string | null; scheduleZone: string; dueAtMs: number | null
  title: string; scene: Scene; status: OccurrenceStatus; cancelReason: CancelReason | null
  manualOverride: boolean; reminderEnabled: boolean; scheduleVersion: number; completedAtMs: number | null
  version: number; createdAtMs: number; updatedAtMs: number
}
export type OccurrenceRef = { id: string } | {
  planId: string; sourceDate: string; slotId: string; expectedPlanVersion: number
}
export type DayItem =
  | { kind: 'saved'; ref: { id: string }; occurrence: Occurrence }
  | { kind: 'preview'; ref: Exclude<OccurrenceRef, { id: string }>; title: string; scene: Scene;
      scheduledDate: string; scheduledTime: string; scheduleZone: string; dueAtMs: number; reminderEnabled: boolean }
export interface Progress { total: number; completed: number; percentage: number }
export interface DayView {
  date: string; activated: boolean; kind: 'past' | 'today' | 'future'; items: DayItem[]; progress: Progress
}
export interface OnceFields {
  title: string; scheduledDate: string; scheduledTime: string | null; reminderEnabled: boolean; scene?: Scene
}
export interface CreateOnceInput extends OnceFields { requestId: string }
export interface UpdateOnceInput extends OnceFields { id: string; expectedVersion: number }
export interface PlanFields {
  title: string; startDate: string; endDate: string | null; reminderEnabled: boolean; scene?: Scene
}
export interface CreatePlanInput extends PlanFields { requestId: string; times: string[] }
export interface UpdatePlanInput extends PlanFields {
  id: string; expectedVersion: number; slots: { id?: string; localTime: string }[]
}
export interface CompletionResult {
  occurrence: Occurrence; changed: boolean; before: Progress; after: Progress; allCompleted: boolean
}
