import { BrowserWindow, dialog, screen } from 'electron'
import type { DisplayMode, PanelTarget, PetPresentation, Settings, WindowState } from '../../shared/contracts'
import { channels } from '../../shared/contracts'
import { MIN_SIZE, MAX_SIZE, PANEL_HEIGHT_OFFSET, PET_AREA, PET_WINDOW_SIZE } from '../../shared/window'
import type { WindowDirection, WindowLayout } from '../../shared/window'
import type { SettingsRepository } from '../settings/repository'
import { petAnchor, placePetWindow, placeTaskPanel } from './geometry'
import type { Point } from './geometry'
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
  readonly panel: BrowserWindow
  private mode: DisplayMode
  private layout: WindowLayout
  private panelDirection: WindowDirection
  private panelRequest: WindowState['panelRequest'] = null
  private closingDialog = false
  private quitting = false
  private systemIdle = false
  private publishedVisibility = false
  private drag: { cursor: Point; anchor: Point; expandedSize: Settings['expandedSize'] } | undefined
  private compactTimer: ReturnType<typeof setTimeout> | undefined
  private resize: { timer: ReturnType<typeof setInterval>; size: Settings['expandedSize'] } | undefined
  private readonly expectedRenderer: URL

  constructor(private readonly store: SettingsRepository, private readonly options: WindowOptions) {
    const settings = store.getSettings()
    this.mode = settings.displayMode
    const area = screen.getPrimaryDisplay().workArea
    // In older versions the pet area started at the window origin, so saved positions are already anchors.
    const anchor = { x: settings.position?.x ?? area.x + area.width - PET_WINDOW_SIZE.width - 40,
      y: settings.position?.y ?? area.y + 80 }
    const display = screen.getDisplayMatching({ ...anchor, ...PET_AREA })
    const placement = placePetWindow(anchor, display.workArea)
    this.layout = placement.layout
    const panelPlacement = placeTaskPanel(petAnchor(placement.bounds, this.layout), settings.expandedSize, display.workArea)
    this.panelDirection = panelPlacement.direction
    this.expectedRenderer = new URL(options.rendererUrl)
    const preferences: Electron.BrowserWindowConstructorOptions = {
      frame: false, transparent: true, resizable: false, maximizable: false,
      fullscreenable: false, alwaysOnTop: settings.alwaysOnTop, show: false,
      skipTaskbar: !settings.alwaysOnTop,
      hasShadow: false, backgroundColor: '#00000000',
      webPreferences: { preload: options.preload, contextIsolation: true, nodeIntegration: false,
        sandbox: true, backgroundThrottling: true, autoplayPolicy: 'no-user-gesture-required' }
    }
    this.window = new BrowserWindow({ ...preferences, ...placement.bounds, title: 'zaizai' })
    this.panel = new BrowserWindow({ ...preferences, ...panelPlacement.bounds, title: 'zaizai · 任务清单', skipTaskbar: true })
    this.bindWindow(this.window, 'pet')
    this.bindWindow(this.panel, 'panel')
    this.window.on('show', () => this.publishVisibility())
    this.window.on('hide', () => this.publishVisibility())
    this.window.on('moved', () => this.savePosition())
    this.window.on('focus', () => {
      // The open panel covers only the transparent space reserved for the compact dock.
      if (this.windowsAvailable && this.mode === 'expanded' && this.panel.isVisible()) this.panel.moveTop()
    })
  }

  private get windowsAvailable(): boolean {
    return !this.quitting && !this.window.isDestroyed() && !this.panel.isDestroyed()
  }

  private bindWindow(window: BrowserWindow, view: 'pet' | 'panel'): void {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!this.isTrustedUrl(url, view)) event.preventDefault()
    })
    window.on('close', event => {
      if (!this.quitting) { event.preventDefault(); void this.requestClose().catch(this.options.reportError) }
    })
    window.on('blur', () => {
      if (!this.windowsAvailable) return
      this.endDrag()
      this.endResize()
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      if (!this.windowsAvailable) return
      this.endDrag()
      this.endResize()
      this.options.log('renderer-gone', { view, ...details })
      window.loadURL(this.rendererUrl(view)).catch(this.options.reportError)
    })
    window.webContents.on('did-fail-load', (_event, code, description) => {
      this.options.reportError(new Error(`界面加载失败 (${code}): ${description}`))
    })
  }

  private rendererUrl(view: 'pet' | 'panel'): string {
    const url = new URL(this.expectedRenderer)
    url.searchParams.set('view', view)
    return url.href
  }

  isTrustedRenderer(sender: Electron.WebContents, value: string): boolean {
    if (!this.windowsAvailable) return false
    const view = sender === this.window.webContents ? 'pet' : sender === this.panel.webContents ? 'panel' : null
    return view !== null && this.isTrustedUrl(value, view)
  }

  private isTrustedUrl(value: string, view: 'pet' | 'panel'): boolean {
    try {
      const url = new URL(value)
      return url.protocol === this.expectedRenderer.protocol && url.host === this.expectedRenderer.host &&
        url.pathname === this.expectedRenderer.pathname && url.searchParams.get('view') === view
    } catch { return false }
  }

  async load(): Promise<void> {
    await Promise.all([this.window.loadURL(this.rendererUrl('pet')), this.panel.loadURL(this.rendererUrl('panel'))])
    this.show()
  }

  get state(): WindowState {
    const bounds = this.window.getBounds()
    return { mode: this.mode, visible: this.window.isVisible(), alwaysOnTop: this.window.isAlwaysOnTop(),
      animationsPaused: this.systemIdle || !this.window.isVisible(),
      bounds, layout: this.layout, petAnchor: petAnchor(bounds, this.layout),
      panel: { visible: this.panel.isVisible(), bounds: this.panel.getBounds(), direction: this.panelDirection },
      panelRequest: this.panelRequest }
  }

  setSystemIdle(idle: boolean): void { this.systemIdle = idle; this.options.changed() }

  setMode(mode: DisplayMode): void {
    if (this.mode === mode) return
    this.endDrag()
    this.endResize()
    this.store.updateSettings({ displayMode: mode })
    clearTimeout(this.compactTimer)
    this.compactTimer = undefined
    this.mode = mode
    if (mode === 'expanded') {
      this.panel.setIgnoreMouseEvents(false)
      this.placePanel(this.store.getSettings().expandedSize)
      if (this.window.isVisible()) this.panel.show()
    } else if (this.panel.isVisible()) {
      // Let the dock receive clicks as soon as it returns during the fold.
      this.panel.setIgnoreMouseEvents(true)
      this.compactTimer = setTimeout(() => {
        this.compactTimer = undefined
        if (!this.windowsAvailable) return
        const returnFocus = this.panel.isFocused()
        this.panel.hide()
        if (returnFocus && this.window.isVisible()) this.window.focus()
        this.options.changed()
      }, MENU_TRANSITION_MS)
    }
    this.options.log('window-mode', this.state)
    this.options.changed()
  }

  openPanel(target: PanelTarget): void {
    this.setMode('expanded')
    this.panelRequest = { sequence: (this.panelRequest?.sequence ?? 0) + 1, target }
    if (this.window.isVisible()) this.panel.focus()
    else this.show()
    this.options.changed()
  }

  broadcast(channel: string, value: unknown): void {
    for (const window of [this.window, this.panel]) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channel, value)
    }
  }

  presentPet(presentation: PetPresentation): void {
    this.window.webContents.send(channels.petPresentation, presentation)
  }

  private applyAlwaysOnTop(enabled: boolean): void {
    this.window.setAlwaysOnTop(enabled)
    this.window.setSkipTaskbar(!enabled)
    this.panel.setAlwaysOnTop(enabled)
  }

  applyPreferences(settings: Settings): void {
    this.applyAlwaysOnTop(settings.alwaysOnTop)
    if (!this.resize) this.placePanel(settings.expandedSize)
  }

  playReminderSound(): void {
    this.window.webContents.send(channels.playSound)
  }

  show(): void {
    if (!this.windowsAvailable) return
    this.keepOnScreen()
    if (this.mode === 'expanded') {
      this.window.showInactive()
      this.panel.show()
    } else {
      this.window.show()
    }
    this.publishVisibility()
  }

  hide(): void {
    this.endDrag(); this.endResize()
    clearTimeout(this.compactTimer)
    this.compactTimer = undefined
    this.panel.hide()
    this.window.hide()
    this.publishVisibility()
  }

  private publishVisibility(): void {
    if (!this.windowsAvailable) return
    // Some packaged macOS windows omit native show/hide events, so commands also publish the actual state.
    const visible = this.window.isVisible()
    if (visible === this.publishedVisibility) return
    this.publishedVisibility = visible
    if (!visible) { this.endDrag(); this.endResize() }
    this.options.log(visible ? 'window-shown' : 'window-hidden', this.state)
    this.options.changed()
  }

  async requestClose(): Promise<void> {
    if (this.closingDialog || this.quitting) return
    this.closingDialog = true
    this.endDrag()
    try {
      const result = await dialog.showMessageBox(this.panel.isFocused() ? this.panel : this.window, {
        type: 'question', title: '关闭桌面伙伴', message: '隐藏窗口，还是退出软件？',
        detail: '隐藏后仍会按时提醒；退出软件后停止新的提醒。',
        buttons: ['隐藏到托盘 / 菜单栏', '退出软件', '取消'], defaultId: 0, cancelId: 2, noLink: true
      })
      if (result.response === 0) this.hide()
      if (result.response === 1) this.options.quit()
    } finally { this.closingDialog = false }
  }

  beginDrag(): void {
    if (this.drag || this.resize) return
    this.drag = { cursor: screen.getCursorScreenPoint(), anchor: petAnchor(this.window.getBounds(), this.layout),
      expandedSize: this.store.getSettings().expandedSize }
  }

  moveDrag(): void {
    if (!this.drag) return
    const { cursor: start, anchor, expandedSize } = this.drag
    const cursor = screen.getCursorScreenPoint()
    const next = { x: anchor.x + cursor.x - start.x, y: anchor.y + cursor.y - start.y }
    if (this.placeAtPet(expandedSize, next, screen.getDisplayNearestPoint(cursor).workArea)) this.options.changed()
  }

  endDrag(): void {
    if (!this.drag) return
    this.drag = undefined
    this.savePosition()
    this.options.log('window-drag-ended', this.state)
    this.options.changed()
  }

  beginResize(): void {
    if (this.mode !== 'expanded' || this.resize || !this.panel.isVisible()) return
    this.endDrag()
    const start = screen.getCursorScreenPoint(), bounds = this.panel.getBounds(), startedAt = Date.now()
    const size = this.store.getSettings().expandedSize
    const timer = setInterval(() => {
      if (!this.resize) return
      if (Date.now() - startedAt > 15_000) { this.endResize(); return }
      const cursor = screen.getCursorScreenPoint()
      const width = Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, bounds.width + cursor.x - start.x))
      const height = Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, bounds.height + PANEL_HEIGHT_OFFSET + cursor.y - start.y))
      this.resize.size = { width, height }
      if (this.placePanel(this.resize.size)) this.options.changed()
    }, 16)
    this.resize = { timer, size }
  }

  endResize(reportFailure = false): void {
    if (!this.resize) return
    const { timer, size: expandedSize } = this.resize
    clearInterval(timer)
    this.resize = undefined
    let failure: unknown
    try {
      this.store.updateSettings({ expandedSize })
    } catch (error) {
      failure = error
      this.options.reportError(error)
      this.applyPreferences(this.store.getSettings())
    }
    this.options.log('window-resized', this.state)
    this.options.changed()
    if (failure && reportFailure) throw failure
  }

  keepOnScreen(): void {
    if (!this.windowsAvailable) return
    if (this.placeAtPet(this.store.getSettings().expandedSize)) this.options.changed()
  }

  private placeAtPet(expandedSize: Settings['expandedSize'], anchor: Point = petAnchor(this.window.getBounds(), this.layout),
    area = screen.getDisplayMatching({ ...anchor, ...PET_AREA }).workArea): boolean {
    const { bounds, layout } = placePetWindow(anchor, area)
    const previous = this.layout
    const currentBounds = this.window.getBounds()
    const sizeChanged = bounds.width !== currentBounds.width || bounds.height !== currentBounds.height
    this.layout = layout
    if (bounds.x !== currentBounds.x || bounds.y !== currentBounds.y || sizeChanged) this.window.setBounds(bounds)
    const nextPet = petAnchor(bounds, layout)
    const previousPet = petAnchor(bounds, previous)
    const panelChanged = this.placePanel(expandedSize, area)
    return panelChanged || sizeChanged || previous.horizontal !== layout.horizontal || previous.vertical !== layout.vertical ||
      nextPet.x !== previousPet.x || nextPet.y !== previousPet.y
  }

  private placePanel(expandedSize: Settings['expandedSize'], area?: Electron.Rectangle): boolean {
    const petBounds = this.window.getBounds()
    const anchor = petAnchor(petBounds, this.layout)
    const placement = placeTaskPanel(anchor, expandedSize,
      area ?? screen.getDisplayMatching({ ...anchor, ...PET_AREA }).workArea)
    const previous = this.panelDirection
    this.panelDirection = placement.direction
    const bounds = this.panel.getBounds()
    if (bounds.x !== placement.bounds.x || bounds.y !== placement.bounds.y ||
      bounds.width !== placement.bounds.width || bounds.height !== placement.bounds.height) this.panel.setBounds(placement.bounds)
    return previous.horizontal !== this.panelDirection.horizontal || previous.vertical !== this.panelDirection.vertical
  }

  private savePosition(): void {
    if (this.quitting || this.drag || this.window.isDestroyed()) return
    try {
      const { x, y } = petAnchor(this.window.getBounds(), this.layout)
      const saved = this.store.getSettings().position
      if (saved?.x === x && saved.y === y) return
      this.store.updateSettings({ position: { x, y } })
    } catch (error) { this.options.reportError(error) }
  }

  prepareToQuit(): void {
    clearTimeout(this.compactTimer)
    this.endDrag()
    this.endResize()
    this.savePosition()
    this.quitting = true
  }
}
