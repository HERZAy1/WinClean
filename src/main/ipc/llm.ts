import type { LlmProvider } from '../../shared/types'
import { CHANNELS } from '../../shared/channels'
import { fail } from './result'
import { handle } from './registry'
import type { SettingsService } from '../settings/service'
import { testConnection } from '../llm/test-connection'

function isProvider(value: unknown): value is LlmProvider {
  return value === 'openai' || value === 'anthropic'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function registerLlmIpc(service: SettingsService): void {
  handle(CHANNELS.llm.testConnection, async (_event, payload) => {
    if (!isRecord(payload) || !isProvider(payload['provider'])) {
      return fail('INTERNAL', '服务商参数无效')
    }

    return testConnection(service, payload['provider'])
  })
}
