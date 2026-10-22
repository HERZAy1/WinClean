import { create } from 'zustand'
import type { LlmThinkingEvent, ProgressEvent, Result } from '../../../shared/types'

interface AnalysisState {
  active: boolean
  thinking: LlmThinkingEvent[]
  progress: ProgressEvent | null
  error: string | null
  start: (scanId: number) => Promise<Result<void>>
  cancel: () => Promise<void>
  handleThinking: (event: LlmThinkingEvent) => void
  handleProgress: (event: ProgressEvent) => void
  reset: () => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  active: false,
  thinking: [],
  progress: null,
  error: null,

  start: async (scanId) => {
    set({ active: true, thinking: [], progress: null, error: null })
    const result = await window.api.analysis.start({ scanId })
    if (!result.ok) {
      set({ active: false, error: result.error.message })
    }
    return result
  },

  cancel: async () => {
    const result = await window.api.analysis.cancel()
    if (!result.ok) {
      set({ error: result.error.message })
      return
    }
    set({ active: false })
  },

  handleThinking: (event) => {
    set((state) => ({
      thinking: [...state.thinking.slice(-29), event]
    }))
  },

  handleProgress: (event) => {
    const finished =
      event.stage === 'cancelled' ||
      event.stage === 'error' ||
      (event.stage === 'llm-analysis' &&
        (event.message.includes('完成') || event.message.includes('取消')))
    set({
      progress: event,
      active: finished ? false : true,
      error: event.stage === 'error' ? event.message : null
    })
  },

  reset: () => set({ active: false, thinking: [], progress: null, error: null })
}))
