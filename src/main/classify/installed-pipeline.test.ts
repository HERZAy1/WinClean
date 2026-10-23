import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyRuleOwnership, formatOwnershipStats, loadOwnershipApps } from '../ownership/apply'
import { buildBreakdowns } from '../breakdown/service'

// 本机安装版数据库副本，仅用于本地基准测试；缺失时整组跳过，保证克隆后测试可跑
const dbPath =
  process.env.WINCLEAN_BENCH_DB ??
  path.resolve(process.cwd(), '.dev-user-data/installed-app-copy.db')
const hasDb = fs.existsSync(dbPath)

describe.skipIf(!hasDb)('installed DB ownership + breakdown benchmark', () => {
  it(
    'runs ownership and breakdown on installed scan',
    () => {
      const db = new Database(dbPath)
      // 与分类基准测试并行运行时串行等待，避免 database is locked
      db.pragma('busy_timeout = 180000')
      const started = Date.now()
      const stats = applyRuleOwnership(1, loadOwnershipApps(db), db)
      const ownershipMs = Date.now() - started
      console.log('INSTALLED_OWNERSHIP', ownershipMs, formatOwnershipStats(stats), stats.unownedTop.slice(0, 5))
      const breakdownStart = Date.now()
      const count = buildBreakdowns(1, db)
      const breakdownMs = Date.now() - breakdownStart
      const items = db.prepare('SELECT category, COUNT(*) n, SUM(sizeBytes) bytes FROM size_items GROUP BY category').all()
      console.log('INSTALLED_BREAKDOWN', breakdownMs, count, items)
      expect(stats.totalBytes).toBeGreaterThan(0)
      db.close()
    },
    600_000
  )
})
