import type { AppFailure } from '../../shared/contracts'
export type ErrorCode = AppFailure['code']
export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly field?: string) { super(message) }
}
export function requireFound<T>(value: T | undefined, message = '记录不存在。'): T {
  if (value === undefined) throw new AppError('NOT_FOUND', message)
  return value
}
export function checkVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new AppError('CONFLICT', '记录已变化，请重新读取后再编辑。')
}
