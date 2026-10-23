import { LlmError } from './errors'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 兼容 OpenAI / Anthropic / DeepSeek 的模型列表结构：{ data: [{ id }] } 或 { models: [...] }
export function parseModelIds(payload: unknown): string[] {
  const list = isRecord(payload) ? (payload['data'] ?? payload['models']) : undefined
  if (!Array.isArray(list)) {
    throw new LlmError('LLM_BAD_RESPONSE', { detail: '模型列表格式无法解析' })
  }

  const ids = new Set<string>()
  for (const item of list) {
    const id = isRecord(item)
      ? typeof item['id'] === 'string'
        ? item['id']
        : undefined
      : typeof item === 'string'
        ? item
        : undefined
    if (id && id.trim()) {
      ids.add(id.trim())
    }
  }

  return [...ids].sort((a, b) => a.localeCompare(b))
}
