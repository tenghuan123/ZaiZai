import { Temporal } from '@js-temporal/polyfill'
import { AppError } from './errors'

export interface ClockSnapshot { nowMs: number; today: string; timeZone: string }
export type Clock = () => ClockSnapshot
export function clockSnapshot(nowMs = Date.now(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): ClockSnapshot {
  return { nowMs, timeZone, today: Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(timeZone).toPlainDate().toString() }
}
export function validDate(value: unknown, field = 'date'): string {
  try {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') throw new Error()
    Temporal.PlainDate.from(value, { overflow: 'reject' })
    return value
  } catch { throw new AppError('VALIDATION', '请输入有效日期（YYYY-MM-DD）。', field) }
}
export function validTime(value: unknown, field = 'time'): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new AppError('VALIDATION', '请输入有效时间（HH:mm）。', field)
  }
  return value
}
export function dueAt(date: string, time: string, timeZone: string): number {
  return Temporal.PlainDate.from(date).toPlainDateTime(time).toZonedDateTime(timeZone, { disambiguation: 'compatible' }).epochMilliseconds
}
export function dayStart(date: string, timeZone: string): number {
  return Temporal.PlainDate.from(date).toZonedDateTime(timeZone).startOfDay().epochMilliseconds
}
export function nextDayStart(clock: ClockSnapshot): number {
  const tomorrow = Temporal.PlainDate.from(clock.today).add({ days: 1 }).toString()
  return dayStart(tomorrow, clock.timeZone)
}
export function localTimeAt(nowMs: number, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(timeZone).toPlainTime().toString({ smallestUnit: 'minute' })
}
