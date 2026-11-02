import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, openSync, writeFileSync } from 'node:fs'
import { createTaskModel, importM0 } from './migrations/002-task-model'
import { SettingsRepository } from '../settings/repository'

export const schemaVersion = 2
export class MigrationError extends Error {
  constructor(readonly databasePath: string, readonly backupPath: string | null, cause: unknown) {
    super(`本地数据升级失败，原库未重置。数据库：${databasePath}。${backupPath ? `迁移前备份：${backupPath}。` : ''}\n${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  }
}
export class Connection {
  readonly db: Database.Database
  readonly backupPath: string | null
  constructor(readonly path: string, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    const db = new Database(path)
    this.db = db
    let backupPath: string | null = null
    try {
      db.pragma('foreign_keys = ON')
      const current = db.pragma('user_version', { simple: true }) as number
      if (current > schemaVersion) throw new Error('数据版本较新，请使用匹配版本的应用打开。')
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      if (current === 0 && tables.length) throw new Error('发现没有版本号的已有数据，拒绝覆盖。')
      if (current < schemaVersion) {
        if (tables.length && path !== ':memory:') {
          const destination = `${path}.pre-v${schemaVersion}-${Date.now()}-${randomUUID()}.bak`
          // serialize includes committed WAL pages; copying only the .sqlite3 file would miss them.
          const fd = openSync(destination, 'wx', 0o600)
          try { writeFileSync(fd, db.serialize()); fsyncSync(fd) } finally { closeSync(fd) }
          backupPath = destination
        }
        db.transaction(() => {
          createTaskModel(db)
          if (current === 1) importM0(db, timeZone)
          new SettingsRepository(db).getSettings()
          db.pragma(`user_version = ${schemaVersion}`)
        })()
      }
      db.pragma('journal_mode = WAL')
      new SettingsRepository(db).getSettings()
      this.backupPath = backupPath
    } catch (error) {
      db.close()
      throw new MigrationError(path, backupPath, error)
    }
  }
  close(): void { this.db.close() }
}
