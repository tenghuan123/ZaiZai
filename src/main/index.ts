import { app, dialog, Notification, powerMonitor, protocol, screen } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { channels } from '../shared/contracts'
import type { AppEvent, Snapshot } from '../shared/contracts'
import { Connection, MigrationError } from './database/connection'
import { SettingsRepository } from './settings/repository'
import { SettingsService } from './settings/service'
import { SystemLoginItems } from './desktop/login-items'
import { TaskRepository } from './tasks/repository'
import { TaskService } from './tasks/service'
import { ReminderRepository } from './reminders/repository'
import { clockSnapshot } from './domain/time'
import { DesktopWindow } from './desktop/window'
import { DesktopTray, installApplicationMenu } from './desktop/tray'
import { NativeNotifications } from './desktop/notifications'
import { APP_URL, registerRendererProtocol } from './desktop/protocol'
import { ReminderService } from './reminders/service'
import { registerIPC } from './ipc'

app.setName('zaizai')
app.setAppUserModelId(app.isPackaged ? 'com.desktopbuddy.m0' : 'com.desktopbuddy.m0.dev')
const dataPath = process.env.TIA_M0_DATA_DIR || join(app.getPath('appData'), app.isPackaged ? 'desktop-buddy-m0' : 'desktop-buddy-m0-dev')
mkdirSync(dataPath, { recursive: true })
app.setPath('userData', dataPath)
protocol.registerSchemesAsPrivileged([{ scheme: 'buddy-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let desktop: DesktopWindow | undefined
let tray: DesktopTray | undefined
let connection: Connection | undefined
let settings: SettingsRepository | undefined
let tasks: TaskService | undefined
let records: ReminderRepository | undefined
let reminders: ReminderService | undefined
let notifications: NativeNotifications | undefined
let shuttingDown = false
let revision = 0
let focusedReminderId: string | null = null
const sessionId = randomUUID()

function log(event: string, details?: object): void {
  const record = { at: new Date().toISOString(), event, ...details }
  console.log(JSON.stringify(record))
  try { appendFileSync(join(dataPath, 'm0-events.ndjson'), JSON.stringify(record) + '\n') }
  catch (error) { console.error('诊断记录写入失败', error) }
}
function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  log('error', { message })
}
function changed(): void {
  if (shuttingDown) return
  revision++
  try {
    tray?.refresh()
    const event: AppEvent = { sessionId, revision, kind: 'data-changed' }
    if (desktop && !desktop.window.webContents.isDestroyed()) desktop.window.webContents.send(channels.changed, event)
  } catch (error) { reportError(error) }
}
function snapshot(): Snapshot {
  if (!desktop || !connection || !settings || !tasks || !records) throw new Error('应用正在启动，请稍后。')
  const clock = clockSnapshot()
  return { revision, sessionId, platform: process.platform, today: tasks.getDay(clock.today, clock),
    reminders: records.listDay(clock.today), activeReminderIds: records.active(clock), settings: settings.getSettings(),
    window: desktop.state, focusedReminderId,
    diagnostics: { trayReady: !!tray && !tray.tray.isDestroyed(), notificationSupported: Notification.isSupported(),
      databasePath: connection.path, backupPath: connection.backupPath,
      versions: { electron: process.versions.electron ?? '', chrome: process.versions.chrome ?? '', node: process.versions.node } } }
}
function quit(): void { app.quit() }

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { log('second-instance'); desktop?.show() })
  app.on('activate', () => desktop?.show())
  app.on('before-quit', () => {
    if (shuttingDown) return
    shuttingDown = true
    reminders?.dispose()
    desktop?.prepareToQuit()
    notifications?.dispose()
    tray?.dispose()
    log('app-quit')
    connection?.close()
  })
  void app.whenReady().then(async () => {
    const database = new Connection(join(dataPath, 'm0.sqlite3'))
    connection = database
    const preferences = new SettingsRepository(database.db)
    settings = preferences
    const loginItems = new SystemLoginItems()
    if (app.isPackaged && ['darwin', 'win32'].includes(process.platform)) {
      try {
        const openAtLogin = loginItems.read()
        if (openAtLogin !== preferences.getSettings().openAtLogin) preferences.updateSettings({ openAtLogin })
      } catch (error) { reportError(error) }
    }
    const taskRepository = new TaskRepository(database.db)
    const reminderRecords = new ReminderRepository(database.db)
    records = reminderRecords
    reminderRecords.recoverClaims()
    const taskService = new TaskService(taskRepository, reminderRecords)
    tasks = taskService
    taskService.ensureToday()
    registerRendererProtocol(join(__dirname, '../renderer'))
    desktop = new DesktopWindow(preferences, {
      preload: join(__dirname, '../preload/index.js'),
      rendererUrl: process.env.ELECTRON_RENDERER_URL || APP_URL,
      changed, quit, reportError, log
    })
    const window = desktop
    const preferenceService = new SettingsService(preferences, loginItems, next => window.applyPreferences(next), reportError)
    notifications = new NativeNotifications(ids => {
      const target = ids.map(id => taskRepository.get(id)).find(item => item?.status === 'pending')
      focusedReminderId = target?.id ?? null
      for (const id of ids) reminderRecords.acknowledge(id, Date.now())
      window.setMode('expanded')
      window.show()
      changed()
    }, log)
    const native = notifications
    reminders = new ReminderService(reminderRecords, taskService, async (items, reason) => {
      log('reminders-claimed', { ids: items.map(item => item.id), count: items.length, reason, windowVisible: window.state.visible })
      if (preferences.getSettings().reminderSoundEnabled) window.playReminderSound()
      return native.submit(items, reason)
    }, changed, reportError)
    const scheduler = reminders
    tray = new DesktopTray(app.isPackaged ? join(process.resourcesPath, 'tray') : join(__dirname, '../../resources/tray'),
      window, taskService, preferences, preferenceService, changed, quit, reportError)
    log('tray-ready')
    installApplicationMenu()
    registerIPC({ desktop: window, tasks: taskService, settings: preferenceService, records: reminderRecords,
      reminders: scheduler, notifications: native, snapshot, metadata: () => ({ sessionId, revision }), changed, quit, reportError,
      showContextMenu: () => tray?.showContextMenu() })
    powerMonitor.on('suspend', () => { log('system-suspend'); window.setSystemIdle(true) })
    powerMonitor.on('resume', () => { log('system-resume'); window.setSystemIdle(false); void scheduler.checkNow('resume') })
    powerMonitor.on('lock-screen', () => window.setSystemIdle(true))
    powerMonitor.on('unlock-screen', () => { window.setSystemIdle(false); void scheduler.checkNow('resume') })
    screen.on('display-removed', () => window.keepOnScreen())
    screen.on('display-metrics-changed', () => window.keepOnScreen())
    await window.load()
    log('app-ready', { platform: process.platform, arch: process.arch, electron: process.versions.electron, database: database.path })
    void scheduler.checkNow('startup')
  }).catch(async error => {
    reportError(error)
    const result = await dialog.showMessageBox({ type: 'error', title: '桌面伙伴启动失败',
      message: error instanceof Error ? error.message : String(error), buttons: ['打开数据目录', '退出'], defaultId: 1, cancelId: 1 })
    if (result.response === 0) {
      const { shell } = await import('electron')
      await shell.openPath(dataPath)
    }
    if (error instanceof MigrationError) log('migration-failed', { backupPath: error.backupPath })
    app.exit(1)
  })
}
