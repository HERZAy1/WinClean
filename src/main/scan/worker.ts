import { parentPort, workerData } from 'node:worker_threads'
import type { ProgressEvent } from '../../shared/types'
import { scanDirectory, ScanCancelledError, type ScanEntry, type ScanError } from './scanner'

interface ScanWorkerData {
  roots: string[]
  totalUsedBytes: number
}

const port = parentPort
if (!port) {
  throw new Error('扫描 worker 缺少 parentPort')
}

const data = workerData as ScanWorkerData
let cancelled = false

port.on('message', (message: unknown) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'cancel'
  ) {
    cancelled = true
  }
})

void scanDirectory({
  roots: data.roots,
  totalUsedBytes: data.totalUsedBytes,
  isCancelled: () => cancelled,
  onBatch: (entries: ScanEntry[]) => {
    port.postMessage({ type: 'batch', entries })
  },
  onProgress: (event: ProgressEvent) => {
    port.postMessage({ type: 'progress', event })
  },
  onError: (error: ScanError) => {
    port.postMessage({ type: 'error', error })
  }
})
  .then((summary) => {
    port.postMessage({ type: 'done', summary })
  })
  .catch((error: unknown) => {
    if (error instanceof ScanCancelledError || cancelled) {
      port.postMessage({ type: 'cancelled' })
      return
    }
    port.postMessage({
      type: 'fatal',
      message: error instanceof Error ? error.message : String(error)
    })
  })
