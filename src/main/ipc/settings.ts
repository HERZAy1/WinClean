import type { AppSettings, LlmProvider } from '../../shared/types'
import { CHANNELS } from '../../shared/channels'
import { fail, ok } from './result'
import { handle } from './registry'
import type { SettingsService } from '../settings/service'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProvider(value: unknown): value is LlmProvider {
  return value === 'openai' || value === 'anthropic'
}

export function registerSettingsIpc(service: SettingsService): void {
  handle(CHANNELS.settings.get, () => ok(service.getSettings()))

  handle(CHANNELS.settings.save, (_event, payload) => {
    if (!isRecord(payload)) {
      return fail('INTERNAL', '设置参数无效')
    }
    return service.save(payload as Partial<AppSettings>)
  })

  handle(CHANNELS.settings.setApiKey, (_event, payload) => {
    if (!isRecord(payload) || !isProvider(payload['provider'])) {
      return fail('INTERNAL', '服务商参数无效')
    }
    const apiKey = payload['apiKey']
    if (typeof apiKey !== 'string') {
      return fail('INTERNAL', 'API Key 参数无效')
    }
    return service.setApiKey(payload['provider'], apiKey)
  })

  handle(CHANNELS.settings.clearApiKey, (_event, payload) => {
    if (!isRecord(payload) || !isProvider(payload['provider'])) {
      return fail('INTERNAL', '服务商参数无效')
    }
    return service.clearApiKey(payload['provider'])
  })
}
