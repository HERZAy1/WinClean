import { LlmError } from './errors'
import { fetchWithRetry, joinUrl, readSse } from './http'
import type { LlmClient, LlmRequest, LlmResponse } from './types'

interface OpenAiClientOptions {
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

export class OpenAiClient implements LlmClient {
  private readonly url: string

  constructor(private readonly options: OpenAiClientOptions) {
    this.url = joinUrl(options.baseUrl, 'chat/completions')
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetchWithRetry(
      this.url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json'
        },
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
    const choices = data['choices']
    const first = Array.isArray(choices) && isRecord(choices[0]) ? choices[0] : null
    const message = first && isRecord(first['message']) ? first['message'] : null
    const text = message && typeof message['content'] === 'string' ? message['content'] : null

    if (text === null) {
      throw new LlmError('LLM_BAD_RESPONSE')
    }

    const usage = isRecord(data['usage']) ? data['usage'] : null
    return {
      text,
      tokensIn: usage && typeof usage['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : undefined,
      tokensOut:
        usage && typeof usage['completion_tokens'] === 'number'
          ? usage['completion_tokens']
          : undefined
    }
  }

  async stream(request: LlmRequest, onDelta: (delta: string) => void): Promise<LlmResponse> {
    const response = await fetchWithRetry(
      this.url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json'
        },
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
      const choices = event['choices']
      const first = Array.isArray(choices) && isRecord(choices[0]) ? choices[0] : null
      const delta = first && isRecord(first['delta']) ? first['delta'] : null
      if (delta && typeof delta['content'] === 'string') {
        text += delta['content']
        onDelta(delta['content'])
      }

      const usage = isRecord(event['usage']) ? event['usage'] : null
      if (usage) {
        if (typeof usage['prompt_tokens'] === 'number') {
          tokensIn = usage['prompt_tokens']
        }
        if (typeof usage['completion_tokens'] === 'number') {
          tokensOut = usage['completion_tokens']
        }
      }
    })

    return { text, tokensIn, tokensOut }
  }

  private body(request: LlmRequest, stream: boolean): Record<string, unknown> {
    return {
      model: this.options.modelId,
      messages: [
        ...(request.system ? [{ role: 'system', content: request.system }] : []),
        ...request.messages
      ],
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      stream
    }
  }
}
