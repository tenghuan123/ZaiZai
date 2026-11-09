import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { channels } from '../shared/contracts'
import type { AppResult, Snapshot } from '../shared/contracts'
import type { DesktopWindow } from './desktop/window'
import type { TaskService } from './tasks/service'
import type { SettingsService } from './settings/service'
import type { ReminderService } from './reminders/service'
import type { ReminderRepository } from './reminders/repository'
import type { NativeNotifications } from './desktop/notifications'
import { AppError } from './domain/errors'
import { fields, identifier, object } from './domain/validation'
import type { UpdateService } from './updates/service'
import { PET_ACTIONS } from '../shared/pet'
import type { PetAction } from '../shared/pet'
import type { HumorContent } from '../shared/humor'
import type { HitRegion } from '../shared/window'

function isHitRegion(value: unknown): value is HitRegion {
  if (!value || typeof value !== 'object') return false
  const { x, y, width, height, radius } = value as HitRegion
  return [x, y, width, height, radius].every(number => Number.isFinite(number) && Math.abs(number) <= 4096)
    && width > 0 && height > 0 && radius >= 0
}

interface Context {
  desktop: DesktopWindow; tasks: TaskService; settings: SettingsService; reminders: ReminderService
  records: ReminderRepository; notifications: NativeNotifications; snapshot: () => Snapshot
  metadata: () => { sessionId: string; revision: number }; changed: () => void; quit: () => void
  reportError: (error: unknown) => void
  showContextMenu: () => void
  updates: UpdateService
  humorContent: HumorContent
}
export function registerIPC(context: Context): void {
  const { desktop, tasks, settings, reminders, records, notifications, changed } = context
  function sideEffect(action: () => void): void {
    try { action() } catch (error) { context.reportError(error) }
  }
  function publishChanges(): void {
    // Committed business data remains successful even if a native side effect fails.
    sideEffect(changed)
    sideEffect(() => reminders.arm())
  }
  function afterWrite<T>(action: () => T): T {
    const result = action()
    publishChanges()
    return result
  }
  function readCalendar<T>(read: () => T): T {
    if (tasks.coordinateDay()) publishChanges()
    return read()
  }
  function handle(name: string, action: (input: unknown, event: IpcMainInvokeEvent) => unknown): void {
    ipcMain.handle(name, async (event: IpcMainInvokeEvent, input: unknown): Promise<AppResult<unknown>> => {
      try {
        if (event.senderFrame !== event.sender.mainFrame ||
          !desktop.isTrustedRenderer(event.sender, event.senderFrame.url)) throw new AppError('UNAVAILABLE', '这个界面没有操作权限。')
        const pending = action(input, event)
        // Synchronous reads and their revision must be captured before another command can run.
        const value = pending instanceof Promise ? await pending : pending
        return { ok: true, value, ...context.metadata() }
      } catch (error) {
        if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message, field: error.field } }
        context.reportError(error)
        return { ok: false, error: { code: 'STORAGE', message: '本地数据读写失败，操作未保存，请重试。' } }
      }
    })
  }
  handle(channels.bootstrap, () => readCalendar(context.snapshot))
  handle(channels.humorContent, () => context.humorContent)
  handle(channels.updateState, () => context.updates.getState())
  handle(channels.updateCheck, () => context.updates.check())
  handle(channels.updateInstall, () => context.updates.install())
  handle(channels.updateAcknowledge, (_input, event) => {
    if (event.sender !== desktop.panel.webContents) throw new AppError('UNAVAILABLE', '请在清单中确认新功能。')
    context.updates.acknowledgeWhatsNew()
    desktop.finishWhatsNew()
  })
  ipcMain.on(channels.hitRegions, (event, input: unknown) => {
    const frame = event.senderFrame
    if (!frame || frame !== event.sender.mainFrame || !desktop.isTrustedRenderer(event.sender, frame.url)) return
    if (!Array.isArray(input) || input.length > 16 || !input.every(isHitRegion)) return
    sideEffect(() => desktop.setHitRegions(event.sender, input))
  })
  handle(channels.day, input => readCalendar(() => tasks.getDay(input)))
  handle(channels.dailyReport, () => tasks.getDailyReport())
  handle(channels.history, input => readCalendar(() => tasks.getHistoryDates(input)))
  handle(channels.createOnce, input => afterWrite(() => tasks.createOnce(input)))
  handle(channels.updateOnce, input => afterWrite(() => tasks.updateOnce(input)))
  handle(channels.priority, input => {
    const value = object(input); fields(value, ['ref', 'priority'])
    return afterWrite(() => tasks.setPriority(value.ref, value.priority))
  })
  handle(channels.complete, input => {
    const value = object(input); fields(value, ['ref', 'completed'])
    const result = afterWrite(() => tasks.setCompleted(value.ref, value.completed))
    if (result.occurrence.status === 'completed') sideEffect(() => notifications.dismiss(result.occurrence.id))
    return result
  })
  handle(channels.remove, input => {
    const result = afterWrite(() => tasks.removeOccurrence(input))
    sideEffect(() => notifications.dismiss(result.id))
    return result
  })
  handle(channels.move, input => {
    const result = afterWrite(() => tasks.moveToToday(input))
    sideEffect(() => notifications.dismiss(result.id))
    return result
  })
  handle(channels.plans, () => tasks.listPlans())
  handle(channels.createPlan, input => afterWrite(() => tasks.createPlan(input)))
  handle(channels.updatePlan, input => afterWrite(() => tasks.updatePlan(input)))
  handle(channels.pausePlan, input => {
    const value = object(input); fields(value, ['id', 'paused'])
    return afterWrite(() => tasks.setPaused(value.id, value.paused))
  })
  handle(channels.endPlan, input => afterWrite(() => tasks.endPlan(input)))
  handle(channels.settings, input => afterWrite(() => settings.update(input)))
  handle(channels.acknowledge, input => {
    const id = identifier(input)
    afterWrite(() => records.acknowledge(id, Date.now()))
    sideEffect(() => notifications.dismiss(id))
  })
  handle(channels.mode, input => {
    if (input !== 'expanded' && input !== 'compact') throw new AppError('VALIDATION', '窗口模式不正确。')
    desktop.setMode(input)
  })
  handle(channels.openPanel, input => {
    const value = object(input)
    if (value.kind === 'settings') desktop.openPanel({ kind: 'settings' })
    else if (value.kind === 'reminder') desktop.openPanel({ kind: 'reminder', reminderId: identifier(value.reminderId) })
    else throw new AppError('VALIDATION', '清单入口不正确。')
  })
  handle(channels.presentPet, (input, event) => {
    if (event.sender !== desktop.panel.webContents) throw new AppError('UNAVAILABLE', '这个界面没有操作权限。')
    const value = object(input)
    if (value.kind === 'preview' && (value.action === null || PET_ACTIONS.some(action => action === value.action))) {
      desktop.presentPet({ kind: 'preview', action: value.action as PetAction | null })
    } else if (value.kind === 'feedback' && typeof value.text === 'string' && value.text.length <= 300 &&
      (value.reaction === undefined || value.reaction === null || value.reaction === 'celebrate' || value.reaction === 'all_done')) {
      desktop.presentPet({ kind: 'feedback', text: value.text, reaction: value.reaction })
    } else throw new AppError('VALIDATION', '桌宠互动内容不正确。')
  })
  handle(channels.hide, () => desktop.hide())
  handle(channels.close, () => desktop.requestClose())
  handle(channels.quit, () => { setImmediate(context.quit) })
  handle(channels.dragStart, () => desktop.beginDrag())
  handle(channels.dragMove, () => desktop.moveDrag())
  handle(channels.dragEnd, () => desktop.endDrag())
  handle(channels.resizeStart, () => desktop.beginResize())
  handle(channels.resizeEnd, () => desktop.endResize(true))
  handle(channels.previewSound, () => desktop.playReminderSound())
  handle(channels.contextMenu, context.showContextMenu)
}
