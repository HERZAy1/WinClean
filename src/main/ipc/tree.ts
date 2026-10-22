import { CHANNELS } from '../../shared/channels'
import { fail, ok } from './result'
import { handle } from './registry'
import { getTreeRoots } from '../tree/roots'

function scanIdFrom(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as { scanId?: unknown }).scanId
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function registerTreeIpc(): void {
  handle(CHANNELS.tree.getRoots, (_event, payload) => {
    const scanId = scanIdFrom(payload)
    if (!scanId) {
      return fail('INTERNAL', '扫描 ID 无效')
    }
    return ok(getTreeRoots(scanId))
  })
}
