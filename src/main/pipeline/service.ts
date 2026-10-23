import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { app } from 'electron'
import type { Stage } from '../../shared/types'
import { logError, logInfo } from '../logging'

export interface PipelineOptions {
  dbPath: string
  scanId: number
  drives: string[]
  onStage: (stage: Stage, message: string) => void
}

interface PipelineMessage {
  type: 'stage' | 'log' | 'done' | 'error'
  stage?: string
  message?: string
  elapsedMs?: number
}

// 分类 / 归属 / 拆分是纯 CPU 计算，放在 worker 线程里跑，避免主进程事件循环被堵死
export function runPipelineInWorker(options: PipelineOptions): Promise<void> {
  const workerPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'pipeline-worker.js')
    : path.join(__dirname, 'pipeline-worker.js')

  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        dbPath: options.dbPath,
        scanId: options.scanId,
        drives: options.drives
      }
    })

    let settled = false

    worker.on('message', (message: PipelineMessage) => {
      if (message.type === 'stage' && message.stage) {
        options.onStage(message.stage as Stage, message.message ?? '')
        return
      }
      if (message.type === 'log' && message.message) {
        logInfo(`[流水线] ${message.message}`)
        return
      }
      if (message.type === 'done') {
        logInfo(`[流水线] 全部完成，用时 ${message.elapsedMs ?? 0}ms`)
        settled = true
        resolve()
        return
      }
      if (message.type === 'error') {
        settled = true
        const error = new Error(message.message ?? '流水线执行失败')
        logError('[流水线] 执行失败', error)
        reject(error)
      }
    })

    worker.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      logError('[流水线] worker 异常', error)
      reject(error)
    })

    worker.on('exit', (code) => {
      if (settled) {
        return
      }
      settled = true
      const error = new Error(`流水线 worker 异常退出（code ${code}）`)
      logError('[流水线] worker 退出', error)
      reject(error)
    })
  })
}
