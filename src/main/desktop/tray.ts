import { app, dialog, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import type { DesktopWindow } from './window'
import type { TaskService } from '../tasks/service'
import { clockSnapshot } from '../domain/time'
import type { SettingsRepository } from '../settings/repository'
import type { SettingsService } from '../settings/service'
import type { SettingsPatch } from '../../shared/contracts'
import { LARGE_SIZE, STANDARD_SIZE } from '../../shared/window'

export class DesktopTray {
  readonly tray: Tray
  constructor(resources: string, private readonly desktop: DesktopWindow, private readonly tasks: TaskService,
    private readonly settings: SettingsRepository, private readonly preferences: SettingsService, private readonly changed: () => void,
    private readonly quit: () => void, private readonly reportError: (error: unknown) => void) {
    const image = nativeImage.createFromPath(join(resources, process.platform === 'darwin' ? 'trayTemplate.png' : 'trayColor.png'))
    if (image.isEmpty()) throw new Error('托盘图标未能加载。')
    image.setTemplateImage(process.platform === 'darwin')
    this.tray = new Tray(image)
    this.tray.setToolTip('zaizai')
    if (process.platform === 'win32') {
      this.tray.on('click', () => desktop.state.visible ? desktop.hide() : desktop.show())
    }
    this.refresh()
  }

  refresh(): void {
    const clock = clockSnapshot()
    const { completed, total } = this.tasks.getDay(clock.today, clock).progress
    if (process.platform === 'darwin') this.tray.setTitle(`${completed}/${total}`)
    this.tray.setContextMenu(this.menu())
  }

  private menu(): Menu {
    const safe = (action: () => void): void => { try { action() } catch (error) {
      this.reportError(error)
      void dialog.showMessageBox(this.desktop.window, { type: 'error', message: error instanceof Error ? error.message : String(error) }).catch(this.reportError)
    } }
    const current = this.settings.getSettings()
    const update = (patch: SettingsPatch): void => {
      this.preferences.update({ expectedVersion: this.settings.getSettings().version, patch }); this.changed()
    }
    return Menu.buildFromTemplate([
      { label: '显示桌面伙伴', click: () => this.desktop.show() },
      { label: '仅显示桌宠', type: 'checkbox', checked: this.desktop.state.mode === 'compact',
        click: () => safe(() => { this.desktop.setMode(this.desktop.state.mode === 'compact' ? 'expanded' : 'compact'); this.desktop.show() }) },
      { label: '窗口显示层级', submenu: [
        { label: '📌 始终置顶', type: 'radio', checked: this.desktop.state.alwaysOnTop, click: () => safe(() => update({ alwaysOnTop: true })) },
        { label: '🖥 仅留在桌面', type: 'radio', checked: !this.desktop.state.alwaysOnTop, click: () => safe(() => update({ alwaysOnTop: false })) }
      ] },
      { label: '框框尺寸', submenu: [
        { label: '标准尺寸', click: () => safe(() => update({ expandedSize: STANDARD_SIZE })) },
        { label: '拉大框框', click: () => safe(() => update({ expandedSize: LARGE_SIZE })) }
      ] },
      { label: '开机自动启动', type: 'checkbox', checked: current.openAtLogin, click: item => safe(() => update({ openAtLogin: item.checked })) },
      { label: '提醒摇铃声音', type: 'checkbox', checked: current.reminderSoundEnabled, click: item => safe(() => update({ reminderSoundEnabled: item.checked })) },
      { label: '隐藏到托盘 / 菜单栏', click: () => this.desktop.hide() },
      { type: 'separator' },
      { label: '退出桌面伙伴', click: this.quit, accelerator: process.platform === 'darwin' ? 'Command+Q' : undefined }
    ])
  }

  showContextMenu(): void { this.menu().popup({ window: this.desktop.window }) }

  dispose(): void { this.tray.destroy() }
}

export function installApplicationMenu(): void {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit', label: '退出桌面伙伴' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ]))
}
