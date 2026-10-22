import { create } from 'zustand'
import type { ProgressEvent, Result } from '../../../shared/types'
import { zhCN } from '../i18n/zh-CN'

interface ScanState {
  scanning: boolean
  scanId: number | null
  progress: ProgressEvent | null
  errorCount: number
  error: string | null
  start: (drives: string[]) => Promise<Result<{ scanId: number }>>
  cancel: () => Promise<void>
  handleProgress: (event: ProgressEvent) => void
  handleErrorCount: (count: number) => void
  reset: () => void
}

export const useScanStore = create<ScanState>((set, get) => ({
  scanning: false,
  scanId: null,
  progress: null,
  errorCount: 0,
  error: null,

  start: async (drives) => {
    set({ error: null, errorCount: 0, progress: null })
    const result = await window.api.scan.start({ drives })
    if (result.ok) {
      set({ scanning: true, scanId: result.data.scanId })
    } else {
      set({ error: result.error.message, scanning: false })
    }
    return result
  },

  cancel: async () => {
    const result = await window.api.scan.cancel()
    if (!result.ok) {
      set({ error: result.error.message })
      return
    }
    set({ scanning: false, error: null })
  },

  handleProgress: (event) => {
    const finished =
      event.stage === 'done' || event.stage === 'cancelled' || event.stage === 'error'
    set({
      progress: event,
      scanning: finished ? false : true,
      error: event.stage === 'error' ? event.message : get().error
    })
  },

  handleErrorCount: (count) => {
    set({ errorCount: count })
  },

  reset: () => {
    set({
      scanning: false,
      scanId: null,
      progress: null,
      errorCount: 0,
      error: null
    })
  }
}))

export function scanStatusText(progress: ProgressEvent | null): string {
  if (!progress) {
    return zhCN.scan.starting
  }
  return progress.message || zhCN.scan.done
}
