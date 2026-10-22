import { create } from 'zustand'
import type { AppSettings } from '../../../shared/types'

export type ThemePreference = AppSettings['theme']
export type ResolvedTheme = 'light' | 'dark'

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

let systemMediaQuery: MediaQueryList | null = null
let systemMediaListener: ((event: MediaQueryListEvent) => void) | null = null

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(SYSTEM_DARK_QUERY).matches
}

function resolveTheme(theme: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }

  return theme
}

function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function removeSystemMediaListener(): void {
  if (systemMediaQuery && systemMediaListener) {
    systemMediaQuery.removeEventListener('change', systemMediaListener)
  }

  systemMediaQuery = null
  systemMediaListener = null
}

async function loadThemeFromSettings(): Promise<ThemePreference> {
  try {
    const result = await window.api.settings.get()
    return result.ok ? result.data.theme : 'system'
  } catch {
    return 'system'
  }
}

function persistTheme(theme: ThemePreference): void {
  try {
    void window.api.settings.save({ theme }).catch(() => undefined)
  } catch {
    // 设置服务不可用时仍允许本次会话切换主题。
  }
}

interface ThemeState {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  initialize: () => Promise<void>
  dispose: () => void
  setTheme: (theme: ThemePreference) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'light',

  initialize: async () => {
    removeSystemMediaListener()

    const initialTheme: ThemePreference = 'system'
    const initialResolved = resolveTheme(initialTheme, getSystemPrefersDark())
    applyResolvedTheme(initialResolved)
    set({ theme: initialTheme, resolvedTheme: initialResolved })

    const theme = await loadThemeFromSettings()
    const resolvedTheme = resolveTheme(theme, getSystemPrefersDark())
    applyResolvedTheme(resolvedTheme)
    set({ theme, resolvedTheme })

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    systemMediaQuery = window.matchMedia(SYSTEM_DARK_QUERY)
    systemMediaListener = (event) => {
      if (useThemeStore.getState().theme !== 'system') {
        return
      }

      const nextTheme: ResolvedTheme = event.matches ? 'dark' : 'light'
      applyResolvedTheme(nextTheme)
      useThemeStore.setState({ resolvedTheme: nextTheme })
    }

    systemMediaQuery.addEventListener('change', systemMediaListener)
  },

  dispose: () => {
    removeSystemMediaListener()
  },

  setTheme: (theme) => {
    const resolvedTheme = resolveTheme(theme, getSystemPrefersDark())

    applyResolvedTheme(resolvedTheme)
    persistTheme(theme)
    set({ theme, resolvedTheme })
  },

  toggleTheme: () => {
    const nextTheme: ThemePreference = get().resolvedTheme === 'dark' ? 'light' : 'dark'
    get().setTheme(nextTheme)
  }
}))

export async function initializeTheme(): Promise<void> {
  await useThemeStore.getState().initialize()
}
