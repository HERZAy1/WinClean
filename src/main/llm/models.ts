import type { LlmProvider, Result } from '../../shared/types'
import { fail, ok } from '../ipc/result'
import type { SettingsService } from '../settings/service'
import { AnthropicClient } from './anthropic'
import { LlmError, toLlmError } from './errors'
import { OpenAiClient } from './openai'

interface ListModelsOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  retryBaseMs?: number
}

export { parseModelIds } from './model-ids'

export async function listModels(
  service: SettingsService,
  provider: LlmProvider,
  options: ListModelsOptions = {}
): Promise<Result<string[]>> {
  try {
    const apiKey = service.getApiKey(provider)
    if (!apiKey) {
      throw new LlmError('LLM_NOT_CONFIGURED')
    }

    const config = service.getSettings().providers[provider]
    const baseUrl = options.baseUrl?.trim() || config.baseUrl
    const common = {
      baseUrl,
      apiKey,
      modelId: config.modelId,
      fetchImpl: options.fetchImpl,
      retryBaseMs: options.retryBaseMs
    }

    const client =
      provider === 'anthropic' ? new AnthropicClient(common) : new OpenAiClient(common)

    return ok(await client.listModels())
  } catch (error) {
    const llmError = toLlmError(error)
    return fail(llmError.code, llmError.message, llmError.detail)
  }
}
