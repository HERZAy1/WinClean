import type { AppError } from '../../shared/types'

const USER_MESSAGES: Record<AppError['code'], string> = {
  NOT_ELEVATED: '需要管理员权限',
  PERMISSION_DENIED: '没有权限访问该路径',
  PATH_BLOCKED: '该路径已被安全策略拦截',
  NOT_FOUND: '请求的内容不存在',
  LLM_NOT_CONFIGURED: 'LLM 尚未配置，请先在设置中填写模型 ID 和 API Key',
  LLM_AUTH_FAILED: 'API Key 无效或没有访问权限',
  LLM_RATE_LIMITED: '模型请求过于频繁，请稍后再试',
  LLM_BAD_RESPONSE: '模型返回格式无法解析',
  LLM_NETWORK: '无法连接模型服务，请检查网络或 Base URL',
  CANCELLED: '操作已取消',
  INTERNAL: '操作失败'
}

export class LlmError extends Error {
  readonly code: AppError['code']
  readonly detail?: string
  readonly retryAfterMs?: number
  readonly status?: number

  constructor(
    code: AppError['code'],
    options: { detail?: string; retryAfterMs?: number; status?: number } = {}
  ) {
    super(USER_MESSAGES[code])
    this.name = 'LlmError'
    this.code = code
    this.detail = options.detail
    this.retryAfterMs = options.retryAfterMs
    this.status = options.status
  }
}

export function mapHttpError(status: number, retryAfterMs?: number): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError('LLM_AUTH_FAILED', { status })
  }
  if (status === 429) {
    return new LlmError('LLM_RATE_LIMITED', { status, retryAfterMs })
  }
  if (status >= 500) {
    return new LlmError('LLM_NETWORK', { status })
  }
  return new LlmError('LLM_BAD_RESPONSE', { status })
}

export function isRetryable(error: unknown): error is LlmError {
  return (
    error instanceof LlmError &&
    (error.code === 'LLM_RATE_LIMITED' || error.code === 'LLM_NETWORK')
  )
}

export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new LlmError('CANCELLED')
  }

  return new LlmError('INTERNAL', {
    detail: error instanceof Error ? error.message : String(error)
  })
}
