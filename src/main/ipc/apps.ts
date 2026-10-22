import { CHANNELS } from '../../shared/channels'
import { fail, ok } from './result'
import { handle } from './registry'
import { getBreakdown, listBreakdowns } from '../breakdown/service'

function numberField(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function stringField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function registerAppsIpc(): void {
  handle(CHANNELS.apps.list, (_event, payload) => {
    const scanId = numberField(payload, 'scanId')
    if (!scanId) {
      return fail('INTERNAL', '扫描 ID 无效')
    }
    return ok(listBreakdowns(scanId))
  })

  handle(CHANNELS.apps.getBreakdown, (_event, payload) => {
    const scanId = numberField(payload, 'scanId')
    const appId = stringField(payload, 'appId')
    if (!scanId || !appId) {
      return fail('INTERNAL', '软件参数无效')
    }
    const breakdown = getBreakdown(scanId, appId)
    return breakdown ? ok(breakdown) : fail('NOT_FOUND', '软件占用数据不存在')
  })
}
