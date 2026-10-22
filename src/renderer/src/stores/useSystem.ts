import { create } from 'zustand'
import type { DriveInfo, Result } from '../../../shared/types'
import { zhCN } from '../i18n/zh-CN'

interface SystemState {
  elevated: boolean | null
  elevationError: string | null
  drives: DriveInfo[]
  drivesLoading: boolean
  drivesError: string | null
  loadElevation: () => Promise<void>
  loadDrives: () => Promise<void>
  relaunchElevated: () => Promise<Result<void>>
}

export const useSystemStore = create<SystemState>((set) => ({
  elevated: null,
  elevationError: null,
  drives: [],
  drivesLoading: false,
  drivesError: null,

  loadElevation: async () => {
    try {
      const result = await window.api.app.isElevated()
      if (result.ok) {
        set({ elevated: result.data, elevationError: null })
      }
    } catch {
      set({ elevated: null })
    }
  },

  loadDrives: async () => {
    set({ drivesLoading: true, drivesError: null })
    try {
      const result = await window.api.drives.list()
      if (result.ok) {
        set({ drives: result.data, drivesLoading: false })
      } else {
        set({ drivesError: result.error.message, drivesLoading: false })
      }
    } catch {
      set({ drivesError: zhCN.drives.loadFailed, drivesLoading: false })
    }
  },

  relaunchElevated: async () => {
    const result = await window.api.app.relaunchElevated()
    if (!result.ok) {
      set({ elevationError: result.error.message })
    }
    return result
  }
}))
