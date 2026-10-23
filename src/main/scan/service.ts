import { app } from 'electron'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { ProgressEvent } from '../../shared/types'
import { CHANNELS } from '../../shared/channels'
import { getDatabase } from '../db'
import { sendToRenderers } from '../ipc/events'
import type { ScanEntry, ScanError, ScanSummary } from './scanner'

type WorkerMessage =
  | { type: 'batch'; entries: ScanEntry[] }
  | { type: 'progress'; event: ProgressEvent }
  | { type: 'error'; error: ScanError }
  | { type: 'done'; summary: ScanSummary }
  | { type: 'cancelled' }
  | { type: 'fatal'; message: string }

export class ScanService {
  private worker: Worker | null = null
  private activeScanId: number | null = null
  private totalUsedBytes = 0
  private filesScanned = 0
  private errorCount = 0
  private lastProgress: ProgressEvent | null = null
  private activeDrives: string[] = []
  private finalized = true
  private onComplete: ((scanId: number, drives: string[]) => void | Promise<void>) | null = null

  setOnComplete(callback: (scanId: number, drives: string[]) => void | Promise<void>): void {
    this.onComplete = callback
  }

  start(drives: string[], totalUsedBytes: number): number {
    if (this.worker) {
      throw new Error('已有扫描正在进行')
    }

    const db = getDatabase()
    const startedAt = Date.now()
    const result = db
      .prepare('INSERT INTO scans (startedAt, drives, totalUsedBytes) VALUES (?, ?, ?)')
      .run(startedAt, JSON.stringify(drives), totalUsedBytes)
    const scanId = Number(result.lastInsertRowid)

    this.activeScanId = scanId
    this.activeDrives = [...drives]
    this.totalUsedBytes = totalUsedBytes
    this.filesScanned = 0
    this.errorCount = 0
    this.lastProgress = null
    this.finalized = false

    const workerPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'scan-worker.js')
      : path.join(__dirname, 'scan-worker.js')
    const worker = new Worker(workerPath, {
      workerData: {
        roots: drives.map((drive) => `${drive.toUpperCase()}:\\`),
        totalUsedBytes
      }
    })

    this.worker = worker
    worker.on('message', (message: unknown) => {
      this.handleMessage(scanId, message as WorkerMessage)
    })
    worker.on('error', (error) => {
      this.fail(scanId, error.message)
    })
    worker.on('exit', (code) => {
      if (!this.finalized && code !== 0) {
        this.fail(scanId, `扫描 worker 退出，代码 ${code}`)
      }
    })

    return scanId
  }

  cancel(): boolean {
    const worker = this.worker
    const scanId = this.activeScanId
    if (!worker || !scanId) {
      return false
    }

    this.finalized = true
    this.worker = null
    this.activeScanId = null
    worker.postMessage({ type: 'cancel' })
    void worker.terminate()
    getDatabase()
      .prepare('UPDATE scans SET finishedAt = ? WHERE id = ?')
      .run(Date.now(), scanId)

    const last = this.lastProgress
    this.sendProgress({
      stage: 'cancelled',
      scannedBytes: last?.scannedBytes ?? 0,
      totalUsedBytes: this.totalUsedBytes,
      percent: last?.percent ?? 0,
      currentPath: last?.currentPath,
      filesScanned: last?.filesScanned ?? this.filesScanned,
      message: '扫描已取消'
    })
    return true
  }

  isScanning(): boolean {
    return this.worker !== null
  }

  getActiveScanId(): number | null {
    return this.activeScanId
  }

  reportStage(stage: ProgressEvent['stage'], message: string, percent = 1): void {
    const last = this.lastProgress
    this.sendProgress({
      stage,
      scannedBytes: last?.scannedBytes ?? 0,
      totalUsedBytes: this.totalUsedBytes,
      percent,
      currentPath: last?.currentPath,
      filesScanned: last?.filesScanned ?? this.filesScanned,
      message
    })
  }

  private handleMessage(scanId: number, message: WorkerMessage): void {
    if (this.activeScanId !== scanId) {
      return
    }

    if (message.type === 'batch') {
      this.insertBatch(scanId, message.entries)
      return
    }

    if (message.type === 'progress') {
      this.filesScanned = message.event.filesScanned
      this.lastProgress = message.event
      this.sendProgress(message.event)
      return
    }

    if (message.type === 'error') {
      this.insertError(scanId, message.error)
      return
    }

    if (message.type === 'done') {
      void this.finish(scanId, message.summary)
      return
    }

    if (message.type === 'cancelled') {
      this.cancel()
      return
    }

    if (message.type === 'fatal') {
      this.fail(scanId, message.message)
    }
  }

  private insertBatch(scanId: number, entries: ScanEntry[]): void {
    if (entries.length === 0) {
      return
    }

    const db = getDatabase()
    const insert = db.prepare(`
      INSERT OR IGNORE INTO files
        (scanId, path, parentPath, name, isDir, sizeBytes, mtimeMs, owner, ownerReason, appId)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown', NULL, NULL)
    `)
    const transaction = db.transaction((batch: ScanEntry[]) => {
      for (const entry of batch) {
        insert.run(
          scanId,
          entry.path,
          entry.parentPath,
          entry.name,
          entry.isDir ? 1 : 0,
          entry.sizeBytes,
          entry.mtimeMs
        )
      }
    })
    transaction(entries)
  }

  private insertError(scanId: number, error: ScanError): void {
    getDatabase()
      .prepare('INSERT INTO scan_errors (scanId, path, code, message) VALUES (?, ?, ?, ?)')
      .run(scanId, error.path, error.code, error.message)
    this.errorCount += 1
    this.sendErrorCount()
  }

  private async finish(scanId: number, summary: ScanSummary): Promise<void> {
    if (this.finalized) {
      return
    }

    this.finalized = true
    this.worker = null
    this.activeScanId = null
    getDatabase()
      .prepare('UPDATE scans SET finishedAt = ? WHERE id = ?')
      .run(Date.now(), scanId)

    try {
      await this.onComplete?.(scanId, this.activeDrives)
    } catch (error) {
      this.sendProgress({
        stage: 'error',
        scannedBytes: summary.bytes,
        totalUsedBytes: this.totalUsedBytes,
        percent: 1,
        filesScanned: summary.files,
        message: `分类失败：${error instanceof Error ? error.message : String(error)}`
      })
      return
    }

    this.sendProgress({
      stage: 'done',
      scannedBytes: summary.bytes,
      totalUsedBytes: this.totalUsedBytes,
      percent: 1,
      filesScanned: summary.files,
      message: `扫描完成：${summary.files} 个文件`
    })
    this.sendErrorCount()
  }

  private fail(scanId: number, message: string): void {
    if (this.finalized) {
      return
    }

    this.finalized = true
    this.worker = null
    this.activeScanId = null
    this.insertError(scanId, { path: '', code: 'INTERNAL', message })
    getDatabase()
      .prepare('UPDATE scans SET finishedAt = ? WHERE id = ?')
      .run(Date.now(), scanId)

    this.sendProgress({
      stage: 'error',
      scannedBytes: 0,
      totalUsedBytes: this.totalUsedBytes,
      percent: 0,
      filesScanned: this.filesScanned,
      message
    })
  }

  private sendProgress(event: ProgressEvent): void {
    sendToRenderers(CHANNELS.events.progress, { ...event, source: 'scan' })
  }

  private sendErrorCount(): void {
    sendToRenderers(CHANNELS.events.scanErrorCount, { count: this.errorCount })
  }
}
