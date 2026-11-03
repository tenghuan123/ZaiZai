import { Notification } from 'electron'
import type { Reminder } from '../../shared/contracts'
import type { CheckReason, DeliveryOutcome } from '../reminders/service'

export class NativeNotifications {
  private readonly active = new Map<Notification, string[]>()
  private readonly pending = new Set<() => void>()

  constructor(private readonly activate: (ids: string[]) => void,
    private readonly log: (event: string, details?: object) => void) {}

  submit(items: Reminder[], reason: CheckReason): Promise<DeliveryOutcome> {
    if (!Notification.isSupported()) return Promise.resolve({ state: 'unavailable', error: '当前系统不支持原生通知。' })
    return new Promise(resolve => {
      const title = items.length === 1 ? '桌面伙伴提醒你' : `${items.length} 项提醒已到时间`
      const body = items.length === 1 ? items[0].title : items.map(item => item.title).join('、').slice(0, 90)
      // The app plays one bell per dispatch batch; the OS sound would duplicate it and bypass mute.
      const notification = new Notification({ title, body, silent: true })
      const ids = items.map(item => item.id)
      this.active.set(notification, ids)
      let settled = false
      const finish = (outcome: DeliveryOutcome): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.pending.delete(cancel)
        this.log(`notification-${outcome.state}`, { ids, reason, error: outcome.error })
        resolve(outcome)
      }
      const cancel = (): void => finish({ state: 'failed', error: '应用正在退出，通知提交已停止。' })
      const timeout = setTimeout(() => finish({ state: 'failed', error: '系统未确认通知提交，请检查通知权限。' }), 8000)
      this.pending.add(cancel)
      notification.once('show', () => finish({ state: 'submitted' }))
      notification.once('failed', (_event, error: string) => {
        finish({ state: 'failed', error: error || '系统通知提交失败，请检查权限与应用签名。' })
        this.active.delete(notification)
      })
      notification.on('click', () => { this.log('notification-clicked', { ids }); this.activate(ids) })
      notification.on('close', () => this.log('notification-closed', { ids }))
      try { notification.show() } catch (error) {
        finish({ state: 'failed', error: error instanceof Error ? error.message : String(error) })
        this.active.delete(notification)
      }
    })
  }

  dismiss(id: string): void {
    for (const [notification, ids] of this.active) {
      if (ids.includes(id)) { notification.close(); this.active.delete(notification) }
    }
  }

  dispose(): void {
    for (const cancel of [...this.pending]) cancel()
    // Do not leave stale clickable M0 notifications after an explicit exit.
    for (const notification of this.active.keys()) notification.close()
    this.active.clear()
  }
}
