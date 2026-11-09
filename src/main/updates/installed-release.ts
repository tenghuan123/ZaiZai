import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { WhatsNew } from '../../shared/updates'

const releaseVersion = /^\d+\.\d+\.\d+$/

function isNewer(version: string, previous: string): boolean {
  const oldParts = previous.split('.').map(Number)
  const parts = version.split('.').map(Number)
  const difference = parts.findIndex((part, index) => part !== oldParts[index])
  return difference !== -1 && parts[difference] > oldParts[difference]
}

export class InstalledRelease {
  private pending = false

  constructor(private readonly path: string, private readonly version: string,
    private readonly notes: string, existingInstall: boolean, reportError: (error: unknown) => void) {
    if (!releaseVersion.test(version)) return
    try {
      let previous: string | undefined
      try { previous = readFileSync(path, 'utf8').trim() }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (previous !== undefined && !releaseVersion.test(previous)) throw new Error('上次查看的版本记录无效。')
      // Existing installations predate the version marker. A fresh install starts with the current version.
      const upgraded = previous === undefined ? existingInstall : isNewer(version, previous)
      this.pending = upgraded && !!notes
      if (!this.pending && (previous === undefined || upgraded)) this.saveVersion()
    } catch (error) { reportError(error) }
  }

  get whatsNew(): WhatsNew | null {
    return this.notes ? { notes: this.notes, pending: this.pending } : null
  }

  acknowledge(): void {
    if (!this.pending) return
    this.saveVersion()
    this.pending = false
  }

  private saveVersion(): void {
    const temporary = this.path + '.tmp'
    writeFileSync(temporary, this.version, 'utf8')
    renameSync(temporary, this.path)
  }
}
