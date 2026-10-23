import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyClassification } from './apply'
import { buildRules } from './rules'

// 本机安装版数据库副本，仅用于本地基准测试；缺失时整组跳过，保证克隆后测试可跑
const dbPath =
  process.env.WINCLEAN_BENCH_DB ??
  path.resolve(process.cwd(), '.dev-user-data/installed-app-copy.db')
const hasDb = fs.existsSync(dbPath)

describe.skipIf(!hasDb)('installed DB classification benchmark', () => {
  it(
    'classifies installed scan',
    () => {
      const db = new Database(dbPath)
      // 与归属基准测试并行运行时串行等待，避免 database is locked
      db.pragma('busy_timeout = 180000')
      const rules = buildRules(['C', 'D'])
      const started = Date.now()
      const changes = applyClassification(1, rules, db)
      const elapsed = Date.now() - started
      const counts = db
        .prepare('SELECT owner, COUNT(*) n FROM files GROUP BY owner')
        .all()
      console.log('INSTALLED_CLASSIFY', elapsed, changes, counts)
      expect(changes).toBeGreaterThan(0)
      db.close()
    },
    600_000
  )
})
