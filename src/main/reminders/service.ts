import type { Reminder } from '../../shared/contracts'
import type { Store } from '../database/store'

export type DeliveryOutcome = { state: 'submitted' | 'failed'; error?: string }
export type CheckReason = 'startup' | 'timer' | 'resume'

export class ReminderService {
  private timer: ReturnType<typeof setTimeout> | undefined
  private checking = false
  private stopped = false
  private followup: CheckReason | undefined

  constructor(
    private readonly store: Store,
    private readonly deliver: (items: Reminder[], reason: CheckReason) => Promise<DeliveryOutcome>,
    private readonly changed: () => void,
    private readonly reportError: (error: unknown) => void,
    private readonly now: () => number = Date.now
  ) {}

  schedule(title: string, delaySeconds: number): Reminder {
    const now = this.now()
    const item = this.store.schedule(title, now + delaySeconds * 1000, now)
    this.changed()
    this.arm()
    return item
  }

  arm(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.stopped || this.checking) return
    const dueAt = this.store.nextDue()
    const delay = dueAt === null ? 30_000 : Math.max(20, Math.min(30_000, dueAt - this.now()))
    this.timer = setTimeout(() => { void this.checkNow('timer') }, delay)
  }

  async checkNow(reason: CheckReason): Promise<void> {
    if (this.stopped) return
    if (this.checking) { this.followup = reason; return }
    if (this.timer) clearTimeout(this.timer)
    this.checking = true
    try {
      const now = this.now()
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      const expired = this.store.expireBefore(start.getTime())
      const items = this.store.claimDue(now, start.getTime())
      if (items.length || expired) this.changed()
      if (items.length) {
        let outcome: DeliveryOutcome
        try { outcome = await this.deliver(items, reason) }
        catch (error) {
          this.reportError(error)
          outcome = { state: 'failed', error: error instanceof Error ? error.message : String(error) }
        }
        if (!this.stopped) {
          this.store.finishDispatch(items.map(item => item.id), outcome, this.now())
          this.changed()
        }
      }
    } catch (error) {
      this.reportError(error)
    } finally {
      this.checking = false
      if (!this.stopped) {
        const followup = this.followup
        this.followup = undefined
        if (followup) void this.checkNow(followup)
        else this.arm()
      }
    }
  }

  dispose(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
  }
}
