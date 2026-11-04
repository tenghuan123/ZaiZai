import type { AppUpdater, UpdateInfo } from 'electron-updater'
import type { EventEmitter } from 'node:events'
import type { UpdateState, UpdateStatus } from '../../shared/updates'
import { AppError } from '../domain/errors'

export type UpdateDriver = Pick<AppUpdater, 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'
  | 'autoDownload' | 'autoInstallOnAppQuit' | 'allowDowngrade' | 'allowPrerelease'> & Pick<EventEmitter, 'on' | 'removeListener'>
const CHECK_INTERVAL = 4 * 60 * 60 * 1000

export class UpdateService {
  private status: UpdateStatus
  private inFlight = false
  private disposed = false
  private startupTimer?: ReturnType<typeof setTimeout>
  private interval?: ReturnType<typeof setInterval>
  private cancellation?: { cancel(): void }

  constructor(private readonly driver: UpdateDriver | null, private readonly currentVersion: string,
    disabledReason: string, private readonly changed: (state: UpdateState) => void,
    private readonly log: (event: string, details?: object) => void) {
    this.status = driver ? { phase: 'idle' } : { phase: 'disabled', reason: disabledReason }
    if (!driver) return
    driver.autoDownload = false
    // Installation is explicit: ordinary Quit must not silently apply a downloaded update.
    driver.autoInstallOnAppQuit = false
    driver.allowDowngrade = false
    driver.allowPrerelease = false
    driver.on('update-available', this.available)
    driver.on('update-not-available', this.notAvailable)
    driver.on('download-progress', this.progress)
    driver.on('update-downloaded', this.downloaded)
    driver.on('error', this.failed)
  }

  getState(): UpdateState { return { currentVersion: this.currentVersion, status: this.status } }

  start(): void {
    if (!this.driver || this.disposed || this.startupTimer || this.interval) return
    this.startupTimer = setTimeout(() => this.check(), 15_000)
    this.interval = setInterval(() => this.check(), CHECK_INTERVAL)
    this.startupTimer.unref(); this.interval.unref()
  }

  check(): void {
    if (!this.driver) throw new AppError('UNAVAILABLE', this.status.phase === 'disabled' ? this.status.reason : '更新暂不可用。')
    if (this.disposed || this.inFlight || this.status.phase === 'ready' || this.status.phase === 'installing') return
    this.inFlight = true
    this.publish({ phase: 'checking' })
    void this.checkAndDownload()
  }

  private async checkAndDownload(): Promise<void> {
    try {
      const result = await this.driver!.checkForUpdates()
      if (this.disposed) return
      if (!result) throw new Error('更新检查未启动。')
      this.cancellation = result.cancellationToken
      if (this.status.phase === 'downloading') await this.driver!.downloadUpdate(result.cancellationToken)
    } catch (error) { this.failed(error instanceof Error ? error : new Error(String(error))) }
    finally { this.inFlight = false; this.cancellation = undefined }
  }

  install(): void {
    if (!this.driver || this.disposed || this.status.phase !== 'ready') throw new AppError('UNAVAILABLE', '更新尚未下载完成。')
    this.publish({ ...this.status, phase: 'installing' })
    // Let the IPC acknowledgement reach the renderer before the updater quits the app.
    setImmediate(() => {
      if (this.disposed) return
      try { this.driver!.quitAndInstall(false, true) }
      catch (error) { this.failed(error instanceof Error ? error : new Error(String(error))) }
    })
  }

  private available = (info: UpdateInfo): void => {
    if (this.status.phase !== 'checking') return
    const notes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map(note => note.note).filter(Boolean).join('\n') : info.releaseNotes ?? ''
    this.publish({ phase: 'downloading', version: info.version, notes: notes.slice(0, 5000), progress: 0 })
  }
  private notAvailable = (): void => {
    if (this.status.phase === 'checking') this.publish({ phase: 'up-to-date' })
  }
  private progress = (info: { percent: number }): void => {
    if (this.status.phase !== 'downloading' || !Number.isFinite(info.percent)) return
    this.publish({ ...this.status, progress: Math.min(100, Math.max(0, Math.floor(info.percent))) })
  }
  private downloaded = (): void => {
    if (this.status.phase === 'downloading') this.publish({ ...this.status, phase: 'ready', progress: 100 })
  }
  private failed = (error: Error): void => {
    if (this.disposed || this.status.phase === 'error') return
    this.log('update-error', { message: error.message })
    this.publish({ phase: 'error', message: '更新未完成，请检查网络后重试。当前版本仍可继续使用。' })
  }
  private publish(status: UpdateStatus): void {
    if (this.disposed) return
    if (this.status.phase !== status.phase) this.log('update-state', { phase: status.phase })
    this.status = status
    this.changed(this.getState())
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.startupTimer); clearInterval(this.interval)
    this.cancellation?.cancel()
    this.driver?.removeListener('update-available', this.available)
    this.driver?.removeListener('update-not-available', this.notAvailable)
    this.driver?.removeListener('download-progress', this.progress)
    this.driver?.removeListener('update-downloaded', this.downloaded)
    // Keep the error listener attached until process exit: an in-flight request can reject after disposal.
  }
}
