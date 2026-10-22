import { create } from 'zustand'
import type { AppSettings } from '../../../shared/types'

export type ThemePreference = AppSettings['theme']
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'winclean.theme'
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

let systemMediaQuery: MediaQueryList | null = null
let systemMediaListener: ((event: MediaQueryListEvent) => void) | null = null

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredTheme(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : null
  } catch {
    return null
  }
}

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

function persistTheme(theme: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 隐私模式或存储受限时仍允许本次会话切换主题。
  }

  // TODO(T02): settings:save 接通后移除 localStorage 回退，改由主进程统一持久化并读取。
  if (typeof window !== 'undefined' && window.api) {
    void window.api.settings.save({ theme }).catch(() => undefined)
  }
}

function removeSystemMediaListener(): void {
  if (systemMediaQuery && systemMediaListener) {
    systemMediaQuery.removeEventListener('change', systemMediaListener)
  }

  systemMediaQuery = null
  systemMediaListener = null
}

interface ThemeState {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  initialize: () => void
  dispose: () => void
  setTheme: (theme: ThemePreference) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'light',

  initialize: () => {
    removeSystemMediaListener()

    const theme = readStoredTheme() ?? 'system'
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

export function initializeTheme(): void {
  useThemeStore.getState().initialize()
}
