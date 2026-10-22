// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../../shared/types'
import { useThemeStore, type ThemePreference } from './useTheme'

let systemPrefersDark = false
let changeListeners: ((event: MediaQueryListEvent) => void)[] = []
let originalMatchMedia: typeof window.matchMedia | undefined
let save: ReturnType<typeof vi.fn>
let get: ReturnType<typeof vi.fn>

const mediaQuery = {
  get matches() {
    return systemPrefersDark
  },
  media: '(prefers-color-scheme: dark)',
  onchange: null,
  addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === 'change' && typeof listener === 'function') {
      changeListeners.push(listener as (event: MediaQueryListEvent) => void)
    }
  }),
  removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === 'change') {
      changeListeners = changeListeners.filter((item) => item !== listener)
    }
  }),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(() => true)
}

function settingsResult(theme: ThemePreference): {
  ok: true
  data: AppSettings
} {
  return {
    ok: true,
    data: { theme } as unknown as AppSettings
  }
}

function emitSystemChange(prefersDark: boolean): void {
  systemPrefersDark = prefersDark
  const event = { matches: prefersDark } as MediaQueryListEvent
  changeListeners.forEach((listener) => listener(event))
}

beforeEach(() => {
  systemPrefersDark = false
  changeListeners = []
  originalMatchMedia = window.matchMedia
  get = vi.fn().mockResolvedValue(settingsResult('system'))
  save = vi.fn().mockResolvedValue(settingsResult('system'))
  useThemeStore.getState().dispose()
  useThemeStore.setState({ theme: 'system', resolvedTheme: 'light' })
  document.documentElement.removeAttribute('data-theme')

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => mediaQuery as unknown as MediaQueryList)
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { settings: { get, save } }
  })
})

afterEach(() => {
  useThemeStore.getState().dispose()
  Reflect.deleteProperty(window, 'api')

  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia
    })
  }
})

describe('useTheme', () => {
  it('system 模式跟随 matchMedia 变化', async () => {
    systemPrefersDark = true
    await useThemeStore.getState().initialize()

    expect(useThemeStore.getState().theme).toBe('system')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    emitSystemChange(false)

    expect(useThemeStore.getState().resolvedTheme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('从 settings:get 恢复显式主题并忽略系统变化', async () => {
    get.mockResolvedValue(settingsResult('dark'))
    await useThemeStore.getState().initialize()

    expect(useThemeStore.getState().theme).toBe('dark')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')

    emitSystemChange(false)

    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
  })

  it('切换主题时通过 settings:save 持久化', () => {
    useThemeStore.getState().setTheme('dark')

    expect(save).toHaveBeenCalledWith({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
