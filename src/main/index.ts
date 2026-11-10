import { app, autoUpdater as nativeUpdater, dialog, Notification, powerMonitor, protocol, screen } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
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
import { loadHumorContent } from './desktop/humor-pack'
import { APP_URL, registerRendererProtocol } from './desktop/protocol'
import { ReminderService } from './reminders/service'
import { registerIPC } from './ipc'
import electronUpdater from 'electron-updater'
import { UpdateService } from './updates/service'
import { InstalledRelease } from './updates/installed-release'
import releaseNotes from '../../docs/releases/latest.md?raw'

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
let updates: UpdateService | undefined
let updateNotification: Notification | undefined
let shuttingDown = false
let revision = 0
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
  const event: AppEvent = { sessionId, revision: ++revision, kind: 'data-changed' }
  try {
    desktop?.broadcast(channels.changed, event)
  } catch (error) { reportError(error) }
  try { tray?.refresh() } catch (error) { reportError(error) }
}
function snapshot(): Snapshot {
  if (!desktop || !connection || !settings || !tasks || !records) throw new Error('应用正在启动，请稍后。')
  const clock = clockSnapshot()
  return { revision, sessionId, platform: process.platform, today: tasks.getDay(clock.today, clock),
    reminders: records.listDay(clock.today), activeReminderIds: records.active(clock), settings: settings.getSettings(),
    window: desktop.state,
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
    updates?.dispose()
    updateNotification?.close()
    desktop?.prepareToQuit()
    notifications?.dispose()
    tray?.dispose()
    log('app-quit')
    connection?.close()
  })
  void app.whenReady().then(async () => {
    const databasePath = join(dataPath, 'm0.sqlite3')
    const existingInstall = existsSync(databasePath) || process.argv.includes('--updated')
    const database = new Connection(databasePath)
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
      for (const id of ids) reminderRecords.acknowledge(id, Date.now())
      if (target) window.openPanel({ kind: 'reminder', reminderId: target.id })
      else { window.setMode('expanded'); window.show() }
      changed()
    }, log)
    const native = notifications
    reminders = new ReminderService(reminderRecords, taskService, async (items, reason) => {
      const windowVisible = !window.window.isDestroyed() && window.window.isVisible()
      log('reminders-claimed', { ids: items.map(item => item.id), count: items.length, reason, windowVisible })
      try {
        if (preferences.getSettings().reminderSoundEnabled) window.playReminderSound()
      } catch (error) { reportError(error) }
      return native.submit(items, reason)
    }, changed, reportError)
    const scheduler = reminders
    tray = new DesktopTray(app.isPackaged ? join(process.resourcesPath, 'tray') : join(__dirname, '../../resources/tray'),
      window, taskService, preferences, preferenceService, changed, quit, reportError)
    log('tray-ready')
    installApplicationMenu()
    const updatesEnabled = app.isPackaged && ['win32', 'darwin'].includes(process.platform)
      && existsSync(join(process.resourcesPath, 'app-update.yml'))
    if (updatesEnabled) nativeUpdater.on('before-quit-for-update', () => window.prepareToQuit())
    const currentVersion = app.getVersion()
    const release = app.isPackaged
      ? new InstalledRelease(join(dataPath, 'last-seen-version'), currentVersion, releaseNotes.trim(), existingInstall, reportError)
      : undefined
    updates = new UpdateService(updatesEnabled ? electronUpdater.autoUpdater : null, currentVersion,
      app.isPackaged ? '此安装包未配置自动更新，请安装支持更新的正式版本。' : '开发模式不检查更新。', state => {
        try {
          window.broadcast(channels.updateChanged, state)
          if (state.status.phase === 'ready' && !window.state.visible && Notification.isSupported()) {
            updateNotification?.close()
            updateNotification = new Notification({ title: 'zaizai 更新已就绪', body: `版本 ${state.status.version} 已下载，点击查看并重启更新。`, silent: true })
            updateNotification.on('click', () => window.openPanel({ kind: 'settings' }))
            updateNotification.on('failed', (_event, message) => log('update-notification-failed', { message }))
            updateNotification.show()
          }
        } catch (error) { reportError(error) }
      }, log, { release, silentInstall: process.platform === 'win32' })
    const humorContent = loadHumorContent(dataPath, error => {
      log('humor-pack-invalid', { message: error instanceof Error ? error.message : String(error) })
    })
    registerIPC({ desktop: window, tasks: taskService, settings: preferenceService, records: reminderRecords, humorContent,
      reminders: scheduler, notifications: native, snapshot, metadata: () => ({ sessionId, revision }), changed, quit, reportError,
      showContextMenu: () => tray?.showContextMenu(), updates })
    powerMonitor.on('suspend', () => { log('system-suspend'); window.setSystemIdle(true) })
    powerMonitor.on('resume', () => { log('system-resume'); window.setSystemIdle(false); void scheduler.checkNow('resume') })
    powerMonitor.on('lock-screen', () => window.setSystemIdle(true))
    powerMonitor.on('unlock-screen', () => { window.setSystemIdle(false); void scheduler.checkNow('resume') })
    screen.on('display-removed', () => window.keepOnScreen())
    screen.on('display-metrics-changed', () => window.keepOnScreen())
    await window.load(release?.whatsNew?.pending)
    log('app-ready', { platform: process.platform, arch: process.arch, electron: process.versions.electron, database: database.path })
    void scheduler.checkNow('startup')
    updates.start()
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
