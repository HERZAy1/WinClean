import type {
  AppTreeRoot,
  FileNode,
  Owner,
  TreeNode,
  UnownedExplain
} from '../../shared/types'
import { getDatabase } from '../db'
import { getTreeRoots as getVirtualRoots } from './roots'

interface AppRow {
  id: string
  name: string
  installLocation: string | null
}

interface FileRow {
  id: number
  scanId: number
  path: string
  parentPath: string | null
  name: string
  isDir: number
  sizeBytes: number
  mtimeMs: number
  owner: Owner
  ownerReason: string | null
  appId: string | null
}

const GROUP_LABELS: Record<string, string> = {
  install: '安装目录',
  appdata: '用户数据(AppData)',
  cache: '缓存/临时',
  registry: '注册表',
  other: '其他'
}

function isUnderPath(candidate: string, parent: string): boolean {
  const child = candidate.toLowerCase()
  const root = parent.replace(/[\\/]+$/, '').toLowerCase()
  return child === root || child.startsWith(`${root}\\`)
}

function isCachePath(value: string): boolean {
  const lower = value.toLowerCase()
  return [
    '\\temp\\',
    '\\cache\\',
    '\\code cache\\',
    '\\gpucache\\',
    '\\shadercache\\',
    '\\dawncache\\',
    '\\crashpad\\',
    '\\logs\\'
  ].some((marker) => lower.includes(marker))
}

function isAppDataPath(value: string): boolean {
  return value.toLowerCase().includes('\\appdata\\')
}

function appRow(appId: string, db = getDatabase()): AppRow | null {
  return (
    (db.prepare('SELECT id, name, installLocation FROM apps WHERE id = ?').get(appId) as
      | AppRow
      | undefined) ?? null
  )
}

function fileNode(row: FileRow): TreeNode {
  return {
    nodeId: row.isDir ? `dir:${row.path}` : `file:${row.path}`,
    label: row.name,
    kind: row.isDir ? 'dir' : 'file',
    sizeBytes: row.sizeBytes,
    path: row.path,
    childCount: 0
  }
}

function countChildren(scanId: number, pathValue: string, db = getDatabase()): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM files WHERE scanId = ? AND parentPath = ?')
      .get(scanId, pathValue) as { n: number }
  ).n
}

function appCategory(pathValue: string, app: AppRow): 'install' | 'appdata' | 'cache' | 'other' {
  if (app.installLocation && isUnderPath(pathValue, app.installLocation)) {
    return 'install'
  }
  if (isCachePath(pathValue)) {
    return 'cache'
  }
  if (isAppDataPath(pathValue)) {
    return 'appdata'
  }
  return 'other'
}

export function getAllTreeRoots(scanId: number, db = getDatabase()): AppTreeRoot[] {
  const appRows = db
    .prepare(
      `SELECT a.id, a.name,
              COUNT(f.id) AS childCount,
              COALESCE(SUM(CASE WHEN f.isDir = 0 THEN f.sizeBytes ELSE 0 END), 0) AS totalBytes
       FROM apps a
       LEFT JOIN files f ON f.scanId = ? AND f.appId = a.id
       WHERE a.hidden = 0
       GROUP BY a.id, a.name`
    )
    .all(scanId) as { id: string; name: string; childCount: number; totalBytes: number }[]

  const roots: AppTreeRoot[] = [
    ...appRows.map((row) => ({
      nodeId: `app:${row.id}`,
      label: row.name,
      kind: 'app' as const,
      totalBytes: row.totalBytes,
      childCount: row.childCount
    })),
    ...getVirtualRoots(scanId, db)
  ]

  return roots.sort((a, b) => b.totalBytes - a.totalBytes)
}

function groupNode(
  appId: string,
  group: string,
  sizeBytes: number,
  childCount: number
): TreeNode {
  return {
    nodeId: `group:${appId}:${group}`,
    label: GROUP_LABELS[group] ?? group,
    kind: 'group',
    sizeBytes,
    childCount
  }
}

function appGroups(appId: string, scanId: number, db = getDatabase()): TreeNode[] {
  const app = appRow(appId, db)
  if (!app) {
    return []
  }

  const files = db
    .prepare('SELECT path, sizeBytes FROM files WHERE scanId = ? AND appId = ? AND isDir = 0')
    .all(scanId, appId) as { path: string; sizeBytes: number }[]
  const sizes: Record<string, { size: number; count: number }> = {
    install: { size: 0, count: 0 },
    appdata: { size: 0, count: 0 },
    cache: { size: 0, count: 0 },
    other: { size: 0, count: 0 }
  }
  for (const file of files) {
    const category = appCategory(file.path, app)
    sizes[category].size += file.sizeBytes
    sizes[category].count += 1
  }

  const groups = (['install', 'appdata', 'cache', 'other'] as const)
    .filter((group) => sizes[group].count > 0)
    .map((group) => groupNode(appId, group, sizes[group].size, sizes[group].count))

  const registryCount = (
    db
      .prepare('SELECT COUNT(*) AS n FROM registry_entries WHERE scanId = ? AND appId = ?')
      .get(scanId, appId) as { n: number }
  ).n
  if (registryCount > 0) {
    groups.push(groupNode(appId, 'registry', 0, registryCount))
  }
  return groups
}

function groupChildren(
  appId: string,
  group: string,
  scanId: number,
  offset = 0,
  db = getDatabase()
): TreeNode[] {
  if (group === 'registry') {
    const total = (
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM registry_entries WHERE scanId = ? AND appId = ?'
        )
        .get(scanId, appId) as { n: number }
    ).n
    const rows = db
      .prepare(
        'SELECT id, keyPath, valueName FROM registry_entries WHERE scanId = ? AND appId = ? LIMIT 100 OFFSET ?'
      )
      .all(scanId, appId, offset) as {
      id: number
      keyPath: string
      valueName: string | null
    }[]
    const nodes: TreeNode[] = rows.map((row) => ({
      nodeId: `registry:${row.id}`,
      label: row.valueName ? `${row.keyPath} (${row.valueName})` : row.keyPath,
      kind: 'registry',
      sizeBytes: 0,
      childCount: 0
    }))
    const remaining = total - offset - rows.length
    if (remaining > 0) {
      nodes.push({
        nodeId: `more:${offset + rows.length}:group:${appId}:${group}`,
        label: `+${remaining} 项`,
        kind: 'group',
        sizeBytes: 0,
        childCount: remaining
      })
    }
    return nodes
  }

  const app = appRow(appId, db)
  if (!app) {
    return []
  }
  const rows = db
    .prepare(
      `SELECT * FROM files
       WHERE scanId = ? AND appId = ? AND isDir = 1
       ORDER BY sizeBytes DESC`
    )
    .all(scanId, appId) as FileRow[]
  const filtered = rows.filter((row) => appCategory(row.path, app) === group)
  const page = filtered.slice(offset, offset + 100)
  const nodes = page.map((row) => {
    const node = fileNode(row)
    return { ...node, childCount: countChildren(scanId, row.path, db) }
  })
  const remaining = filtered.length - offset - page.length
  if (remaining > 0) {
    nodes.push({
      nodeId: `more:${offset + page.length}:group:${appId}:${group}`,
      label: `+${remaining} 项`,
      kind: 'group',
      sizeBytes: 0,
      childCount: remaining
    })
  }
  return nodes
}

function directoryChildren(
  directory: string,
  scanId: number,
  offset: number,
  db = getDatabase()
): TreeNode[] {
  const total = countChildren(scanId, directory, db)
  const rows = db
    .prepare(
      `SELECT * FROM files WHERE scanId = ? AND parentPath = ?
       ORDER BY sizeBytes DESC LIMIT ? OFFSET ?`
    )
    .all(scanId, directory, 100, offset) as FileRow[]
  const nodes = rows.map((row) => {
    const node = fileNode(row)
    return { ...node, childCount: row.isDir ? countChildren(scanId, row.path, db) : 0 }
  })
  const remaining = total - offset - rows.length
  if (remaining > 0) {
    nodes.push({
      nodeId: `more:${offset + rows.length}:dir:${directory}`,
      label: `+${remaining} 项`,
      kind: 'group',
      sizeBytes: 0,
      childCount: remaining
    })
  }
  return nodes
}

function virtualChildren(nodeId: string, scanId: number, db = getDatabase()): TreeNode[] {
  const owner: Owner = nodeId === 'virtual:system' ? 'system' : nodeId === 'virtual:user' ? 'user' : 'unknown'
  const extra = owner === 'unknown' ? 'AND appId IS NULL' : ''
  const rows = db
    .prepare(
      `SELECT * FROM files
       WHERE scanId = ? AND owner = ? AND isDir = 1 ${extra}
       ORDER BY sizeBytes DESC LIMIT 100`
    )
    .all(scanId, owner) as FileRow[]
  return rows.map((row) => ({
    ...fileNode(row),
    childCount: countChildren(scanId, row.path, db)
  }))
}

export function getTreeNodeChildren(
  scanId: number,
  nodeId: string,
  db = getDatabase()
): TreeNode[] {
  if (nodeId.startsWith('more:')) {
    const second = nodeId.indexOf(':', 5)
    const offset = Number(nodeId.slice(5, second))
    const parent = nodeId.slice(second + 1)
    if (!Number.isFinite(offset) || offset < 0) {
      return []
    }
    if (parent.startsWith('dir:')) {
      return directoryChildren(parent.slice(4), scanId, offset, db)
    }
    if (parent.startsWith('group:')) {
      const [, appId, group] = parent.split(':')
      return groupChildren(appId, group, scanId, offset, db)
    }
    return []
  }

  if (nodeId.startsWith('app:')) {
    return appGroups(nodeId.slice(4), scanId, db)
  }
  if (nodeId.startsWith('group:')) {
    const [, appId, group] = nodeId.split(':')
    return groupChildren(appId, group, scanId, 0, db)
  }
  if (nodeId.startsWith('dir:')) {
    return directoryChildren(nodeId.slice(4), scanId, 0, db)
  }
  if (nodeId.startsWith('virtual:')) {
    return virtualChildren(nodeId, scanId, db)
  }
  return []
}

export function getUnownedList(
  scanId: number,
  offset: number,
  limit: number,
  db = getDatabase()
): { items: (FileNode & { explain?: UnownedExplain })[]; total: number } {
  const total = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM files WHERE scanId = ? AND owner = 'unknown' AND appId IS NULL"
      )
      .get(scanId) as { n: number }
  ).n
  const rows = db
    .prepare(
      `SELECT * FROM files
       WHERE scanId = ? AND owner = 'unknown' AND appId IS NULL
       ORDER BY sizeBytes DESC LIMIT ? OFFSET ?`
    )
    .all(scanId, limit, offset) as FileRow[]
  if (rows.length === 0) {
    return { items: [], total }
  }
  const explainRows = db
    .prepare(
      `SELECT path, json FROM unowned_explain
       WHERE scanId = ? AND path IN (${rows.map(() => '?').join(',')})`
    )
    .all(scanId, ...rows.map((row) => row.path)) as { path: string; json: string }[]
  const explains = new Map(
    explainRows.map((row) => [row.path, JSON.parse(row.json) as UnownedExplain])
  )

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      scanId: row.scanId,
      path: row.path,
      parentPath: row.parentPath,
      name: row.name,
      isDir: Boolean(row.isDir),
      sizeBytes: row.sizeBytes,
      mtimeMs: row.mtimeMs,
      owner: row.owner,
      ownerReason: row.ownerReason ?? undefined,
      appId: row.appId,
      ...(explains.has(row.path) ? { explain: explains.get(row.path) } : {})
    }))
  }
}
