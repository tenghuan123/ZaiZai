import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import type { DesktopWindow } from './window'
import type { Store } from '../database/store'

export class DesktopTray {
  readonly tray: Tray
  constructor(resources: string, private readonly desktop: DesktopWindow, private readonly store: Store,
    private readonly schedule: (hide: boolean) => void, private readonly quit: () => void) {
    const image = nativeImage.createFromPath(join(resources, process.platform === 'darwin' ? 'trayTemplate.png' : 'trayColor.png'))
    if (image.isEmpty()) throw new Error('托盘图标未能加载。')
    image.setTemplateImage(process.platform === 'darwin')
    this.tray = new Tray(image)
    this.tray.setToolTip('桌面伙伴 · M0')
    if (process.platform === 'win32') {
      this.tray.on('click', () => desktop.state.visible ? desktop.hide() : desktop.show())
    }
    this.refresh()
  }

  refresh(): void {
    const items = this.store.list()
    const done = items.filter(item => item.completedAt !== null).length
    if (process.platform === 'darwin') this.tray.setTitle(`${done}/${items.length}`)
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示桌面伙伴', click: () => this.desktop.show() },
      { label: '仅显示桌宠', type: 'checkbox', checked: this.desktop.state.mode === 'compact',
        click: () => { this.desktop.setMode(this.desktop.state.mode === 'compact' ? 'expanded' : 'compact'); this.desktop.show() } },
      { label: '始终置顶', type: 'checkbox', checked: this.desktop.state.alwaysOnTop,
        click: item => this.desktop.setAlwaysOnTop(item.checked) },
      { type: 'separator' },
      { label: '5 秒后提醒我', click: () => this.schedule(false) },
      { label: '隐藏并在 5 秒后提醒', click: () => this.schedule(true) },
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
