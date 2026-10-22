import path from 'node:path'
import type { OwnershipApp } from './engine'
import { matchPath, matchRegistryEntry } from './engine'
import { getDatabase } from '../db'

export interface OwnershipStats {
  totalBytes: number
  assignedBytes: number
  unownedBytes: number
  assignedRatio: number
  unownedTop: { path: string; sizeBytes: number }[]
}

interface AppRow {
  id: string
  name: string
  publisher: string | null
  installLocation: string | null
  source: string
  hidden: number
  exePaths: string
  registryKeys: string
  publisherKeys: string
  uwpPackage: string | null
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string') {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function loadOwnershipApps(db = getDatabase()): OwnershipApp[] {
  const rows = db
    .prepare(
      'SELECT id, name, publisher, installLocation, source, hidden, exePaths, registryKeys, publisherKeys, uwpPackage FROM apps'
    )
    .all() as AppRow[]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    publisher: row.publisher ?? undefined,
    installLocation: row.installLocation ?? undefined,
    source: row.source,
    hidden: Boolean(row.hidden),
    exePaths: parseStringArray(row.exePaths),
    registryKeys: parseStringArray(row.registryKeys),
    publisherKeys: parseStringArray(row.publisherKeys),
    uwpPackage: row.uwpPackage ?? undefined
  }))
}

function prefixPredicate(): string {
  return `(
    path = ? COLLATE NOCASE
    OR (
      length(path) > ?
      AND substr(path, 1, ?) = ? COLLATE NOCASE
      AND substr(path, ? + 1, 1) = ?
    )
  )`
}

function prefixParams(prefix: string): [string, number, number, string, number, string] {
  return [prefix, prefix.length, prefix.length, prefix, prefix.length, '\\']
}

export function applyRuleOwnership(
  scanId: number,
  apps = loadOwnershipApps(),
  db = getDatabase()
): OwnershipStats {
  const updateFiles = db.prepare(
    `UPDATE files SET appId = ?
     WHERE scanId = ? AND owner != 'system' AND appId IS NULL
       AND ${prefixPredicate()}`
  )
  const insertOwnership = db.prepare(`
    INSERT OR REPLACE INTO ownerships
      (scanId, targetType, targetId, appId, confidence, source, reason)
    VALUES (?, ?, ?, ?, ?, 'rule', ?)
  `)
  const selectRegistry = db.prepare(
    'SELECT id, hive, keyPath FROM registry_entries WHERE scanId = ?'
  )
  const updateRegistry = db.prepare('UPDATE registry_entries SET appId = ? WHERE id = ?')

  db.transaction(() => {
    db.prepare("UPDATE files SET appId = NULL WHERE scanId = ? AND owner != 'system'").run(scanId)
    db.prepare('DELETE FROM ownerships WHERE scanId = ?').run(scanId)
    db.prepare('UPDATE registry_entries SET appId = NULL WHERE scanId = ?').run(scanId)

    const visibleApps = apps.filter((app) => !app.hidden)
    const installApps = visibleApps
      .filter((app) => app.installLocation)
      .sort((a, b) => (b.installLocation?.length ?? 0) - (a.installLocation?.length ?? 0))
    for (const app of installApps) {
      if (!app.installLocation) {
        continue
      }
      const changes = updateFiles.run(app.id, scanId, ...prefixParams(app.installLocation)).changes
      if (changes > 0) {
        insertOwnership.run(scanId, 'path', app.installLocation, app.id, 0.98, `位于 ${app.name} 安装目录内`)
      }
    }

    const exeDirectories = new Map<string, OwnershipApp>()
    for (const app of visibleApps) {
      for (const exePath of app.exePaths) {
        const directory = path.win32.dirname(exePath)
        if (directory && !exeDirectories.has(directory.toLowerCase())) {
          exeDirectories.set(directory.toLowerCase(), app)
        }
      }
    }
    const sortedExeDirs = [...exeDirectories.entries()].sort((a, b) => b[0].length - a[0].length)
    for (const [directory, app] of sortedExeDirs) {
      const changes = updateFiles.run(app.id, scanId, ...prefixParams(directory)).changes
      if (changes > 0) {
        insertOwnership.run(
          scanId,
          'path',
          directory,
          app.id,
          0.95,
          `位于 ${app.name} 可执行文件目录内`
        )
      }
    }

    const unassignedDirs = db
      .prepare(
        `SELECT path FROM files
         WHERE scanId = ? AND isDir = 1 AND owner = 'unknown' AND appId IS NULL
           AND (
             path LIKE '%\\AppData\\%' COLLATE NOCASE
             OR path LIKE '%\\ProgramData\\%' COLLATE NOCASE
             OR path LIKE '%\\Temp\\%' COLLATE NOCASE
             OR path LIKE '%\\Local\\Packages\\%' COLLATE NOCASE
           )
         ORDER BY sizeBytes DESC
         LIMIT 20000`
      )
      .all(scanId) as { path: string }[]

    for (const directory of unassignedDirs) {
      const current = db
        .prepare('SELECT appId FROM files WHERE scanId = ? AND path = ?')
        .get(scanId, directory.path) as { appId: string | null } | undefined
      if (current?.appId) {
        continue
      }

      const result = matchPath(directory.path, apps)
      if (!result) {
        continue
      }
      if (result.ambiguous) {
        insertOwnership.run(
          scanId,
          'path',
          directory.path,
          null,
          result.confidence,
          result.reason
        )
        continue
      }

      const changes = updateFiles.run(
        result.appId,
        scanId,
        ...prefixParams(directory.path)
      ).changes
      if (changes > 0) {
        insertOwnership.run(
          scanId,
          'path',
          directory.path,
          result.appId,
          result.confidence,
          result.reason
        )
      }
    }

    const registryEntries = selectRegistry.all(scanId) as {
      id: number
      hive: 'HKLM' | 'HKCU'
      keyPath: string
    }[]
    for (const entry of registryEntries) {
      const result = matchRegistryEntry(entry, apps)
      if (!result) {
        continue
      }
      if (result.ambiguous) {
        insertOwnership.run(
          scanId,
          'registry',
          String(entry.id),
          null,
          result.confidence,
          result.reason
        )
        continue
      }
      updateRegistry.run(result.appId, entry.id)
      insertOwnership.run(
        scanId,
        'registry',
        String(entry.id),
        result.appId,
        result.confidence,
        result.reason
      )
    }
  })()

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN isDir = 0 AND owner != 'system' THEN sizeBytes ELSE 0 END), 0) AS totalBytes,
         COALESCE(SUM(CASE WHEN isDir = 0 AND owner != 'system' AND appId IS NOT NULL THEN sizeBytes ELSE 0 END), 0) AS assignedBytes
       FROM files WHERE scanId = ?`
    )
    .get(scanId) as { totalBytes: number; assignedBytes: number }
  const unownedTop = db
    .prepare(
      `SELECT path, sizeBytes FROM files
       WHERE scanId = ? AND isDir = 1 AND owner != 'system' AND appId IS NULL
       ORDER BY sizeBytes DESC LIMIT 50`
    )
    .all(scanId) as { path: string; sizeBytes: number }[]
  const unownedBytes = Math.max(0, totals.totalBytes - totals.assignedBytes)

  return {
    totalBytes: totals.totalBytes,
    assignedBytes: totals.assignedBytes,
    unownedBytes,
    assignedRatio: totals.totalBytes > 0 ? totals.assignedBytes / totals.totalBytes : 0,
    unownedTop
  }
}

export function formatOwnershipStats(stats: OwnershipStats): string {
  return `归属完成：已归属 ${(stats.assignedRatio * 100).toFixed(1)}%，未归属 ${(
    (1 - stats.assignedRatio) *
    100
  ).toFixed(1)}%`
}
