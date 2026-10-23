import { LLM_PRESETS } from '../../shared/llm'
import type { LlmProvider } from '../../shared/types'
import type { SettingsService } from '../settings/service'
import { AnthropicClient } from './anthropic'
import { LlmError } from './errors'
import { OpenAiClient } from './openai'
import type { LlmClient } from './types'

interface ClientOptions {
  fetchImpl?: typeof fetch
  retryBaseMs?: number
  maxAttempts?: number
}

export function createLlmClient(
  service: SettingsService,
  provider: LlmProvider,
  options: ClientOptions = {}
): LlmClient {
  const settings = service.getSettings()
  const config = settings.providers[provider]
  const preset = LLM_PRESETS[provider]
  const apiKey = service.getApiKey(provider)

  if (!apiKey || !config.modelId.trim()) {
    throw new LlmError('LLM_NOT_CONFIGURED')
  }

  const common = {
    baseUrl: preset.baseUrlLocked ? preset.baseUrl : config.baseUrl,
    apiKey,
    modelId: config.modelId.trim(),
    fetchImpl: options.fetchImpl,
    retryBaseMs: options.retryBaseMs,
    maxAttempts: options.maxAttempts
  }

  // DeepSeek 走 OpenAI 兼容协议，复用同一个客户端
  return preset.protocol === 'openai' ? new OpenAiClient(common) : new AnthropicClient(common)
}
