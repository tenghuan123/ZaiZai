import { app } from 'electron'
import { AppError } from '../domain/errors'
import type { LoginItems } from '../settings/service'

export class SystemLoginItems implements LoginItems {
  read(): boolean { return app.getLoginItemSettings().openAtLogin }
  write(enabled: boolean): void {
    if (!app.isPackaged || !['darwin', 'win32'].includes(process.platform)) {
      throw new AppError('UNAVAILABLE', '请在安装版中设置开机自启，开发运行不会修改系统登录项。', 'openAtLogin')
    }
    try { app.setLoginItemSettings({ openAtLogin: enabled }) }
    catch { throw new AppError('UNAVAILABLE', '系统自启动设置失败，请检查系统登录项权限后重试。', 'openAtLogin') }
    const actual = app.getLoginItemSettings()
    if (actual.openAtLogin !== enabled || (enabled && process.platform === 'darwin' && actual.status !== 'enabled') ||
      (enabled && process.platform === 'win32' && !actual.executableWillLaunchAtLogin)) {
      throw new AppError('UNAVAILABLE', '系统未接受自启动设置，请在系统登录项中检查 zaizai 的权限后重试。', 'openAtLogin')
    }
  }
}
