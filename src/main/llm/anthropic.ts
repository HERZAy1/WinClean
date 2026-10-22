import { LlmError } from './errors'
import { fetchWithRetry, joinUrl, readSse } from './http'
import type { LlmClient, LlmRequest, LlmResponse } from './types'

interface AnthropicClientOptions {
  baseUrl: string
  apiKey: string
  modelId: string
  fetchImpl?: typeof fetch
  retryBaseMs?: number
  maxAttempts?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown
    if (!isRecord(value)) {
      throw new Error('not an object')
    }
    return value
  } catch {
    throw new LlmError('LLM_BAD_RESPONSE')
  }
}

export class AnthropicClient implements LlmClient {
  private readonly url: string

  constructor(private readonly options: AnthropicClientOptions) {
    this.url = joinUrl(options.baseUrl, 'v1/messages')
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetchWithRetry(
      this.url,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.body(request, false))
      },
      {
        fetchImpl: this.options.fetchImpl,
        retryBaseMs: this.options.retryBaseMs,
        maxAttempts: this.options.maxAttempts,
        signal: request.signal
      }
    )

    const data = parseJson(await response.text())
    const content = data['content']
    if (!Array.isArray(content)) {
      throw new LlmError('LLM_BAD_RESPONSE')
    }

    const text = content
      .filter((item): item is Record<string, unknown> => isRecord(item) && item['type'] === 'text')
      .map((item) => (typeof item['text'] === 'string' ? item['text'] : ''))
      .join('')

    if (!text) {
      throw new LlmError('LLM_BAD_RESPONSE')
    }

    const usage = isRecord(data['usage']) ? data['usage'] : null
    return {
      text,
      tokensIn:
        usage && typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : undefined,
      tokensOut:
        usage && typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : undefined
    }
  }

  async stream(request: LlmRequest, onDelta: (delta: string) => void): Promise<LlmResponse> {
    const response = await fetchWithRetry(
      this.url,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.body(request, true))
      },
      {
        fetchImpl: this.options.fetchImpl,
        retryBaseMs: this.options.retryBaseMs,
        maxAttempts: this.options.maxAttempts,
        signal: request.signal
      }
    )

    if (!response.body) {
      throw new LlmError('LLM_BAD_RESPONSE')
    }

    let text = ''
    let tokensIn: number | undefined
    let tokensOut: number | undefined

    await readSse(response.body, (data) => {
      const event = parseJson(data)
      const type = event['type']

      if (type === 'message_start') {
        const message = isRecord(event['message']) ? event['message'] : null
        const usage = message && isRecord(message['usage']) ? message['usage'] : null
        if (usage && typeof usage['input_tokens'] === 'number') {
          tokensIn = usage['input_tokens']
        }
        return
      }

      if (type === 'content_block_delta') {
        const delta = isRecord(event['delta']) ? event['delta'] : null
        if (delta && typeof delta['text'] === 'string') {
          text += delta['text']
          onDelta(delta['text'])
        }
        return
      }

      if (type === 'message_delta') {
        const usage = isRecord(event['usage']) ? event['usage'] : null
        if (usage && typeof usage['output_tokens'] === 'number') {
          tokensOut = usage['output_tokens']
        }
        return
      }

      if (type === 'error') {
        throw new LlmError('LLM_BAD_RESPONSE')
      }
    })

    return { text, tokensIn, tokensOut }
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.options.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    }
  }

  private body(request: LlmRequest, stream: boolean): Record<string, unknown> {
    return {
      model: this.options.modelId,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      ...(request.system ? { system: request.system } : {}),
      messages: request.messages,
      stream
    }
  }
}
