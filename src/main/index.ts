import { app, dialog, Notification, powerMonitor, protocol, screen } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { channels } from '../shared/contracts'
import type { Snapshot } from '../shared/contracts'
import { Store } from './database/store'
import { DesktopWindow } from './desktop/window'
import { DesktopTray, installApplicationMenu } from './desktop/tray'
import { NativeNotifications } from './desktop/notifications'
import { APP_URL, registerRendererProtocol } from './desktop/protocol'
import { ReminderService } from './reminders/service'
import { registerIPC } from './ipc'

app.setName('Desktop Buddy M0')
app.setAppUserModelId(app.isPackaged ? 'com.desktopbuddy.m0' : 'com.desktopbuddy.m0.dev')
const dataPath = process.env.TIA_M0_DATA_DIR || join(app.getPath('appData'), app.isPackaged ? 'desktop-buddy-m0' : 'desktop-buddy-m0-dev')
mkdirSync(dataPath, { recursive: true })
app.setPath('userData', dataPath)
protocol.registerSchemesAsPrivileged([{ scheme: 'buddy-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let desktop: DesktopWindow | undefined
let tray: DesktopTray | undefined
let store: Store | undefined
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
    if (desktop && !desktop.window.webContents.isDestroyed()) desktop.window.webContents.send(channels.changed)
  } catch (error) { reportError(error) }
}
function snapshot(): Snapshot {
  if (!desktop || !store) throw new Error('应用正在启动，请稍后。')
  const items = store.list()
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const activeReminderIds = items.filter(item => item.completedAt === null && item.acknowledgedAt === null &&
    item.dueAt >= start.getTime() && item.dueAt <= Date.now() &&
    ['claimed', 'submitted', 'failed', 'uncertain'].includes(item.dispatchState)).map(item => item.id)
  return { revision, sessionId, platform: process.platform, reminders: items, activeReminderIds, settings: store.getSettings(),
    window: desktop.state, focusedReminderId,
    diagnostics: { trayReady: !!tray && !tray.tray.isDestroyed(), notificationSupported: Notification.isSupported(),
      databasePath: store.path, versions: { electron: process.versions.electron ?? '', chrome: process.versions.chrome ?? '', node: process.versions.node } } }
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
    store?.close()
  })
  void app.whenReady().then(async () => {
    const database = new Store(join(dataPath, 'm0.sqlite3'))
    store = database
    registerRendererProtocol(join(__dirname, '../renderer'))
    desktop = new DesktopWindow(database, {
      preload: join(__dirname, '../preload/index.js'),
      rendererUrl: process.env.ELECTRON_RENDERER_URL || APP_URL,
      changed, quit, reportError, log
    })
    const window = desktop
    notifications = new NativeNotifications(ids => {
      const target = ids.map(id => database.get(id)).find(item => item && item.completedAt === null)
      focusedReminderId = target?.id ?? null
      for (const id of ids) database.acknowledge(id, Date.now())
      window.setMode('expanded')
      window.show()
      changed()
    }, log)
    const native = notifications
    reminders = new ReminderService(database, async (items, reason) => {
      log('reminders-claimed', { ids: items.map(item => item.id), count: items.length, reason, windowVisible: window.state.visible })
      return native.submit(items, reason)
    }, changed, reportError)
    const scheduler = reminders
    tray = new DesktopTray(app.isPackaged ? join(process.resourcesPath, 'tray') : join(__dirname, '../../resources/tray'),
      window, database, hide => {
        try {
          const item = scheduler.schedule('起来活动一下，休息片刻', 5)
          log('reminder-scheduled-from-tray', { id: item.id, hide })
          if (hide) window.hide()
        } catch (error) { reportError(error) }
      }, quit)
    log('tray-ready')
    installApplicationMenu()
    registerIPC({ desktop: window, store: database, reminders: scheduler, notifications: native, snapshot, changed, quit, reportError })
    powerMonitor.on('suspend', () => { log('system-suspend'); window.setSystemIdle(true) })
    powerMonitor.on('resume', () => { log('system-resume'); window.setSystemIdle(false); void scheduler.checkNow('resume') })
    powerMonitor.on('lock-screen', () => window.setSystemIdle(true))
    powerMonitor.on('unlock-screen', () => { window.setSystemIdle(false); void scheduler.checkNow('resume') })
    screen.on('display-removed', () => window.keepOnScreen())
    screen.on('display-metrics-changed', () => window.keepOnScreen())
    await window.load()
    log('app-ready', { platform: process.platform, arch: process.arch, electron: process.versions.electron, database: database.path })
    void scheduler.checkNow('startup')
  }).catch(error => {
    reportError(error)
    dialog.showErrorBox('桌面伙伴启动失败', error instanceof Error ? error.message : String(error))
    app.exit(1)
  })
}
