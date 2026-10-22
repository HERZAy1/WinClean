import { createHash } from 'node:crypto'
import type { LlmThinkingEvent, LlmProvider, ProgressEvent, Result, UnownedExplain } from '../../shared/types'
import { CHANNELS } from '../../shared/channels'
import { getDatabase } from '../db'
import { fail, ok } from '../ipc/result'
import { sendToRenderers } from '../ipc/events'
import { LlmError, toLlmError } from '../llm/errors'
import { createLlmClient } from '../llm/factory'
import { extractJson } from '../llm/json'
import { LlmQueue } from '../llm/queue'
import type { LlmClient, LlmRequest } from '../llm/types'
import { loadOwnershipApps } from '../ownership/apply'
import { normalizeName } from '../ownership/engine'
import type { SettingsService } from '../settings/service'
import { buildAnalysisItem, buildAnalysisItems } from './items'
import {
  OWNERSHIP_SYSTEM_PROMPT,
  UNOWNED_SYSTEM_PROMPT,
  buildMessages,
  ownershipResultSchema,
  unownedResultSchema
} from './prompts'
import type { AnalysisItem, OwnershipAnalysisResult, UnownedAnalysisResult } from './types'

interface Batch {
  kind: AnalysisItem['kind']
  items: AnalysisItem[]
}

interface AnalysisOptions {
  db?: ReturnType<typeof getDatabase>
  clientFactory?: (provider: LlmProvider) => LlmClient
  onThinking?: (event: LlmThinkingEvent) => void
  onProgress?: (event: ProgressEvent) => void
}

const BATCH_SIZE = 20

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function cacheKey(batch: Batch): string {
  const payload = batch.items.map((item) => ({
    kind: item.kind,
    path: item.path,
    name: item.name,
    sizeBytes: item.sizeBytes,
    childCount: item.childCount,
    childNames: item.childNames,
    extensions: item.extensions,
    candidateApps: item.candidateApps
  }))
  return createHash('sha256').update(`${batch.kind}:${JSON.stringify(payload)}`).digest('hex')
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

export class AnalysisService {
  private readonly db: ReturnType<typeof getDatabase>
  private queue: LlmQueue | null = null
  private active = false
  private runPromise: Promise<void> | null = null
  private completedBatches = 0
  private failedBatches = 0
  private batchTotal = 0

  constructor(
    private readonly settings: SettingsService,
    private readonly options: AnalysisOptions = {}
  ) {
    this.db = options.db ?? getDatabase()
  }

  async start(scanId: number): Promise<Result<void>> {
    if (this.active) {
      return fail('INTERNAL', 'AI 分析正在进行')
    }

    const precondition = this.checkPreconditions()
    if (!precondition.ok) {
      return precondition
    }

    const items = buildAnalysisItems(scanId, this.db)
    if (items.length === 0) {
      this.emitProgress(0, 0, 0, 1, '没有需要 AI 分析的条目')
      return ok(undefined)
    }

    const batches: Batch[] = [
      ...chunk(
        items.filter((item) => item.kind === 'ownership'),
        BATCH_SIZE
      ).map((batch) => ({ kind: 'ownership' as const, items: batch })),
      ...chunk(
        items.filter((item) => item.kind === 'unowned'),
        BATCH_SIZE
      ).map((batch) => ({ kind: 'unowned' as const, items: batch }))
    ]

    this.active = true
    this.completedBatches = 0
    this.failedBatches = 0
    this.batchTotal = batches.length
    this.queue = new LlmQueue(2)
    this.runPromise = this.run(scanId, batches)
    return ok(undefined)
  }

  async waitForIdle(): Promise<void> {
    await this.runPromise
  }

  cancel(): void {
    if (!this.active) {
      return
    }
    this.active = false
    this.queue?.cancelAll()
    this.emitProgress(0, 0, this.batchTotal, 0, 'AI 分析已取消', 'cancelled')
  }

  async explain(paths: string[]): Promise<Result<UnownedExplain[]>> {
    if (this.active) {
      return fail('INTERNAL', 'AI 分析正在进行')
    }
    const precondition = this.checkPreconditions()
    if (!precondition.ok) {
      return precondition
    }

    const scanRow = this.db.prepare('SELECT id FROM scans ORDER BY id DESC LIMIT 1').get() as
      | { id: number }
      | undefined
    if (!scanRow) {
      return fail('NOT_FOUND', '还没有扫描结果')
    }

    const items = paths
      .map((path) => buildAnalysisItem(scanRow.id, path, 'unowned', this.db))
      .filter((item): item is AnalysisItem => item !== null)
    if (items.length === 0) {
      return ok([])
    }

    const batch: Batch = { kind: 'unowned', items }
    const queue = new LlmQueue(1)
    const client = this.client()
    await queue.run((signal) => this.processBatch(client, batch, 1, 1, scanRow.id, signal))

    const rows = this.db
      .prepare(
        `SELECT path, json FROM unowned_explain
         WHERE scanId = ? AND path IN (${paths.map(() => '?').join(',')})`
      )
      .all(scanRow.id, ...paths) as { path: string; json: string }[]
    return ok(rows.map((row) => JSON.parse(row.json) as UnownedExplain))
  }

  private checkPreconditions(): Result<void> {
    const settings = this.settings.getSettings()
    if (!settings.privacyConsent) {
      return fail('PERMISSION_DENIED', '请先同意隐私授权')
    }
    const provider = settings.activeProvider
    const config = settings.providers[provider]
    if (!config.modelId.trim() || !this.settings.hasApiKey(provider)) {
      return fail('LLM_NOT_CONFIGURED', '请先在设置中填写模型 ID 和 API Key')
    }
    if (!this.settings.hasSuccessfulConnectionTest(provider)) {
      return fail('LLM_NOT_CONFIGURED', '请先在设置中测试连接成功')
    }
    return ok(undefined)
  }

  private client(): LlmClient {
    const provider = this.settings.getSettings().activeProvider
    return this.options.clientFactory
      ? this.options.clientFactory(provider)
      : createLlmClient(this.settings, provider)
  }

  private async run(scanId: number, batches: Batch[]): Promise<void> {
    try {
      const client = this.client()
      const queue = this.queue
      if (!queue) {
        return
      }

      const tasks = batches.map((batch, index) =>
        queue
          .run((signal) => this.processBatch(client, batch, index + 1, batches.length, scanId, signal))
          .catch(() => {
            this.failedBatches += 1
          })
      )
      await Promise.all(tasks)

      if (!this.active) {
        return
      }
      this.active = false
      this.emitProgress(
        0,
        0,
        this.completedBatches,
        this.batchTotal,
        this.failedBatches > 0
          ? `AI 分析完成：${this.completedBatches}/${this.batchTotal}，失败 ${this.failedBatches} 批`
          : `AI 分析完成：${this.completedBatches}/${this.batchTotal}`
      )
    } catch (error) {
      if (!this.active) {
        return
      }
      this.active = false
      const llmError = toLlmError(error)
      this.emitProgress(0, 0, this.completedBatches, this.batchTotal, llmError.message, 'error')
    }
  }

  private async processBatch(
    client: LlmClient,
    batch: Batch,
    batchIndex: number,
    batchTotal: number,
    scanId: number,
    signal: AbortSignal
  ): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.processBatchOnce(client, batch, batchIndex, batchTotal, scanId, signal)
        this.completedBatches += 1
        this.emitProgress(0, 0, this.completedBatches, this.batchTotal, `AI 分析 ${this.completedBatches}/${this.batchTotal}`)
        return
      } catch (error) {
        if (error instanceof LlmError && error.code === 'CANCELLED') {
          throw error
        }
        if (attempt === 2) {
          this.emitThinking({
            batchIndex,
            batchTotal,
            status: 'failed',
            focus: batch.items[0]?.path ?? ''
          })
          throw error
        }
        this.emitThinking({
          batchIndex,
          batchTotal,
          status: 'retrying',
          focus: batch.items[0]?.path ?? ''
        })
      }
    }
  }

  private async processBatchOnce(
    client: LlmClient,
    batch: Batch,
    batchIndex: number,
    batchTotal: number,
    scanId: number,
    signal: AbortSignal
  ): Promise<void> {
    const focus = batch.items[0]?.path ?? ''
    const key = cacheKey(batch)
    const cached = this.db.prepare('SELECT response FROM llm_cache WHERE key = ?').get(key) as
      | { response: string }
      | undefined

    if (cached) {
      const parsed = this.parseResponse(batch.kind, cached.response)
      this.applyResults(scanId, batch, parsed)
      this.emitThinking({ batchIndex, batchTotal, status: 'done', focus })
      return
    }

    this.emitThinking({ batchIndex, batchTotal, status: 'queued', focus })
    this.emitThinking({ batchIndex, batchTotal, status: 'thinking', focus })

    let streamed = ''
    let lastStreamEvent = 0
    const request: LlmRequest = {
      system: batch.kind === 'ownership' ? OWNERSHIP_SYSTEM_PROMPT : UNOWNED_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildMessages(batch.kind, batch.items) }],
      maxTokens: 2000,
      temperature: 0,
      signal
    }

    const response = await client.stream(request, (delta) => {
      streamed += delta
      const now = Date.now()
      if (now - lastStreamEvent >= 100) {
        lastStreamEvent = now
        this.emitThinking({
          batchIndex,
          batchTotal,
          status: 'streaming',
          focus,
          streamedText: streamed.slice(-500)
        })
      }
    })

    const parsed = this.parseResponse(batch.kind, response.text)
    this.db
      .prepare('INSERT OR REPLACE INTO llm_cache (key, response, createdAt) VALUES (?, ?, ?)')
      .run(key, response.text, Date.now())
    this.applyResults(scanId, batch, parsed)
    this.emitThinking({
      batchIndex,
      batchTotal,
      status: 'done',
      focus,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut
    })
  }

  private parseResponse(
    kind: AnalysisItem['kind'],
    text: string
  ): OwnershipAnalysisResult[] | UnownedAnalysisResult[] {
    try {
      const value = extractJson(text)
      return kind === 'ownership'
        ? ownershipResultSchema.parse(value)
        : unownedResultSchema.parse(value)
    } catch {
      throw new LlmError('LLM_BAD_RESPONSE')
    }
  }

  private applyResults(
    scanId: number,
    batch: Batch,
    results: OwnershipAnalysisResult[] | UnownedAnalysisResult[]
  ): void {
    const itemByPath = new Map(batch.items.map((item) => [item.path, item]))
    if (batch.kind === 'ownership') {
      this.applyOwnership(scanId, results as OwnershipAnalysisResult[], itemByPath)
    } else {
      this.applyUnowned(scanId, results as UnownedAnalysisResult[], itemByPath)
    }
  }

  private applyOwnership(
    scanId: number,
    results: OwnershipAnalysisResult[],
    itemByPath: Map<string, AnalysisItem>
  ): void {
    const apps = loadOwnershipApps(this.db)
    const appByKey = new Map<string, { id: string; name: string }>()
    for (const app of apps) {
      appByKey.set(normalizeName(app.name), { id: app.id, name: app.name })
      if (app.publisher) {
        appByKey.set(normalizeName(app.publisher), { id: app.id, name: app.name })
      }
    }
    const updateFiles = this.db.prepare(
      `UPDATE files SET appId = ?
       WHERE scanId = ? AND owner != 'system' AND appId IS NULL AND ${prefixPredicate()}`
    )
    const insertOwnership = this.db.prepare(`
      INSERT OR REPLACE INTO ownerships
        (scanId, targetType, targetId, appId, confidence, source, reason)
      VALUES (?, 'path', ?, ?, ?, 'llm', ?)
    `)

    for (const result of results) {
      const item = itemByPath.get(result.path)
      if (!item) {
        continue
      }
      const app = result.appName ? appByKey.get(normalizeName(result.appName)) : undefined
      const confidence = Math.min(1, Math.max(0, result.confidence)) * 0.9
      if (app) {
        updateFiles.run(app.id, scanId, ...prefixParams(item.sourcePath))
      }
      insertOwnership.run(
        scanId,
        item.sourcePath,
        app?.id ?? null,
        confidence,
        result.reason
      )
    }
  }

  private applyUnowned(
    scanId: number,
    results: UnownedAnalysisResult[],
    itemByPath: Map<string, AnalysisItem>
  ): void {
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO unowned_explain (path, scanId, json) VALUES (?, ?, ?)'
    )
    for (const result of results) {
      const item = itemByPath.get(result.path)
      if (!item) {
        continue
      }
      const explain: UnownedExplain = {
        path: item.sourcePath,
        kind: result.kind,
        summary: result.summary,
        riskLevel: result.riskLevel,
        source: 'llm'
      }
      insert.run(item.sourcePath, scanId, JSON.stringify(explain))
    }
  }

  private emitThinking(event: LlmThinkingEvent): void {
    if (this.options.onThinking) {
      this.options.onThinking(event)
    } else {
      sendToRenderers(CHANNELS.events.llmThinking, event)
    }
  }

  private emitProgress(
    scannedBytes: number,
    totalUsedBytes: number,
    completed: number,
    total: number,
    message: string,
    stage: ProgressEvent['stage'] = 'llm-analysis'
  ): void {
    const event: ProgressEvent = {
      stage,
      scannedBytes,
      totalUsedBytes,
      percent: total > 0 ? Math.min(1, completed / total) : 0,
      filesScanned: 0,
      message
    }
    if (this.options.onProgress) {
      this.options.onProgress(event)
    } else {
      sendToRenderers(CHANNELS.events.progress, event)
    }
  }
}
