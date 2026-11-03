import { BrowserWindow, dialog, screen } from 'electron'
import type { DisplayMode, WindowState } from '../../shared/contracts'
import type { SettingsRepository } from '../settings/repository'
import { fitToWorkArea, WINDOW_SIZE } from './geometry'
import { MENU_TRANSITION_MS } from '../../shared/motion'

interface WindowOptions {
  preload: string
  rendererUrl: string
  changed: () => void
  quit: () => void
  reportError: (error: unknown) => void
  log: (event: string, details?: object) => void
}

export class DesktopWindow {
  readonly window: BrowserWindow
  private mode: DisplayMode
  private closingDialog = false
  private quitting = false
  private systemIdle = false
  private publishedVisibility = false
  private dragTimer: ReturnType<typeof setInterval> | undefined
  private compactTimer: ReturnType<typeof setTimeout> | undefined
  private readonly expectedRenderer: URL

  constructor(private readonly store: SettingsRepository, private readonly options: WindowOptions) {
    const settings = store.getSettings()
    this.mode = settings.displayMode
    const area = screen.getPrimaryDisplay().workArea
    const size = WINDOW_SIZE[this.mode]
    const desired = { ...size, x: settings.position?.x ?? area.x + area.width - size.width - 40,
      y: settings.position?.y ?? area.y + 80 }
    const display = screen.getDisplayMatching(desired)
    this.expectedRenderer = new URL(options.rendererUrl)
    this.window = new BrowserWindow({
      ...fitToWorkArea(desired, display.workArea), title: '桌面伙伴',
      frame: false, transparent: true, resizable: false, maximizable: false,
      fullscreenable: false, alwaysOnTop: settings.alwaysOnTop, show: false,
      hasShadow: false, backgroundColor: '#00000000',
      webPreferences: { preload: options.preload, contextIsolation: true, nodeIntegration: false,
        sandbox: true, backgroundThrottling: true }
    })
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.window.webContents.on('will-navigate', (event, url) => {
      if (!this.isTrustedUrl(url)) event.preventDefault()
    })
    this.window.once('ready-to-show', () => this.show())
    this.window.on('close', event => {
      if (!this.quitting) { event.preventDefault(); void this.requestClose().catch(options.reportError) }
    })
    this.window.on('show', () => this.publishVisibility())
    this.window.on('hide', () => this.publishVisibility())
    this.window.on('blur', () => this.endDrag())
    this.window.on('moved', () => this.savePosition())
    this.window.webContents.on('render-process-gone', (_event, details) => {
      options.log('renderer-gone', details)
      if (!this.quitting) this.load().catch(options.reportError)
    })
    this.window.webContents.on('did-fail-load', (_event, code, description) => {
      options.reportError(new Error(`界面加载失败 (${code}): ${description}`))
    })
  }

  isTrustedUrl(value: string): boolean {
    try {
      const url = new URL(value)
      return url.protocol === this.expectedRenderer.protocol && url.host === this.expectedRenderer.host &&
        url.pathname === this.expectedRenderer.pathname
    } catch { return false }
  }

  async load(): Promise<void> {
    await this.window.loadURL(this.options.rendererUrl)
  }

  get state(): WindowState {
    return { mode: this.mode, visible: this.window.isVisible(), alwaysOnTop: this.window.isAlwaysOnTop(),
      animationsPaused: this.systemIdle || !this.window.isVisible(),
      bounds: this.window.getBounds() }
  }

  setSystemIdle(idle: boolean): void { this.systemIdle = idle; this.options.changed() }

  setMode(mode: DisplayMode): void {
    if (this.mode === mode) return
    this.endDrag()
    this.store.updateSettings({ displayMode: mode })
    clearTimeout(this.compactTimer)
    this.mode = mode
    const resize = (): void => {
      const bounds = { ...this.window.getBounds(), ...WINDOW_SIZE[mode] }
      const area = screen.getDisplayMatching(bounds).workArea
      this.window.setBounds(fitToWorkArea(bounds, area))
    }
    if (mode === 'expanded' || !this.window.isVisible()) resize()
    else {
      // The renderer folds the card first; shrinking now would clip that animation.
      this.compactTimer = setTimeout(() => {
        this.compactTimer = undefined
        resize(); this.options.changed()
      }, MENU_TRANSITION_MS)
    }
    this.options.log('window-mode', this.state)
    this.options.changed()
  }

  setAlwaysOnTop(enabled: boolean): void {
    this.store.updateSettings({ alwaysOnTop: enabled })
    this.applyAlwaysOnTop(enabled)
  }

  applyAlwaysOnTop(enabled: boolean): void {
    this.window.setAlwaysOnTop(enabled)
    this.options.changed()
  }

  show(): void {
    this.keepOnScreen()
    this.window.show()
    this.window.focus()
    this.publishVisibility()
  }

  hide(): void { this.endDrag(); this.window.hide(); this.publishVisibility() }

  private publishVisibility(): void {
    // Some packaged macOS windows omit native show/hide events, so commands also publish the actual state.
    const visible = this.window.isVisible()
    if (visible === this.publishedVisibility) return
    this.publishedVisibility = visible
    if (!visible) this.endDrag()
    this.options.log(visible ? 'window-shown' : 'window-hidden', this.state)
    this.options.changed()
  }

  async requestClose(): Promise<void> {
    if (this.closingDialog || this.quitting) return
    this.closingDialog = true
    this.endDrag()
    try {
      const result = await dialog.showMessageBox(this.window, {
        type: 'question', title: '关闭桌面伙伴', message: '隐藏窗口，还是退出软件？',
        detail: '隐藏后仍会按时提醒；退出软件后停止新的提醒。',
        buttons: ['隐藏到托盘 / 菜单栏', '退出软件', '取消'], defaultId: 0, cancelId: 2, noLink: true
      })
      if (result.response === 0) this.hide()
      if (result.response === 1) this.options.quit()
    } finally { this.closingDialog = false }
  }

  beginDrag(): void {
    if (this.dragTimer) return
    const start = screen.getCursorScreenPoint()
    const bounds = this.window.getBounds()
    const startedAt = Date.now()
    this.dragTimer = setInterval(() => {
      if (Date.now() - startedAt > 15_000) { this.endDrag(); return }
      const cursor = screen.getCursorScreenPoint()
      const next = { ...bounds, x: bounds.x + cursor.x - start.x, y: bounds.y + cursor.y - start.y }
      this.window.setBounds(fitToWorkArea(next, screen.getDisplayNearestPoint(cursor).workArea))
    }, 16)
  }

  endDrag(): void {
    if (!this.dragTimer) return
    clearInterval(this.dragTimer)
    this.dragTimer = undefined
    this.savePosition()
    this.options.log('window-drag-ended', this.state)
    this.options.changed()
  }

  keepOnScreen(): void {
    const bounds = this.window.getBounds()
    this.window.setBounds(fitToWorkArea(bounds, screen.getDisplayMatching(bounds).workArea))
  }

  private savePosition(): void {
    if (this.quitting || this.dragTimer) return
    try {
      const { x, y } = this.window.getBounds()
      this.store.updateSettings({ position: { x, y } })
    } catch (error) { this.options.reportError(error) }
  }

  prepareToQuit(): void {
    clearTimeout(this.compactTimer)
    this.endDrag()
    this.savePosition()
    this.quitting = true
  }
}
