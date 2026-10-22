import { CHANNELS } from '../../shared/channels'
import { fail } from './result'
import { handle } from './registry'
import type { CleanService } from '../clean/service'

function numberField(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function stringArrayField(payload: unknown, key: string): string[] | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as Record<string, unknown>)[key]
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

export function registerCleanIpc(service: CleanService): void {
  handle(CHANNELS.clean.preview, (_event, payload) => {
    const scanId = numberField(payload, 'scanId')
    const appIds = stringArrayField(payload, 'appIds')
    if (!scanId || !appIds) {
      return fail('INTERNAL', '清理预览参数无效')
    }
    const includeEssential =
      typeof payload === 'object' &&
      payload !== null &&
      (payload as { includeEssential?: unknown }).includeEssential === true
    return service.preview(scanId, appIds, includeEssential)
  })

  handle(CHANNELS.clean.execute, async (_event, payload) => {
    if (typeof payload !== 'object' || payload === null) {
      return fail('INTERNAL', '清理参数无效')
    }
    const planId = (payload as { planId?: unknown }).planId
    const selectedPaths = stringArrayField(payload, 'selectedPaths')
    if (typeof planId !== 'string' || !planId || !selectedPaths) {
      return fail('INTERNAL', '清理参数无效')
    }
    return service.execute(planId, selectedPaths)
  })

  handle(CHANNELS.clean.log, (_event, payload) => {
    const limit = numberField(payload, 'limit')
    if (!limit || limit > 500) {
      return fail('INTERNAL', '日志条数无效')
    }
    return service.log(limit)
  })
}
