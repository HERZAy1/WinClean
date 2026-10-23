import { isLlmProvider } from '../../shared/llm'
import type { LlmProvider } from '../../shared/types'
import { CHANNELS } from '../../shared/channels'
import { fail } from './result'
import { handle } from './registry'
import type { SettingsService } from '../settings/service'
import { listModels } from '../llm/models'
import { testConnection } from '../llm/test-connection'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readProvider(value: unknown): LlmProvider | null {
  return isLlmProvider(value) ? value : null
}

export function registerLlmIpc(service: SettingsService): void {
  handle(CHANNELS.llm.testConnection, async (_event, payload) => {
    const provider = isRecord(payload) ? readProvider(payload['provider']) : null
    if (!provider) {
      return fail('INTERNAL', '服务商参数无效')
    }

    return testConnection(service, provider)
  })

  handle(CHANNELS.llm.listModels, async (_event, payload) => {
    const provider = isRecord(payload) ? readProvider(payload['provider']) : null
    if (!provider) {
      return fail('INTERNAL', '服务商参数无效')
    }

    const baseUrl = isRecord(payload) && typeof payload['baseUrl'] === 'string' ? payload['baseUrl'] : undefined
    return listModels(service, provider, { baseUrl })
  })
}
