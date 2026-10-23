import { create } from 'zustand'
import type { LlmThinkingEvent, ProgressEvent, Result } from '../../../shared/types'

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled'

interface AnalysisState {
  status: AnalysisStatus
  active: boolean
  thinking: LlmThinkingEvent[]
  progress: ProgressEvent | null
  error: string | null
  completedBatches: number
  failedBatches: number
  batchTotal: number
  tokensIn: number
  tokensOut: number
  lastError: string | null
  start: (scanId: number) => Promise<Result<void>>
  cancel: () => Promise<void>
  handleThinking: (event: LlmThinkingEvent) => void
  handleProgress: (event: ProgressEvent) => void
  reset: () => void
}

const IDLE = {
  status: 'idle' as AnalysisStatus,
  active: false,
  thinking: [] as LlmThinkingEvent[],
  progress: null,
  error: null,
  completedBatches: 0,
  failedBatches: 0,
  batchTotal: 0,
  tokensIn: 0,
  tokensOut: 0,
  lastError: null
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  ...IDLE,

  start: async (scanId) => {
    set({ ...IDLE, status: 'running', active: true })
    const result = await window.api.analysis.start({ scanId })
    if (!result.ok) {
      set({ status: 'failed', active: false, error: result.error.message, lastError: result.error.message })
    }
    return result
  },

  cancel: async () => {
    const result = await window.api.analysis.cancel()
    if (!result.ok) {
      set({ error: result.error.message })
      return
    }
    set({ status: 'cancelled', active: false })
  },

  handleThinking: (event) => {
    set((state) => ({
      thinking: [...state.thinking.slice(-29), event],
      tokensIn: state.tokensIn + (event.tokensIn ?? 0),
      tokensOut: state.tokensOut + (event.tokensOut ?? 0)
    }))
  },

  handleProgress: (event) => {
    const finished =
      event.stage === 'cancelled' ||
      event.stage === 'error' ||
      (event.stage === 'llm-analysis' && event.message.includes('完成'))

    let status: AnalysisStatus = 'running'
    if (event.stage === 'cancelled') {
      status = 'cancelled'
    } else if (event.stage === 'error') {
      status = 'failed'
    } else if (finished) {
      status = (event.failedBatches ?? 0) > 0 ? 'partial' : 'done'
    }

    set({
      progress: event,
      status,
      active: status === 'running',
      error: event.stage === 'error' ? event.message : null,
      completedBatches: event.completedBatches ?? 0,
      failedBatches: event.failedBatches ?? 0,
      batchTotal: event.batchTotal ?? 0,
      lastError: event.lastError ?? null
    })
  },

  reset: () => set({ ...IDLE })
}))
