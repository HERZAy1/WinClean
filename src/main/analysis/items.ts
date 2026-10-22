import os from 'node:os'
import path from 'node:path'
import { getDatabase } from '../db'
import { loadOwnershipApps } from '../ownership/apply'
import { matchPath } from '../ownership/engine'
import type { AnalysisItem } from './types'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function sanitizePath(value: string): string {
  const usernames = [process.env['USERNAME'], os.userInfo().username].filter(
    (name): name is string => typeof name === 'string' && name.length >= 2
  )
  let result = value
  for (const username of new Set(usernames)) {
    result = result.replace(new RegExp(escapeRegExp(username), 'gi'), '%USERNAME%')
  }
  return result
}

function isUnderPath(candidate: string, parent: string): boolean {
  const child = candidate.toLowerCase()
  const root = parent.replace(/[\\/]+$/, '').toLowerCase()
  return child === root || child.startsWith(`${root}\\`)
}

function extensionDistribution(scanId: number, directory: string, db = getDatabase()): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT name FROM files
       WHERE scanId = ? AND isDir = 0
         AND (
           path = ? COLLATE NOCASE
           OR (
             length(path) > ?
             AND substr(path, 1, ?) = ? COLLATE NOCASE
             AND substr(path, ? + 1, 1) = ?
           )
         )
       LIMIT 1000`
    )
    .all(
      scanId,
      directory,
      directory.length,
      directory.length,
      directory,
      directory.length,
      '\\'
    ) as { name: string }[]

  const distribution: Record<string, number> = {}
  for (const row of rows) {
    const extension = path.win32.extname(row.name).toLowerCase() || '<none>'
    distribution[extension] = (distribution[extension] ?? 0) + 1
  }
  return distribution
}

function buildItem(
  scanId: number,
  sourcePath: string,
  kind: AnalysisItem['kind'],
  apps: ReturnType<typeof loadOwnershipApps>,
  db = getDatabase()
): AnalysisItem | null {
  const row = db
    .prepare('SELECT path, name, sizeBytes FROM files WHERE scanId = ? AND path = ?')
    .get(scanId, sourcePath) as { path: string; name: string; sizeBytes: number } | undefined
  if (!row) {
    return null
  }

  const children = db
    .prepare(
      'SELECT name FROM files WHERE scanId = ? AND parentPath = ? ORDER BY sizeBytes DESC LIMIT 10'
    )
    .all(scanId, sourcePath) as { name: string }[]
  const childCount = db
    .prepare('SELECT COUNT(*) AS n FROM files WHERE scanId = ? AND parentPath = ?')
    .get(scanId, sourcePath) as { n: number }
  const matched = matchPath(sourcePath, apps)
  const candidates = (matched?.candidates ?? []).map((candidate) => candidate.appName)

  return {
    kind,
    sourcePath,
    path: sanitizePath(sourcePath),
    name: sanitizePath(row.name),
    sizeBytes: row.sizeBytes,
    childCount: childCount.n,
    childNames: children.map((child) => sanitizePath(child.name)),
    extensions: extensionDistribution(scanId, sourcePath, db),
    candidateApps: [...new Set(candidates)].slice(0, 5)
  }
}

export function buildAnalysisItem(
  scanId: number,
  sourcePath: string,
  kind: AnalysisItem['kind'],
  db = getDatabase()
): AnalysisItem | null {
  return buildItem(scanId, sourcePath, kind, loadOwnershipApps(db), db)
}

export function buildAnalysisItems(
  scanId: number,
  db = getDatabase(),
  maxUnowned = 300
): AnalysisItem[] {
  const apps = loadOwnershipApps(db)
  const items: AnalysisItem[] = []
  const seen = new Set<string>()

  const ambiguous = db
    .prepare(
      `SELECT targetId FROM ownerships
       WHERE scanId = ? AND targetType = 'path' AND appId IS NULL
       ORDER BY confidence DESC
       LIMIT 300`
    )
    .all(scanId) as { targetId: string }[]

  for (const row of ambiguous) {
    if (seen.has(row.targetId)) {
      continue
    }
    const item = buildItem(scanId, row.targetId, 'ownership', apps, db)
    if (item) {
      seen.add(row.targetId)
      items.push(item)
    }
  }

  const unownedTotal = db
    .prepare(
      `SELECT COALESCE(SUM(sizeBytes), 0) AS total FROM files
       WHERE scanId = ? AND isDir = 0 AND owner != 'system' AND appId IS NULL`
    )
    .get(scanId) as { total: number }
  const targetBytes = unownedTotal.total * 0.9

  const directories = db
    .prepare(
      `SELECT path, sizeBytes FROM files
       WHERE scanId = ? AND isDir = 1 AND owner != 'system' AND appId IS NULL
       ORDER BY sizeBytes DESC
       LIMIT 2000`
    )
    .all(scanId) as { path: string; sizeBytes: number }[]

  const selected: { path: string; sizeBytes: number }[] = []
  let accumulated = 0
  for (const directory of directories) {
    if (selected.some((parent) => isUnderPath(directory.path, parent.path))) {
      continue
    }
    selected.push(directory)
    accumulated += directory.sizeBytes
    if (selected.length >= maxUnowned || accumulated >= targetBytes) {
      break
    }
  }

  for (const directory of selected) {
    if (seen.has(directory.path)) {
      continue
    }
    const item = buildItem(scanId, directory.path, 'unowned', apps, db)
    if (item) {
      seen.add(directory.path)
      items.push(item)
    }
  }

  return items
}
