import { create } from 'zustand'
import type { AppSettings, LlmProvider, Result } from '../../../shared/types'
import { zhCN } from '../i18n/zh-CN'

interface SettingsState {
  settings: AppSettings | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
  save: (patch: Partial<AppSettings>) => Promise<Result<AppSettings>>
  setApiKey: (provider: LlmProvider, apiKey: string) => Promise<Result<void>>
  clearApiKey: (provider: LlmProvider) => Promise<Result<void>>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.settings.get()
      if (result.ok) {
        set({ settings: result.data, loading: false })
      } else {
        set({ error: result.error.message, loading: false })
      }
    } catch {
      set({ error: zhCN.settingsPage.loadFailed, loading: false })
    }
  },

  save: async (patch) => {
    const result = await window.api.settings.save(patch)
    if (result.ok) {
      set({ settings: result.data, error: null })
    } else {
      set({ error: result.error.message })
    }
    return result
  },

  setApiKey: async (provider, apiKey) => {
    const result = await window.api.settings.setApiKey({ provider, apiKey })
    if (result.ok) {
      await get().load()
    } else {
      set({ error: result.error.message })
    }
    return result
  },

  clearApiKey: async (provider) => {
    const result = await window.api.settings.clearApiKey({ provider })
    if (result.ok) {
      await get().load()
    } else {
      set({ error: result.error.message })
    }
    return result
  }
}))
