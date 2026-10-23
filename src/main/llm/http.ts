import { isRetryable, LlmError, mapHttpError, type UpstreamErrorInfo } from './errors'

export interface RequestOptions {
  fetchImpl?: typeof fetch
  retryBaseMs?: number
  maxAttempts?: number
  signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return undefined
}

// 尽量把上游返回的 error 结构读出来，供 UI 原样展示
export async function readUpstreamError(response: Response): Promise<UpstreamErrorInfo | undefined> {
  let text: string
  try {
    text = (await response.text()).trim()
  } catch {
    return undefined
  }
  if (!text) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(text)
    if (isRecord(parsed)) {
      const error = isRecord(parsed['error']) ? parsed['error'] : undefined
      const code =
        pickString(error?.['code']) ?? pickString(parsed['code']) ?? pickString(parsed['type'])
      const message =
        pickString(error?.['message']) ??
        pickString(error?.['msg']) ??
        pickString(parsed['message']) ??
        pickString(parsed['msg'])
      const hint = pickString(error?.['gateway_hint']) ?? pickString(parsed['gateway_hint'])

      if (code || message || hint) {
        return { code, message, hint }
      }
    }
  } catch {
    // 非 JSON，按纯文本处理
  }

  return { message: text.slice(0, 300) }
}

export function joinUrl(baseUrl: string, suffix: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const normalizedSuffix = suffix.replace(/^\/+/, '')

  if (base.endsWith('/v1') && normalizedSuffix.startsWith('v1/')) {
    return `${base}/${normalizedSuffix.slice(3)}`
  }

  return `${base}/${normalizedSuffix}`
}

export function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (!header) {
    return undefined
  }

  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const date = Date.parse(header)
  if (Number.isNaN(date)) {
    return undefined
  }

  return Math.max(0, date - Date.now())
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort)
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      cleanup()
      reject(new LlmError('CANCELLED'))
    }

    if (signal?.aborted) {
      onAbort()
      return
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const cause = (error as { cause?: unknown }).cause
  const causeCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : undefined
  return causeCode ? `${error.message} (${causeCode})` : error.message
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RequestOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxAttempts = options.maxAttempts ?? 3
  const retryBaseMs = options.retryBaseMs ?? 500

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new LlmError('CANCELLED')
    }

    try {
      const response = await fetchImpl(url, { ...init, signal: options.signal })
      if (!response.ok) {
        const upstream = await readUpstreamError(response)
        throw mapHttpError(response.status, retryAfterMs(response), upstream)
      }
      return response
    } catch (error) {
      const normalized =
        error instanceof LlmError
          ? error
          : new LlmError(
              error instanceof DOMException && error.name === 'AbortError'
                ? 'CANCELLED'
                : 'LLM_NETWORK',
              { detail: describeNetworkError(error) }
            )

      if (!isRetryable(normalized) || attempt === maxAttempts) {
        throw normalized
      }

      const delay = normalized.retryAfterMs ?? retryBaseMs * 2 ** (attempt - 1)
      await sleep(delay, options.signal)
    }
  }

  throw new LlmError('LLM_NETWORK')
}

export async function requestJson(
  url: string,
  init: RequestInit,
  options: RequestOptions = {}
): Promise<unknown> {
  const response = await fetchWithRetry(url, init, options)
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new LlmError('LLM_BAD_RESPONSE', {
      detail: `上游返回的不是合法 JSON：${text.slice(0, 160)}`
    })
  }
}

export async function readSse(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    let lineEnd = buffer.indexOf('\n')
    while (lineEnd >= 0) {
      const line = buffer.slice(0, lineEnd).replace(/\r$/, '')
      buffer = buffer.slice(lineEnd + 1)
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          return
        }
        if (data) {
          onData(data)
        }
      }
      lineEnd = buffer.indexOf('\n')
    }
  }

  const remaining = buffer.trim()
  if (remaining.startsWith('data:')) {
    const data = remaining.slice(5).trim()
    if (data && data !== '[DONE]') {
      onData(data)
    }
  }
}
