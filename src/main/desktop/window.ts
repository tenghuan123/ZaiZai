import { BrowserWindow, dialog, screen } from 'electron'
import type { DisplayMode, PanelTarget, PetPresentation, Settings, WindowState } from '../../shared/contracts'
import { channels } from '../../shared/contracts'
import { MIN_SIZE, MAX_SIZE, PANEL_HEIGHT_OFFSET, PET_AREA, PET_WINDOW_SIZE } from '../../shared/window'
import type { HitRegion, WindowDirection, WindowLayout } from '../../shared/window'
import type { SettingsRepository } from '../settings/repository'
import { hitsRegion, petAnchor, placePetWindow, placeTaskPanel } from './geometry'
import type { Point } from './geometry'
import { MENU_TRANSITION_MS } from '../../shared/motion'

const nativeHitTesting = process.platform === 'darwin' || process.platform === 'win32'

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
  private resize: {
    timer: ReturnType<typeof setInterval>; cursor: Point; size: Settings['expandedSize']; initialSize: Settings['expandedSize']
    bounds: Electron.Rectangle; direction: WindowDirection; moved: boolean
  } | undefined
  private returnToCompactAfterNotes = false
  private hitRegions = new Map<BrowserWindow, HitRegion[]>()
  private ignoringMouse = new Map<BrowserWindow, boolean>()
  private hitTimer: ReturnType<typeof setInterval> | undefined
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
      hasShadow: false, backgroundColor: '#00000000', acceptFirstMouse: true,
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
      this.hitRegions.delete(window)
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

  async load(showWhatsNew = false): Promise<void> {
    await Promise.all([this.window.loadURL(this.rendererUrl('pet')), this.panel.loadURL(this.rendererUrl('panel'))])
    if (showWhatsNew && this.mode === 'compact') {
      this.returnToCompactAfterNotes = true
      this.setMode('expanded', false)
    }
    this.show()
  }

  finishWhatsNew(): void {
    if (!this.returnToCompactAfterNotes) return
    this.returnToCompactAfterNotes = false
    this.setMode('compact', false)
  }

  setHitRegions(sender: Electron.WebContents, regions: HitRegion[]): void {
    this.hitRegions.set(sender === this.window.webContents ? this.window : this.panel, regions)
    this.refreshMouseInput()
  }

  private refreshMouseInput(): void {
    if (!this.windowsAvailable || !nativeHitTesting) return
    const cursor = screen.getCursorScreenPoint()
    for (const window of [this.window, this.panel]) {
      if (!window.isVisible()) continue
      const { x, y } = window.getContentBounds()
      const local = { x: cursor.x - x, y: cursor.y - y }
      const capturing = this.drag || (window === this.panel && this.resize)
      const folding = window === this.panel && this.mode === 'compact'
      const ignore = folding || (!capturing && !this.hitRegions.get(window)?.some(region => hitsRegion(local, region)))
      if (this.ignoringMouse.get(window) === ignore) continue
      window.setIgnoreMouseEvents(ignore)
      this.ignoringMouse.set(window, ignore)
    }
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

  setMode(mode: DisplayMode, persist = true): void {
    if (this.mode === mode && !(persist && this.returnToCompactAfterNotes)) return
    this.endDrag()
    this.endResize()
    if (persist) {
      this.store.updateSettings({ displayMode: mode })
      this.returnToCompactAfterNotes = false
    }
    if (this.mode === mode) return
    clearTimeout(this.compactTimer)
    this.compactTimer = undefined
    this.mode = mode
    if (mode === 'expanded') {
      if (!nativeHitTesting) this.panel.setIgnoreMouseEvents(false)
      this.placePanel(this.store.getSettings().expandedSize)
      if (this.window.isVisible()) this.panel.show()
    } else if (this.panel.isVisible()) {
      // Let the dock receive clicks as soon as it returns during the fold.
      if (!nativeHitTesting) this.panel.setIgnoreMouseEvents(true)
      this.compactTimer = setTimeout(() => {
        this.compactTimer = undefined
        if (!this.windowsAvailable) return
        const returnFocus = this.panel.isFocused()
        this.panel.hide()
        if (returnFocus && this.window.isVisible()) this.window.focus()
        this.options.changed()
      }, MENU_TRANSITION_MS)
    }
    this.refreshMouseInput()
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
    if (visible && nativeHitTesting) {
      this.refreshMouseInput()
      this.hitTimer = setInterval(() => this.refreshMouseInput(), 16)
    } else if (!visible) {
      clearInterval(this.hitTimer)
      this.hitTimer = undefined
      this.endDrag(); this.endResize()
    }
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
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt > 15_000) { this.endResize(); return }
      this.sampleResize()
    }, 16)
    const initialSize = this.store.getSettings().expandedSize
    this.resize = { timer, cursor: screen.getCursorScreenPoint(), size: initialSize, initialSize,
      bounds: this.panel.getBounds(), direction: this.panelDirection, moved: false }
  }

  private sampleResize(): void {
    const resize = this.resize
    if (!resize) return
    const cursor = screen.getCursorScreenPoint()
    // Dragging the grip away from the pet grows the panel along its opening direction.
    const dx = (cursor.x - resize.cursor.x) * (resize.direction.horizontal === 'left' ? -1 : 1)
    const dy = (cursor.y - resize.cursor.y) * (resize.direction.vertical === 'up' ? -1 : 1)
    if (!resize.moved && Math.hypot(dx, dy) < 3) return
    resize.moved = true
    const width = dx === 0 ? resize.initialSize.width
      : Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, resize.bounds.width + dx))
    const height = dy === 0 ? resize.initialSize.height
      : Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, resize.bounds.height + PANEL_HEIGHT_OFFSET + dy))
    if (resize.size.width === width && resize.size.height === height) return
    resize.size = { width, height }
    this.placePanel(resize.size)
  }

  endResize(reportFailure = false): void {
    if (!this.resize) return
    if (reportFailure) this.sampleResize()
    const { timer, size: expandedSize, moved } = this.resize
    clearInterval(timer)
    this.resize = undefined
    if (!moved) return
    let failure: unknown
    try {
      this.store.updateSettings({ expandedSize })
      this.placePanel(expandedSize)
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
      area ?? screen.getDisplayMatching({ ...anchor, ...PET_AREA }).workArea, this.resize?.direction)
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
    clearInterval(this.hitTimer)
    this.endDrag()
    this.endResize()
    this.savePosition()
    this.quitting = true
  }
}
