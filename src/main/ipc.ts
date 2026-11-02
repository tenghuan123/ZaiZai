import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { channels } from '../shared/contracts'
import type { AppResult, DisplayMode, Snapshot } from '../shared/contracts'
import type { DesktopWindow } from './desktop/window'
import type { Store } from './database/store'
import type { ReminderService } from './reminders/service'
import type { NativeNotifications } from './desktop/notifications'

interface Context {
  desktop: DesktopWindow
  store: Store
  reminders: ReminderService
  notifications: NativeNotifications
  snapshot: () => Snapshot
  changed: () => void
  quit: () => void
  reportError: (error: unknown) => void
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请求参数不正确。')
  return input as Record<string, unknown>
}
function id(input: unknown): string {
  if (typeof input !== 'string' || !/^[a-f0-9-]{36}$/.test(input)) throw new Error('提醒标识不正确。')
  return input
}

export function registerIPC(context: Context): void {
  const { desktop, store, reminders, notifications, changed } = context
  function handle(name: string, action: (input: unknown) => unknown): void {
    ipcMain.handle(name, async (event: IpcMainInvokeEvent, input: unknown): Promise<AppResult<unknown>> => {
      try {
        if (event.sender !== desktop.window.webContents || event.senderFrame !== event.sender.mainFrame ||
          !desktop.isTrustedUrl(event.senderFrame.url)) throw new Error('这个界面没有操作权限。')
        return { ok: true, value: await action(input) }
      } catch (error) {
        context.reportError(error)
        return { ok: false, error: error instanceof Error ? error.message : '操作未完成，请重试。' }
      }
    })
  }
  handle(channels.bootstrap, context.snapshot)
  handle(channels.schedule, input => {
    const value = object(input)
    if (typeof value.title !== 'string' || !value.title.trim() || [...value.title.trim()].length > 60) throw new Error('请输入 1 至 60 字的提醒内容。')
    if (typeof value.delaySeconds !== 'number' || !Number.isInteger(value.delaySeconds) || value.delaySeconds < 2 || value.delaySeconds > 3600) throw new Error('提醒时间需在 2 秒至 1 小时之间。')
    if (typeof value.hideAfterScheduling !== 'boolean') throw new Error('隐藏选项不正确。')
    const item = reminders.schedule(value.title.trim(), value.delaySeconds)
    if (value.hideAfterScheduling) desktop.hide()
    return { id: item.id }
  })
  handle(channels.complete, input => {
    const value = object(input)
    const reminderId = id(value.id)
    if (typeof value.completed !== 'boolean') throw new Error('完成状态不正确。')
    store.setCompleted(reminderId, value.completed, Date.now())
    if (value.completed) notifications.dismiss(reminderId)
    reminders.arm()
    changed()
  })
  handle(channels.acknowledge, input => {
    const reminderId = id(input)
    store.acknowledge(reminderId, Date.now()); notifications.dismiss(reminderId); changed()
  })
  handle(channels.mode, input => {
    if (input !== 'expanded' && input !== 'compact') throw new Error('窗口模式不正确。')
    desktop.setMode(input as DisplayMode)
  })
  handle(channels.alwaysOnTop, input => {
    if (typeof input !== 'boolean') throw new Error('置顶选项不正确。')
    desktop.setAlwaysOnTop(input)
  })
  handle(channels.offworkTime, input => {
    if (input !== null && (typeof input !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input))) throw new Error('下班时间不正确。')
    store.updateSettings({ offworkTime: input as string | null }); changed()
  })
  handle(channels.hide, () => desktop.hide())
  handle(channels.close, () => desktop.requestClose())
  handle(channels.quit, () => { setImmediate(context.quit) })
  handle(channels.dragStart, () => desktop.beginDrag())
  handle(channels.dragEnd, () => desktop.endDrag())
}
