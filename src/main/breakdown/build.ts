import type { CleanItem, SizeCategory } from '../../shared/types'
import type Database from 'better-sqlite3'
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

// 独立于 electron 的构建逻辑，可安全地在 worker 线程中运行
export function buildBreakdowns(scanId: number, db: Database.Database): number {
  const apps = db
    .prepare('SELECT id, name, installLocation FROM apps WHERE hidden = 0')
    .all() as AppRow[]
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

  return db.transaction(() => {
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
            category: 'essentialCache' as SizeCategory,
            riskLevel: 'high' as CleanItem['riskLevel'],
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
}
