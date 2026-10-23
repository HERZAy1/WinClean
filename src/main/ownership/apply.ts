import path from 'node:path'
import type Database from 'better-sqlite3'
import type { OwnershipApp } from './engine'
import { matchPath, matchRegistryEntry } from './engine'

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

interface PrefixMatch {
  kind: 'prefix'
  key: string
  original: string
  app: OwnershipApp
  confidence: number
  reason: string
}

interface NameMatch {
  kind: 'name'
  key: string
  original: string
  appId: string | null
  confidence: number
  reason: string
  ambiguous: boolean
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

function normalizeDir(value: string): string {
  return value.replace(/\\+$/, '').toLowerCase()
}

export function loadOwnershipApps(db: Database.Database): OwnershipApp[] {
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

const UPDATE_CHUNK = 400

/**
 * 规则归属：单遍扫描 files 表。
 * 旧实现按应用逐条执行前缀 UPDATE，等于把整张表扫 N 遍（N=已安装应用数），
 * 在 90 万行 + 290 个应用时会阻塞主线程两分钟以上。这里改为：
 * 1) 预建安装目录/可执行目录/名称推断三张前缀表；
 * 2) 对每个文件沿父目录向上查找（最多几层），命中即归类；
 * 3) 按 appId 分批 UPDATE，最后统一写 ownerships。
 */
export function applyRuleOwnership(
  scanId: number,
  apps: OwnershipApp[],
  db: Database.Database
): OwnershipStats {
  const insertOwnership = db.prepare(`
    INSERT OR REPLACE INTO ownerships
      (scanId, targetType, targetId, appId, confidence, source, reason)
    VALUES (?, ?, ?, ?, ?, 'rule', ?)
  `)
  const selectRegistry = db.prepare(
    'SELECT id, hive, keyPath FROM registry_entries WHERE scanId = ?'
  )
  const updateRegistry = db.prepare('UPDATE registry_entries SET appId = ? WHERE id = ?')

  const visibleApps = apps.filter((app) => !app.hidden)

  const installMap = new Map<string, PrefixMatch>()
  const installApps = visibleApps
    .filter((app) => app.installLocation)
    .sort((a, b) => (b.installLocation?.length ?? 0) - (a.installLocation?.length ?? 0))
  for (const app of installApps) {
    if (!app.installLocation) {
      continue
    }
    const key = normalizeDir(app.installLocation)
    if (key && !installMap.has(key)) {
      installMap.set(key, {
        kind: 'prefix',
        key,
        original: app.installLocation,
        app,
        confidence: 0.98,
        reason: `位于 ${app.name} 安装目录内`
      })
    }
  }

  const exeMap = new Map<string, PrefixMatch>()
  for (const app of visibleApps) {
    for (const exePath of app.exePaths) {
      const directory = path.win32.dirname(exePath)
      if (!directory) {
        continue
      }
      const key = normalizeDir(directory)
      if (key && !exeMap.has(key)) {
        exeMap.set(key, {
          kind: 'prefix',
          key,
          original: directory,
          app,
          confidence: 0.95,
          reason: `位于 ${app.name} 可执行文件目录内`
        })
      }
    }
  }

  // 名称推断：只对“体积最大的一批未归属目录”做，数量有限，结果做成前缀表复用
  const nameMap = new Map<string, NameMatch>()
  const candidates = db
    .prepare(
      `SELECT path FROM files
       WHERE scanId = ? AND isDir = 1 AND owner = 'unknown'
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
  for (const candidate of candidates) {
    const key = normalizeDir(candidate.path)
    if (!key || nameMap.has(key)) {
      continue
    }
    const result = matchPath(candidate.path, apps)
    if (!result) {
      continue
    }
    nameMap.set(key, {
      kind: 'name',
      key,
      original: candidate.path,
      appId: result.ambiguous ? null : result.appId,
      confidence: result.confidence,
      reason: result.reason,
      ambiguous: Boolean(result.ambiguous)
    })
  }

  const assignedIds = new Map<string, number[]>()
  const matchedPrefixes = new Map<string, PrefixMatch | NameMatch>()

  db.transaction(() => {
    db.prepare("UPDATE files SET appId = NULL WHERE scanId = ? AND owner != 'system'").run(scanId)
    db.prepare('DELETE FROM ownerships WHERE scanId = ?').run(scanId)
    db.prepare('UPDATE registry_entries SET appId = NULL WHERE scanId = ?').run(scanId)

    const rows = db
      .prepare("SELECT id, path FROM files WHERE scanId = ? AND owner != 'system'")
      .iterate(scanId) as Iterable<{ id: number; path: string }>

    for (const row of rows) {
      const lower = row.path.toLowerCase()
      let installHit: PrefixMatch | undefined
      let exeHit: PrefixMatch | undefined
      let nameHit: NameMatch | undefined
      let current = lower

      while (current.length > 0) {
        if (!installHit) {
          installHit = installMap.get(current)
        }
        if (!exeHit) {
          exeHit = exeMap.get(current)
        }
        if (!nameHit) {
          nameHit = nameMap.get(current)
        }
        if (installHit) {
          break
        }
        const index = current.lastIndexOf('\\')
        if (index <= 0) {
          break
        }
        current = current.slice(0, index)
      }

      const chosen = installHit ?? exeHit
      if (chosen) {
        let ids = assignedIds.get(chosen.app.id)
        if (!ids) {
          ids = []
          assignedIds.set(chosen.app.id, ids)
        }
        ids.push(row.id)
        matchedPrefixes.set(chosen.key, chosen)
        continue
      }

      if (nameHit) {
        matchedPrefixes.set(nameHit.key, nameHit)
        if (nameHit.ambiguous || !nameHit.appId) {
          continue
        }
        let ids = assignedIds.get(nameHit.appId)
        if (!ids) {
          ids = []
          assignedIds.set(nameHit.appId, ids)
        }
        ids.push(row.id)
      }
    }

    let updated = 0
    for (const [appId, ids] of assignedIds) {
      for (let offset = 0; offset < ids.length; offset += UPDATE_CHUNK) {
        const chunk = ids.slice(offset, offset + UPDATE_CHUNK)
        const placeholders = chunk.map(() => '?').join(',')
        updated += db
          .prepare(`UPDATE files SET appId = ? WHERE id IN (${placeholders})`)
          .run(appId, ...chunk).changes
      }
    }

    for (const match of matchedPrefixes.values()) {
      insertOwnership.run(
        scanId,
        'path',
        match.original,
        match.kind === 'prefix' ? match.app.id : match.appId,
        match.confidence,
        match.reason
      )
    }

    const registryEntries = selectRegistry.all(scanId) as {
      id: number
      hive: 'HKLM' | 'HKCU'
      keyPath: string
    }[]
    for (const entry of registryEntries) {
      const matched = matchRegistryEntry(entry, apps)
      if (!matched) {
        continue
      }
      if (matched.ambiguous) {
        insertOwnership.run(
          scanId,
          'registry',
          String(entry.id),
          null,
          matched.confidence,
          matched.reason
        )
        continue
      }
      updateRegistry.run(matched.appId, entry.id)
      insertOwnership.run(
        scanId,
        'registry',
        String(entry.id),
        matched.appId,
        matched.confidence,
        matched.reason
      )
    }

    return updated
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
