import type { AppError } from '../../shared/types'

const USER_MESSAGES: Record<AppError['code'], string> = {
  NOT_ELEVATED: '需要管理员权限',
  PERMISSION_DENIED: '没有权限访问该路径',
  PATH_BLOCKED: '该路径已被安全策略拦截',
  NOT_FOUND: '请求的内容不存在',
  LLM_NOT_CONFIGURED: 'LLM 尚未配置，请先在设置中填写模型 ID 和 API Key',
  LLM_AUTH_FAILED: 'API Key 无效或没有访问权限',
  LLM_RATE_LIMITED: '模型请求过于频繁，请稍后再试',
  LLM_UNAVAILABLE: '模型服务暂时不可用，请稍后重试或更换模型',
  LLM_REQUEST_REJECTED: '模型服务拒绝了请求，请检查模型 ID 与请求参数',
  LLM_BAD_RESPONSE: '模型返回格式无法解析',
  LLM_NETWORK: '无法连接模型服务，请检查网络或 Base URL',
  CANCELLED: '操作已取消',
  INTERNAL: '操作失败'
}

// 上游返回的错误信息，原样透传给用户，便于自助判断
export interface UpstreamErrorInfo {
  status?: number
  code?: string
  message?: string
  hint?: string
}

export class LlmError extends Error {
  readonly code: AppError['code']
  readonly detail?: string
  readonly retryAfterMs?: number
  readonly status?: number
  readonly upstream?: UpstreamErrorInfo

  constructor(
    code: AppError['code'],
    options: {
      detail?: string
      retryAfterMs?: number
      status?: number
      upstream?: UpstreamErrorInfo
    } = {}
  ) {
    super(USER_MESSAGES[code])
    this.name = 'LlmError'
    this.code = code
    this.detail = options.detail
    this.retryAfterMs = options.retryAfterMs
    this.status = options.status
    this.upstream = options.upstream
  }
}

function describeUpstream(status: number, upstream?: UpstreamErrorInfo): string {
  const parts = [`HTTP ${status}`]
  if (upstream?.code) {
    parts.push(upstream.code)
  }
  if (upstream?.message) {
    parts.push(upstream.message)
  }
  if (upstream?.hint) {
    parts.push(upstream.hint)
  }
  return parts.join(' · ')
}

export function mapHttpError(
  status: number,
  retryAfterMs?: number,
  upstream?: UpstreamErrorInfo
): LlmError {
  const info = { ...upstream, status }
  const detail = describeUpstream(status, upstream)

  if (status === 401 || status === 403) {
    return new LlmError('LLM_AUTH_FAILED', { status, detail, upstream: info })
  }
  if (status === 429) {
    return new LlmError('LLM_RATE_LIMITED', { status, retryAfterMs, detail, upstream: info })
  }
  if (status === 503 || status >= 500) {
    return new LlmError('LLM_UNAVAILABLE', { status, detail, upstream: info })
  }
  if (status === 400 || status === 404 || status === 422) {
    return new LlmError('LLM_REQUEST_REJECTED', { status, detail, upstream: info })
  }
  return new LlmError('LLM_BAD_RESPONSE', { status, detail, upstream: info })
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

  const detail = error instanceof Error ? error.message : String(error)
  return new LlmError('INTERNAL', { detail })
}
