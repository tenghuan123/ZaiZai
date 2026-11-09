import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UpdateCheckResult, UpdateInfo } from 'electron-updater'
import { UpdateService } from '../src/main/updates/service'
import { InstalledRelease } from '../src/main/updates/installed-release'
import type { UpdateState } from '../src/shared/updates'

const info: UpdateInfo = { version: '0.2.0', files: [], path: '', sha512: '', releaseDate: '2026-11-04', releaseNotes: '新增更新功能' }
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowDowngrade = true
  allowPrerelease = true
  checks = 0; downloads = 0; installs = 0
  checkAction: () => Promise<UpdateCheckResult | null> = async () => {
    this.emit('update-not-available', info)
    return { isUpdateAvailable: false, updateInfo: info, versionInfo: info }
  }
  downloadAction: () => Promise<string[]> = async () => {
    this.emit('download-progress', { percent: 48.9 })
    this.emit('update-downloaded', { ...info, downloadedFile: '/cache/test.exe' })
    return ['/cache/test.exe']
  }
  installAction = (): void => {}
  checkForUpdates(): Promise<UpdateCheckResult | null> { this.checks++; return this.checkAction() }
  downloadUpdate(): Promise<string[]> { this.downloads++; return this.downloadAction() }
  quitAndInstall(): void { this.installs++; this.installAction() }
  offer(): void {
    this.checkAction = async () => {
      this.emit('update-available', info)
      return { isUpdateAvailable: true, updateInfo: info, versionInfo: info }
    }
  }
}
function fixture(driver: FakeUpdater | null = new FakeUpdater()) {
  const states: UpdateState[] = [], logs: string[] = []
  const service = new UpdateService(driver, '0.1.0', '此安装包未配置更新。', state => states.push(state), event => logs.push(event))
  return { driver: driver!, service, states, logs }
}

test('unconfigured builds cannot contact a server or install an update', () => {
  const f = fixture(null)
  f.service.start()
  assert.deepEqual(f.service.getState(), { currentVersion: '0.1.0', status: { phase: 'disabled', reason: '此安装包未配置更新。' }, whatsNew: null })
  assert.throws(() => f.service.check(), /未配置更新/)
  assert.throws(() => f.service.install(), /尚未下载完成/)
  f.service.dispose()
})

test('existing installs see release notes once and downgrading does not reset the seen version', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zaizai-release-'))
  try {
    const open = (version: string) => new InstalledRelease(join(directory, 'last-seen-version'), version, '有新功能', true,
      error => { throw error })
    const upgraded = open('0.10.0')
    assert.equal(upgraded.whatsNew?.pending, true)
    upgraded.acknowledge()
    assert.equal(open('0.9.9').whatsNew?.pending, false)
    assert.equal(open('0.10.0').whatsNew?.pending, false)
    assert.equal(open('0.10.1').whatsNew?.pending, true)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('startup and periodic checks run once per interval and stop on shutdown', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = fixture()
  f.service.start(); f.service.start()
  context.mock.timers.tick(14_999)
  assert.equal(f.driver.checks, 0)
  context.mock.timers.tick(1); await tick()
  assert.equal(f.driver.checks, 1)
  assert.equal(f.service.getState().status.phase, 'up-to-date')
  context.mock.timers.tick(4 * 60 * 60 * 1000); await tick()
  assert.equal(f.driver.checks, 2)
  f.service.dispose()
  context.mock.timers.tick(4 * 60 * 60 * 1000)
  assert.equal(f.driver.checks, 2)
})

test('checks coalesce; download is automatic but installation requires an explicit ready-state action', async () => {
  const f = fixture()
  let resolveCheck!: (result: UpdateCheckResult) => void
  f.driver.checkAction = () => new Promise(resolve => { resolveCheck = resolve })
  let finishDownload!: (files: string[]) => void
  f.driver.downloadAction = () => new Promise(resolve => { finishDownload = resolve })
  f.service.check(); f.service.check()
  assert.equal(f.driver.checks, 1)
  assert.throws(() => f.service.install(), /尚未下载完成/)
  f.driver.emit('update-available', { ...info, releaseNotes: [{ version: '0.2.0', note: '修复提醒' }] })
  resolveCheck({ isUpdateAvailable: true, updateInfo: info, versionInfo: info })
  await tick()
  assert.equal(f.driver.downloads, 1)
  assert.equal(f.driver.autoDownload, false)
  assert.equal(f.driver.autoInstallOnAppQuit, false)
  assert.equal(f.driver.allowDowngrade, false)
  assert.equal(f.driver.allowPrerelease, false)
  f.driver.emit('download-progress', { percent: 104 })
  assert.deepEqual(f.service.getState().status, { phase: 'downloading', version: '0.2.0', notes: '修复提醒', progress: 100 })
  f.service.check()
  assert.equal(f.driver.checks, 1)
  f.driver.emit('update-downloaded', info); finishDownload(['/cache/test.exe']); await tick()
  assert.equal(f.service.getState().status.phase, 'ready')
  f.service.check()
  assert.equal(f.driver.checks, 1, 'a downloaded update cannot be replaced by another check')
  assert.equal(f.driver.installs, 0)
  f.service.install()
  assert.throws(() => f.service.install(), /尚未下载完成/)
  assert.equal(f.driver.installs, 0, 'IPC acknowledgement is sent before installation')
  await tick()
  assert.equal(f.driver.installs, 1)
  f.service.dispose()
})

test('network/download failure is observable once and can retry without installing the failed update', async () => {
  const f = fixture(); f.driver.offer()
  f.driver.downloadAction = async () => {
    const error = new Error('ETIMEDOUT')
    f.driver.emit('error', error); throw error
  }
  f.service.check(); await tick()
  assert.equal(f.service.getState().status.phase, 'error')
  assert.equal(f.logs.filter(event => event === 'update-error').length, 1)
  assert.throws(() => f.service.install(), /尚未下载完成/)
  f.driver.downloadAction = async () => { f.driver.emit('update-downloaded', info); return ['/cache/test.exe'] }
  f.service.check(); await tick()
  assert.equal(f.driver.checks, 2)
  assert.equal(f.service.getState().status.phase, 'ready')
  assert.equal(f.driver.installs, 0)
  f.service.dispose()
})

test('shutdown cancels a download and ignores late progress, errors and installation callbacks', async () => {
  const f = fixture(); f.driver.offer()
  let cancelled = false, finish!: (files: string[]) => void
  f.driver.checkAction = async () => {
    f.driver.emit('update-available', info)
    return { isUpdateAvailable: true, updateInfo: info, versionInfo: info, cancellationToken: { cancel: () => { cancelled = true } } as never }
  }
  f.driver.downloadAction = () => new Promise(resolve => { finish = resolve })
  f.service.check(); await tick()
  const count = f.states.length
  f.service.dispose()
  assert.equal(cancelled, true)
  f.driver.emit('download-progress', { percent: 90 }); f.driver.emit('update-downloaded', info)
  f.driver.emit('error', new Error('request cancelled')); finish([]); await tick()
  assert.equal(f.states.length, count)
  assert.equal(f.driver.installs, 0)
  f.service.check()
  assert.equal(f.driver.checks, 1)
})

test('installer errors return to a recoverable state instead of leaving a false installing state', async () => {
  const f = fixture(); f.driver.offer()
  f.service.check(); await tick()
  f.driver.installAction = () => { f.driver.emit('error', new Error('installer could not start')) }
  f.service.install(); await tick()
  assert.equal(f.service.getState().status.phase, 'error')
  f.service.check(); await tick()
  assert.equal(f.service.getState().status.phase, 'ready')
  f.service.install(); f.service.dispose(); await tick()
  assert.equal(f.driver.installs, 1, 'scheduled installation is cancelled when the app shuts down')
})
