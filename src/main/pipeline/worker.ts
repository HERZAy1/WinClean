import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { buildBreakdowns } from '../breakdown/build'
import { applyClassification } from '../classify/apply'
import { buildRules } from '../classify/rules'
import { applyRuleOwnership, formatOwnershipStats, loadOwnershipApps } from '../ownership/apply'

interface PipelineWorkerData {
  dbPath: string
  scanId: number
  drives: string[]
}

const port = parentPort
if (!port) {
  throw new Error('流水线 worker 缺少 parentPort')
}

const data = workerData as PipelineWorkerData

function post(message: unknown): void {
  port?.postMessage(message)
}

function stage(name: string, message: string): void {
  post({ type: 'stage', stage: name, message })
}

// worker 自己持有连接，主进程不再被同步计算阻塞
const db = new Database(data.dbPath)
db.pragma('busy_timeout = 30000')

try {
  const startedAt = Date.now()

  stage('classifying', '正在分类系统与用户文件…')
  let stepAt = Date.now()
  const changes = applyClassification(data.scanId, buildRules(data.drives), db)
  post({ type: 'log', message: `分类完成：${changes} 条，${Date.now() - stepAt}ms` })

  stage('rule-matching', '正在匹配软件归属…')
  stepAt = Date.now()
  const stats = applyRuleOwnership(data.scanId, loadOwnershipApps(db), db)
  post({
    type: 'log',
    message: `归属完成：${Date.now() - stepAt}ms，${formatOwnershipStats(stats)}`
  })
  stage('rule-matching', formatOwnershipStats(stats))

  stage('breakdown', '正在拆分软件占用…')
  stepAt = Date.now()
  const items = buildBreakdowns(data.scanId, db)
  post({ type: 'log', message: `拆分完成：${items} 条，${Date.now() - stepAt}ms` })

  post({ type: 'done', elapsedMs: Date.now() - startedAt })
} catch (error) {
  post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
} finally {
  db.close()
}
