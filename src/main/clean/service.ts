import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import type {
  CleanItem,
  CleanLogEntry,
  CleanPlan,
  CleanResult,
  Result
} from '../../shared/types'
import { getDatabase } from '../db'
import { fail, ok } from '../ipc/result'
import { buildBreakdowns } from '../breakdown/service'
import { isPathCleanable, type CleanableAppContext } from '../safety/guard'
import { normalizePath, toLongPath } from '../scan/path'
import type { SettingsService } from '../settings/service'
import { removePath, type RemovalMode, type RemovalResult } from './delete'

interface CleanServiceOptions {
  db?: ReturnType<typeof getDatabase>
  remove?: (target: string, mode: RemovalMode) => Promise<RemovalResult>
}

interface StoredPlan {
  plan: CleanPlan
  scanId: number
}

interface AppRow {
  id: string
  name: string
  installLocation: string | null
}

function appContext(app: AppRow): CleanableAppContext {
  return {
    appName: app.name,
    installLocation: app.installLocation ?? undefined,
    localAppData: process.env['LOCALAPPDATA'],
    appData: process.env['APPDATA'],
    programData: process.env['PROGRAMDATA'],
    temp: process.env['TEMP']
  }
}

export function validateSelectedPaths(plan: CleanPlan, selectedPaths: string[]): boolean {
  const allowed = new Set(plan.items.map((item) => normalizePath(item.path).toLowerCase()))
  return selectedPaths.every((path) => allowed.has(normalizePath(path).toLowerCase()))
}

export class CleanService {
  private readonly db: ReturnType<typeof getDatabase>
  private readonly remove: (target: string, mode: RemovalMode) => Promise<RemovalResult>

  constructor(
    private readonly settings: SettingsService,
    options: CleanServiceOptions = {}
  ) {
    this.db = options.db ?? getDatabase()
    this.remove = options.remove ?? removePath
  }

  preview(scanId: number, appIds: string[], includeEssential = false): Result<CleanPlan> {
    if (appIds.length === 0) {
      return fail('INTERNAL', '请选择至少一个软件')
    }

    const placeholders = appIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT s.appId, s.path, s.sizeBytes, s.category, s.riskLevel, s.reason, s.source,
                a.name AS appName, a.installLocation
         FROM size_items s
         JOIN apps a ON a.id = s.appId
         WHERE s.scanId = ? AND s.appId IN (${placeholders})
         ORDER BY s.sizeBytes DESC`
      )
      .all(scanId, ...appIds) as {
      appId: string
      path: string
      sizeBytes: number
      category: CleanItem['category']
      riskLevel: CleanItem['riskLevel']
      reason: string
      source: CleanItem['source']
      appName: string
      installLocation: string | null
    }[]

    const appById = new Map<string, AppRow>()
    for (const row of rows) {
      appById.set(row.appId, {
        id: row.appId,
        name: row.appName,
        installLocation: row.installLocation
      })
    }

    const items: CleanItem[] = []
    let blockedCount = 0
    for (const row of rows) {
      if (row.category === 'body') {
        continue
      }
      if (row.category === 'essentialCache' && !includeEssential) {
        continue
      }

      const app = appById.get(row.appId)
      if (!app) {
        blockedCount += 1
        continue
      }
      const cleanable = isPathCleanable(row.path, appContext(app))
      if (!cleanable.ok) {
        blockedCount += 1
        continue
      }
      items.push({
        path: row.path,
        sizeBytes: row.sizeBytes,
        category: row.category,
        riskLevel: row.riskLevel,
        reason: row.reason,
        source: row.source
      })
    }

    const plan: CleanPlan = {
      planId: randomUUID(),
      createdAt: Date.now(),
      items,
      estimatedFreeBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
      mode: this.settings.getSettings().cleanMode,
      blockedCount
    }
    const stored: StoredPlan = { plan, scanId }
    this.db
      .prepare('INSERT INTO clean_plans (planId, json, createdAt) VALUES (?, ?, ?)')
      .run(plan.planId, JSON.stringify(stored), plan.createdAt)
    return ok(plan)
  }

  async execute(planId: string, selectedPaths: string[]): Promise<Result<CleanResult>> {
    const row = this.db
      .prepare('SELECT json FROM clean_plans WHERE planId = ?')
      .get(planId) as { json: string } | undefined
    if (!row) {
      return fail('NOT_FOUND', '清理计划不存在')
    }

    let stored: StoredPlan
    try {
      stored = JSON.parse(row.json) as StoredPlan
    } catch {
      return fail('INTERNAL', '清理计划损坏')
    }

    if (!validateSelectedPaths(stored.plan, selectedPaths)) {
      return fail('PATH_BLOCKED', '待删除路径不在清理计划内')
    }

    const uniquePaths = [...new Set(selectedPaths.map((path) => normalizePath(path)))]
    if (uniquePaths.length === 0) {
      return ok({ planId, freedBytes: 0, succeeded: [], skipped: [] })
    }
    const itemByPath = new Map(
      stored.plan.items.map((item) => [normalizePath(item.path).toLowerCase(), item])
    )
    const appIdByPath = new Map<string, string>()
    const appRows = this.db
      .prepare(
        `SELECT path, appId FROM size_items WHERE scanId = ? AND path IN (${uniquePaths
          .map(() => '?')
          .join(',')})`
      )
      .all(stored.scanId, ...uniquePaths) as { path: string; appId: string }[]
    for (const row of appRows) {
      appIdByPath.set(normalizePath(row.path).toLowerCase(), row.appId)
    }

    const succeeded: string[] = []
    const skipped: CleanResult['skipped'] = []
    let freedBytes = 0
    const insertLog = this.db.prepare(`
      INSERT INTO clean_log (ts, planId, path, sizeBytes, result, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    for (const target of uniquePaths) {
      const item = itemByPath.get(target.toLowerCase())
      if (!item) {
        skipped.push({ path: target, reason: 'blocked', detail: '不在清理计划内' })
        continue
      }

      const appId = appIdByPath.get(target.toLowerCase())
      const app = appId
        ? (this.db
            .prepare('SELECT id, name, installLocation FROM apps WHERE id = ?')
            .get(appId) as AppRow | undefined)
        : undefined
      if (!app) {
        skipped.push({ path: target, reason: 'blocked', detail: '软件归属缺失' })
        insertLog.run(Date.now(), planId, target, item.sizeBytes, 'skipped', '软件归属缺失')
        continue
      }

      const cleanable = isPathCleanable(target, appContext(app))
      if (!cleanable.ok) {
        skipped.push({ path: target, reason: 'blocked', detail: cleanable.reason })
        insertLog.run(Date.now(), planId, target, item.sizeBytes, 'skipped', cleanable.reason)
        continue
      }

      try {
        const stats = await fs.promises.lstat(toLongPath(target))
        if (stats.isSymbolicLink()) {
          skipped.push({ path: target, reason: 'blocked', detail: '目标是链接' })
          insertLog.run(Date.now(), planId, target, item.sizeBytes, 'skipped', '目标是链接')
          continue
        }

        const result = await this.remove(target, stored.plan.mode)
        succeeded.push(target)
        freedBytes += item.sizeBytes
        insertLog.run(
          Date.now(),
          planId,
          target,
          item.sizeBytes,
          result,
          null
        )
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String((error as NodeJS.ErrnoException).code)
            : 'INTERNAL'
        const reason =
          code === 'ENOENT'
            ? 'not-found'
            : code === 'EBUSY'
              ? 'in-use'
              : code === 'EPERM' || code === 'EACCES'
                ? 'blocked'
                : 'error'
        skipped.push({ path: target, reason, detail: error instanceof Error ? error.message : String(error) })
        insertLog.run(Date.now(), planId, target, item.sizeBytes, 'skipped', error instanceof Error ? error.message : String(error))
      }
    }

    if (succeeded.length > 0) {
      const removeRows = this.db.prepare(
        `DELETE FROM files
         WHERE scanId = ? AND (
           path = ? COLLATE NOCASE
           OR (
             length(path) > ?
             AND substr(path, 1, ?) = ? COLLATE NOCASE
             AND substr(path, ? + 1, 1) = ?
           )
         )`
      )
      this.db.transaction(() => {
        for (const path of succeeded) {
          removeRows.run(
            stored.scanId,
            path,
            path.length,
            path.length,
            path,
            path.length,
            '\\'
          )
        }
        buildBreakdowns(stored.scanId, this.db)
      })()
    }

    return ok({
      planId,
      freedBytes,
      succeeded,
      skipped
    })
  }

  log(limit: number): Result<CleanLogEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT ts, planId, path, sizeBytes, result, detail
         FROM clean_log ORDER BY ts DESC LIMIT ?`
      )
      .all(limit) as CleanLogEntry[]
    return ok(rows)
  }
}
