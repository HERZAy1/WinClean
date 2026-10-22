import type { WinCleanApi } from '../../preload/api'

declare global {
  interface Window {
    api: WinCleanApi
  }
}

export {}
