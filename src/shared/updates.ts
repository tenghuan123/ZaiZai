export type UpdateStatus =
  | { phase: 'disabled'; reason: string }
  | { phase: 'idle' | 'checking' | 'up-to-date' }
  | { phase: 'downloading' | 'ready' | 'installing'; version: string; notes: string; progress: number }
  | { phase: 'error'; message: string }

export interface WhatsNew { notes: string; pending: boolean }
export interface UpdateState { currentVersion: string; status: UpdateStatus; whatsNew: WhatsNew | null }
