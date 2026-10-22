import { isRetryable, LlmError, mapHttpError } from './errors'

export interface RequestOptions {
  fetchImpl?: typeof fetch
  retryBaseMs?: number
  maxAttempts?: number
  signal?: AbortSignal
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
        throw mapHttpError(response.status, retryAfterMs(response))
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
              { detail: error instanceof Error ? error.message : String(error) }
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
