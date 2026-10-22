import { CHANNELS } from '../../shared/channels'
import { fail, ok } from './result'
import { handle } from './registry'
import { getAllTreeRoots, getTreeNodeChildren, getUnownedList } from '../tree/service'

function numberField(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function stringField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

export function registerTreeIpc(): void {
  handle(CHANNELS.tree.getRoots, (_event, payload) => {
    const scanId = numberField(payload, 'scanId')
    if (!scanId) {
      return fail('INTERNAL', '扫描 ID 无效')
    }
    return ok(getAllTreeRoots(scanId))
  })

  handle(CHANNELS.tree.getChildren, (_event, payload) => {
    const scanId = numberField(payload, 'scanId')
    const nodeId = stringField(payload, 'nodeId')
    if (!scanId || !nodeId) {
      return fail('INTERNAL', '树节点参数无效')
    }
    return ok(getTreeNodeChildren(scanId, nodeId))
  })

  handle(CHANNELS.unowned.list, (_event, payload) => {
    const scanId = numberField(payload, 'scanId')
    const offset = numberField(payload, 'offset')
    const limit = numberField(payload, 'limit')
    if (!scanId || offset === null || !limit || limit > 500) {
      return fail('INTERNAL', '未归属列表参数无效')
    }
    return ok(getUnownedList(scanId, offset, limit))
  })
}
