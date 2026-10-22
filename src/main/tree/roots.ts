import type { AppTreeRoot, Owner } from '../../shared/types'
import { getDatabase } from '../db'

const ROOT_META: Record<Owner, Omit<AppTreeRoot, 'totalBytes' | 'childCount'>> = {
  system: {
    nodeId: 'virtual:system',
    label: 'Windows 系统',
    kind: 'system'
  },
  user: {
    nodeId: 'virtual:user',
    label: '用户文件',
    kind: 'user'
  },
  unknown: {
    nodeId: 'virtual:unowned',
    label: '未归属',
    kind: 'unowned'
  }
}

export function getTreeRoots(scanId: number, db = getDatabase()): AppTreeRoot[] {
  const rows = db
    .prepare(
      `SELECT owner,
              COUNT(*) AS childCount,
              COALESCE(SUM(CASE WHEN isDir = 0 THEN sizeBytes ELSE 0 END), 0) AS totalBytes
       FROM files
       WHERE scanId = ?
       GROUP BY owner`
    )
    .all(scanId) as { owner: Owner; childCount: number; totalBytes: number }[]

  const byOwner = new Map(rows.map((row) => [row.owner, row]))

  return (['system', 'user', 'unknown'] as const).map((owner) => ({
    ...ROOT_META[owner],
    totalBytes: byOwner.get(owner)?.totalBytes ?? 0,
    childCount: byOwner.get(owner)?.childCount ?? 0
  }))
}
