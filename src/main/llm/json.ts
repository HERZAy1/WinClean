import { LlmError } from './errors'
import type { LlmClient, LlmRequest } from './types'

export function extractJson(text: string): unknown {
  let candidate = text.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(candidate)
  if (fenced?.[1]) {
    candidate = fenced[1].trim()
  }

  const start = candidate.search(/[[{]/)
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
  if (start >= 0 && end > start) {
    candidate = candidate.slice(start, end + 1)
  }

  try {
    return JSON.parse(candidate) as unknown
  } catch {
    throw new LlmError('LLM_BAD_RESPONSE')
  }
}

export async function completeJson<T>(
  client: LlmClient,
  request: LlmRequest,
  validate: (value: unknown) => T
): Promise<T> {
  const jsonRequest: LlmRequest = {
    ...request,
    system: [request.system, '只输出符合要求的 JSON，不要输出解释或 Markdown 围栏。']
      .filter(Boolean)
      .join('\n')
  }

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client.complete(jsonRequest)
      return validate(extractJson(response.text))
    } catch (error) {
      if (error instanceof LlmError && error.code !== 'LLM_BAD_RESPONSE') {
        throw error
      }
      lastError = error
    }
  }

  throw new LlmError('LLM_BAD_RESPONSE', {
    detail: lastError instanceof Error ? lastError.message : String(lastError)
  })
}
