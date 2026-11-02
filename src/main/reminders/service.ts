import type { Reminder } from '../../shared/contracts'
import type { ReminderRepository } from './repository'
import type { TaskService } from '../tasks/service'
import type { Clock } from '../domain/time'
import { clockSnapshot, nextDayStart } from '../domain/time'
import type { DeliveryOutcome } from './repository'

export type { DeliveryOutcome } from './repository'
export type CheckReason = 'startup' | 'timer' | 'resume'

export class ReminderService {
  private timer: ReturnType<typeof setTimeout> | undefined
  private checking = false
  private stopped = false
  private followup: CheckReason | undefined

  constructor(
    private readonly records: ReminderRepository,
    private readonly tasks: TaskService,
    private readonly deliver: (items: Reminder[], reason: CheckReason) => Promise<DeliveryOutcome>,
    private readonly changed: () => void,
    private readonly reportError: (error: unknown) => void,
    private readonly clock: Clock = clockSnapshot
  ) {}

  arm(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.stopped || this.checking) return
    const clock = this.clock()
    const dueAt = this.records.nextDue(clock.today)
    const delay = Math.max(20, Math.min(30_000, nextDayStart(clock) - clock.nowMs, (dueAt ?? Infinity) - clock.nowMs))
    this.timer = setTimeout(() => { void this.checkNow('timer') }, delay)
  }

  async checkNow(reason: CheckReason): Promise<void> {
    if (this.stopped) return
    if (this.checking) { this.followup = reason; return }
    if (this.timer) clearTimeout(this.timer)
    this.checking = true
    try {
      const clock = this.clock()
      const dayChanged = this.tasks.coordinateDay(clock)
      const items = this.records.claimDue(clock)
      if (items.length || dayChanged) this.changed()
      if (items.length) {
        let outcome: DeliveryOutcome
        try { outcome = await this.deliver(items, reason) }
        catch (error) {
          this.reportError(error)
          outcome = { state: 'failed', error: error instanceof Error ? error.message : String(error) }
        }
        if (!this.stopped) {
          this.records.finishDispatch(items.map(item => item.dispatchId), outcome, this.clock().nowMs)
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
