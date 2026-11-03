import type { Settings } from '../../shared/contracts'
import { object } from '../domain/validation'
import { SettingsRepository } from './repository'

export interface LoginItems { read(): boolean; write(enabled: boolean): void }

// System preferences must succeed with the database write; failed saves restore the previous system value.
export class SettingsService {
  constructor(private readonly store: SettingsRepository, private readonly login: LoginItems,
    private readonly applyWindow: (settings: Settings) => void, private readonly reportError: (error: unknown) => void) {}

  update(input: unknown): Settings {
    const before = this.store.getSettings()
    let previousLogin: boolean | undefined
    let appliedWindow = false
    try {
      return this.store.db.transaction(() => {
        const next = this.store.updateFromUI(input)
        const patch = object(object(input).patch)
        if ('openAtLogin' in patch) {
          previousLogin = this.login.read()
          this.login.write(next.openAtLogin)
        }
        if ('alwaysOnTop' in patch || 'expandedSize' in patch) {
          appliedWindow = true
          this.applyWindow(next)
        }
        return next
      })()
    } catch (error) {
      if (previousLogin !== undefined) {
        try { if (this.login.read() !== previousLogin) this.login.write(previousLogin) } catch (rollbackError) { this.reportError(rollbackError) }
      }
      if (appliedWindow) {
        try { this.applyWindow(before) } catch (rollbackError) { this.reportError(rollbackError) }
      }
      throw error
    }
  }
}
