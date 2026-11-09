import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import type { Settings } from '../../shared/contracts'
import { BUILT_IN_PET_ID, isBuiltInPetId } from '../../shared/pet'
import { AppError, checkVersion } from '../domain/errors'
import { boolean, fields, object, version } from '../domain/validation'
import { validTime } from '../domain/time'
import { MIN_SIZE, MAX_SIZE, STANDARD_SIZE } from '../../shared/window'

export const defaultSettings: Settings = {
  version: 1, displayMode: 'expanded', alwaysOnTop: true, offworkTime: '18:00', defaultReminderEnabled: true,
  position: null, petId: BUILT_IN_PET_ID, petDisplay: {}, openAtLogin: false, reminderSoundEnabled: true, expandedSize: STANDARD_SIZE
}

// Released builds stored name-derived IDs. Match their digests so the old names
// do not need to ship with the app. New settings writes persist the current IDs.
const legacyPetIds = new Map([
  ['e06f8169a271c1654c2515ba516d7168060232726df95393f60f3719d91450e1', 'xiang-xiang-mao'],
  ['d6461ded371ada41b8223dfb2e23615314a75206ecb76f91ae752413f866fbb3', 'chou-chou-wang'],
  ['afa27d71e48b33507abcd851516f9ac7b7459781c775dd6010d1932f88d27629', 'zhu-zhu']
])
function currentPetId(id: string): string {
  if (id === 'builtin-cat') return BUILT_IN_PET_ID
  if (isBuiltInPetId(id)) return id
  return legacyPetIds.get(createHash('sha256').update(id).digest('hex')) ?? id
}

export function validateSettings(input: unknown): Settings {
  const value = object(input)
  fields(value, Object.keys(defaultSettings))
  version(value.version)
  if (value.displayMode !== 'expanded' && value.displayMode !== 'compact') throw new AppError('VALIDATION', '窗口模式不正确。')
  boolean(value.alwaysOnTop, 'alwaysOnTop'); boolean(value.defaultReminderEnabled, 'defaultReminderEnabled')
  boolean(value.openAtLogin, 'openAtLogin'); boolean(value.reminderSoundEnabled, 'reminderSoundEnabled')
  const size = object(value.expandedSize)
  fields(size, ['width', 'height'])
  for (const key of ['width', 'height'] as const) {
    if (typeof size[key] !== 'number' || !Number.isInteger(size[key]) || size[key] < MIN_SIZE[key] || size[key] > MAX_SIZE[key]) {
      throw new AppError('VALIDATION', '窗口尺寸超出可用范围。', 'expandedSize')
    }
  }
  if (value.offworkTime !== null) validTime(value.offworkTime, 'offworkTime')
  if (value.position !== null) {
    const position = object(value.position)
    fields(position, ['x', 'y'])
    if (typeof position.x !== 'number' || typeof position.y !== 'number' || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new AppError('VALIDATION', '窗口坐标不正确。')
    }
  }
  if (typeof value.petId !== 'string' || !/^[\w-]{1,80}$/.test(value.petId)) throw new AppError('VALIDATION', '宠物标识不正确。')
  for (const [id, entry] of Object.entries(object(value.petDisplay))) {
    if (!/^[\w-]{1,80}$/.test(id)) throw new AppError('VALIDATION', '宠物标识不正确。')
    const display = object(entry)
    fields(display, ['scale', 'anchorX', 'anchorY'])
    for (const key of ['scale', 'anchorX', 'anchorY']) {
      if (typeof display[key] !== 'number' || !Number.isFinite(display[key])) throw new AppError('VALIDATION', '宠物显示参数不正确。')
    }
    if ((display.scale as number) <= 0 || (display.scale as number) > 4 ||
      (display.anchorX as number) < 0 || (display.anchorX as number) > 1 ||
      (display.anchorY as number) < 0 || (display.anchorY as number) > 1) throw new AppError('VALIDATION', '宠物显示参数超出范围。')
  }
  return value as unknown as Settings
}
export class SettingsRepository {
  constructor(readonly db: Database.Database) {}
  getSettings(): Settings {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE id=1').get() as { value: string }
    try {
      const settings = validateSettings(JSON.parse(row.value))
      const petDisplay = { ...settings.petDisplay }
      for (const [id, display] of Object.entries(settings.petDisplay)) {
        const currentId = currentPetId(id)
        if (currentId === id) continue
        petDisplay[currentId] ??= display
        delete petDisplay[id]
      }
      return { ...settings, petId: currentPetId(settings.petId), petDisplay }
    }
    catch (error) { throw new Error('本地设置损坏，应用不会自动重置。', { cause: error }) }
  }
  updateSettings(patch: Partial<Omit<Settings, 'version'>>, expectedVersion?: number): Settings {
    return this.db.transaction(() => {
      const current = this.getSettings()
      if (expectedVersion !== undefined) checkVersion(current.version, version(expectedVersion))
      const next = validateSettings({ ...current, ...patch, version: current.version + 1 })
      this.db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(next))
      return next
    })()
  }
  updateFromUI(input: unknown): Settings {
    const value = object(input)
    fields(value, ['expectedVersion', 'patch'])
    const patch = object(value.patch)
    fields(patch, ['offworkTime', 'defaultReminderEnabled', 'alwaysOnTop', 'petId', 'openAtLogin', 'reminderSoundEnabled', 'expandedSize'])
    if ('petId' in patch && !isBuiltInPetId(patch.petId)) throw new AppError('VALIDATION', '请选择已内置的桌宠角色。', 'petId')
    return this.updateSettings(patch, version(value.expectedVersion))
  }
}
