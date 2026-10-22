import type { AppError, Result } from '../../shared/types'

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail(
  code: AppError['code'],
  message: string,
  detail?: string
): Result<never> {
  return {
    ok: false,
    error: detail ? { code, message, detail } : { code, message }
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
