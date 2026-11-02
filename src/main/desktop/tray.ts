import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import type { DesktopWindow } from './window'
import type { TaskService } from '../tasks/service'
import { clockSnapshot } from '../domain/time'

export class DesktopTray {
  readonly tray: Tray
  constructor(resources: string, private readonly desktop: DesktopWindow, private readonly tasks: TaskService,
    private readonly quit: () => void, private readonly reportError: (error: unknown) => void) {
    const image = nativeImage.createFromPath(join(resources, process.platform === 'darwin' ? 'trayTemplate.png' : 'trayColor.png'))
    if (image.isEmpty()) throw new Error('托盘图标未能加载。')
    image.setTemplateImage(process.platform === 'darwin')
    this.tray = new Tray(image)
    this.tray.setToolTip('桌面伙伴')
    if (process.platform === 'win32') {
      this.tray.on('click', () => desktop.state.visible ? desktop.hide() : desktop.show())
    }
    this.refresh()
  }

  refresh(): void {
    const clock = clockSnapshot()
    const { completed, total } = this.tasks.getDay(clock.today, clock).progress
    const safe = (action: () => void): void => { try { action() } catch (error) { this.reportError(error) } }
    if (process.platform === 'darwin') this.tray.setTitle(`${completed}/${total}`)
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示桌面伙伴', click: () => this.desktop.show() },
      { label: '仅显示桌宠', type: 'checkbox', checked: this.desktop.state.mode === 'compact',
        click: () => safe(() => { this.desktop.setMode(this.desktop.state.mode === 'compact' ? 'expanded' : 'compact'); this.desktop.show() }) },
      { label: '始终置顶', type: 'checkbox', checked: this.desktop.state.alwaysOnTop,
        click: item => safe(() => this.desktop.setAlwaysOnTop(item.checked)) },
      { type: 'separator' },
      { label: '退出桌面伙伴', click: this.quit, accelerator: process.platform === 'darwin' ? 'Command+Q' : undefined }
    ]))
  }

  dispose(): void { this.tray.destroy() }
}

export function installApplicationMenu(): void {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit', label: '退出桌面伙伴' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ]))
}
