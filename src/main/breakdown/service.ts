import type { CleanItem, SizeBreakdown, SizeCategory } from '../../shared/types'
import { getDatabase } from '../db'

export { buildBreakdowns } from './build'

interface ItemRow {
  appId: string
  path: string
  sizeBytes: number
  category: SizeCategory
  riskLevel: CleanItem['riskLevel']
  reason: string
  source: CleanItem['source']
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
  const app = db.prepare('SELECT id, name, publisher FROM apps WHERE id = ?').get(appId) as
    | { id: string; name: string; publisher: string | null }
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
    publisher: app.publisher ?? undefined,
    ...totals,
    items
  }
}

export function listBreakdowns(scanId: number, db = getDatabase()): SizeBreakdown[] {
  const rows = db
    .prepare(
      `SELECT s.appId,
              a.name AS appName,
              a.publisher AS publisher,
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
    publisher: string | null
    totalBytes: number
    bodyBytes: number
    essentialCacheBytes: number
    disposableCacheBytes: number
  }[]

  return rows.map((row) => ({
    ...row,
    publisher: row.publisher ?? undefined,
    items: []
  }))
}
