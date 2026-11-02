import type { Scene } from '../../shared/tasks'
import { AppError } from './errors'
import { validDate, validTime } from './time'

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('VALIDATION', '请求参数不正确。')
  return value as Record<string, unknown>
}
export function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new AppError('VALIDATION', '包含未定义的字段。')
}
export function identifier(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) {
    throw new AppError('VALIDATION', '记录标识不正确。', field)
  }
  return value
}
export function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new AppError('VALIDATION', '选项必须为布尔值。', field)
  return value
}
export function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new AppError('VALIDATION', '版本号不正确。', 'expectedVersion')
  return value
}
export function title(value: unknown): string {
  if (typeof value !== 'string' || [...value.trim()].length < 1 || [...value.trim()].length > 60) {
    throw new AppError('VALIDATION', '请输入 1 至 60 字的任务内容。', 'title')
  }
  return value.trim()
}
export function scene(value: unknown): Scene {
  if (value === undefined) return 'generic'
  if (value !== 'generic' && value !== 'water' && value !== 'stretch') throw new AppError('VALIDATION', '任务场景不正确。', 'scene')
  return value
}
export function onceFields(value: Record<string, unknown>) {
  return { title: title(value.title), scheduledDate: validDate(value.scheduledDate, 'scheduledDate'),
    scheduledTime: value.scheduledTime === null ? null : validTime(value.scheduledTime, 'scheduledTime'),
    reminderEnabled: boolean(value.reminderEnabled, 'reminderEnabled'), scene: scene(value.scene) }
}
export function planFields(value: Record<string, unknown>) {
  const startDate = validDate(value.startDate, 'startDate')
  const endDate = value.endDate === null ? null : validDate(value.endDate, 'endDate')
  if (endDate !== null && startDate > endDate) throw new AppError('VALIDATION', '结束日期不能早于开始日期。', 'endDate')
  return { title: title(value.title), startDate, endDate,
    reminderEnabled: boolean(value.reminderEnabled, 'reminderEnabled'), scene: scene(value.scene) }
}
