import type { CleanItem, SizeBreakdown, SizeCategory } from '../../shared/types'
import { getDatabase } from '../db'
import { isPathCleanable } from '../safety/guard'
import { classifyBreakdownPath } from './rules'

interface AppRow {
  id: string
  name: string
  installLocation: string | null
}

interface FileRow {
  path: string
  sizeBytes: number
  appId: string
}

interface ItemRow {
  appId: string
  path: string
  sizeBytes: number
  category: SizeCategory
  riskLevel: CleanItem['riskLevel']
  reason: string
  source: CleanItem['source']
}

function appContext(app: AppRow) {
  return {
    appName: app.name,
    installLocation: app.installLocation ?? undefined,
    localAppData: process.env['LOCALAPPDATA'],
    appData: process.env['APPDATA'],
    programData: process.env['PROGRAMDATA'],
    temp: process.env['TEMP']
  }
}

export function buildBreakdowns(scanId: number, db = getDatabase()): number {
  const apps = db.prepare('SELECT id, name, installLocation FROM apps WHERE hidden = 0').all() as AppRow[]
  const appById = new Map(apps.map((app) => [app.id, app]))
  const files = db
    .prepare(
      `SELECT path, sizeBytes, appId FROM files
       WHERE scanId = ? AND appId IS NOT NULL AND owner != 'system' AND isDir = 0`
    )
    .all(scanId) as FileRow[]

  const insert = db.prepare(`
    INSERT INTO size_items (scanId, appId, path, sizeBytes, category, riskLevel, reason, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'rule')
  `)

  const count = db.transaction(() => {
    db.prepare('DELETE FROM size_items WHERE scanId = ?').run(scanId)
    let inserted = 0
    for (const file of files) {
      const app = appById.get(file.appId)
      if (!app) {
        continue
      }
      let classification = classifyBreakdownPath(file.path, {
        installLocation: app.installLocation ?? undefined
      })
      if (classification.category === 'disposableCache') {
        const cleanable = isPathCleanable(file.path, appContext(app))
        if (!cleanable.ok) {
          classification = {
            category: 'essentialCache',
            riskLevel: 'high',
            reason: `${classification.reason}（安全校验降级：${cleanable.reason}）`,
            ruleId: `${classification.ruleId}-downgraded`
          }
        }
      }

      insert.run(
        scanId,
        file.appId,
        file.path,
        file.sizeBytes,
        classification.category,
        classification.riskLevel,
        classification.reason
      )
      inserted += 1
    }
    return inserted
  })()

  return count
}

function itemsFor(scanId: number, appId: string, db = getDatabase()): CleanItem[] {
  const rows = db
    .prepare(
      `SELECT path, sizeBytes, category, riskLevel, reason, source
       FROM size_items WHERE scanId = ? AND appId = ?
       ORDER BY sizeBytes DESC`
    )
    .all(scanId, appId) as Omit<ItemRow, 'appId'>[]
  return rows.map((row) => ({
    path: row.path,
    sizeBytes: row.sizeBytes,
    category: row.category,
    riskLevel: row.riskLevel,
    reason: row.reason,
    source: row.source
  }))
}

export function getBreakdown(scanId: number, appId: string, db = getDatabase()): SizeBreakdown | null {
  const app = db.prepare('SELECT id, name FROM apps WHERE id = ?').get(appId) as
    | { id: string; name: string }
    | undefined
  if (!app) {
    return null
  }
  const items = itemsFor(scanId, appId, db)
  const totals = items.reduce(
    (sum, item) => {
      sum.totalBytes += item.sizeBytes
      if (item.category === 'body') sum.bodyBytes += item.sizeBytes
      if (item.category === 'essentialCache') sum.essentialCacheBytes += item.sizeBytes
      if (item.category === 'disposableCache') sum.disposableCacheBytes += item.sizeBytes
      return sum
    },
    { totalBytes: 0, bodyBytes: 0, essentialCacheBytes: 0, disposableCacheBytes: 0 }
  )

  return {
    appId: app.id,
    appName: app.name,
    ...totals,
    items
  }
}

export function listBreakdowns(scanId: number, db = getDatabase()): SizeBreakdown[] {
  const rows = db
    .prepare(
      `SELECT s.appId,
              a.name AS appName,
              COALESCE(SUM(s.sizeBytes), 0) AS totalBytes,
              COALESCE(SUM(CASE WHEN s.category = 'body' THEN s.sizeBytes ELSE 0 END), 0) AS bodyBytes,
              COALESCE(SUM(CASE WHEN s.category = 'essentialCache' THEN s.sizeBytes ELSE 0 END), 0) AS essentialCacheBytes,
              COALESCE(SUM(CASE WHEN s.category = 'disposableCache' THEN s.sizeBytes ELSE 0 END), 0) AS disposableCacheBytes
       FROM size_items s
       JOIN apps a ON a.id = s.appId
       WHERE s.scanId = ?
       GROUP BY s.appId, a.name
       ORDER BY totalBytes DESC`
    )
    .all(scanId) as {
    appId: string
    appName: string
    totalBytes: number
    bodyBytes: number
    essentialCacheBytes: number
    disposableCacheBytes: number
  }[]

  return rows.map((row) => ({
    ...row,
    items: []
  }))
}
