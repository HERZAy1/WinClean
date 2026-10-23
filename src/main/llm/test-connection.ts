import type { LlmProvider, Result, TestConnectionResult } from '../../shared/types'
import { fail, ok } from '../ipc/result'
import type { SettingsService } from '../settings/service'
import { toLlmError } from './errors'
import { createLlmClient } from './factory'

interface TestConnectionOptions {
  fetchImpl?: typeof fetch
  retryBaseMs?: number
}

export async function testConnection(
  service: SettingsService,
  provider: LlmProvider,
  options: TestConnectionOptions = {}
): Promise<Result<TestConnectionResult>> {
  try {
    const client = createLlmClient(service, provider, options)
    const config = service.getSettings().providers[provider]
    const startedAt = Date.now()
    const response = await client.complete({
      messages: [{ role: 'user', content: '请只回复：连接成功' }],
      maxTokens: 32,
      temperature: 0
    })
    const latencyMs = Date.now() - startedAt

    service.recordUsage(provider, {
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut
    })
    service.markConnectionTestSuccess(provider)

    return ok({
      provider,
      modelId: config.modelId,
      latencyMs,
      replyPreview: response.text.slice(0, 80),
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut
    })
  } catch (error) {
    // detail 中携带上游原始错误码与信息，渲染层直接展示
    const llmError = toLlmError(error)
    return fail(llmError.code, llmError.message, llmError.detail)
  }
}
