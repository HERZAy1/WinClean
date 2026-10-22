import { CHANNELS } from '../../shared/channels'
import { fail, ok } from './result'
import { handle } from './registry'
import type { AnalysisService } from '../analysis/service'

function scanIdFrom(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as { scanId?: unknown }).scanId
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function registerAnalysisIpc(service: AnalysisService): void {
  handle(CHANNELS.analysis.start, async (_event, payload) => {
    const scanId = scanIdFrom(payload)
    if (!scanId) {
      return fail('INTERNAL', '扫描 ID 无效')
    }
    return service.start(scanId)
  })

  handle(CHANNELS.analysis.cancel, () => {
    service.cancel()
    return ok(undefined)
  })

  handle(CHANNELS.unowned.explain, async (_event, payload) => {
    if (typeof payload !== 'object' || payload === null) {
      return fail('INTERNAL', '路径参数无效')
    }
    const paths = (payload as { paths?: unknown }).paths
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
      return fail('INTERNAL', '路径参数无效')
    }
    return service.explain(paths as string[])
  })
}
