// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, useThemeStore } from './useTheme'

let systemPrefersDark = false
let changeListeners: ((event: MediaQueryListEvent) => void)[] = []
let originalMatchMedia: typeof window.matchMedia | undefined

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

function emitSystemChange(prefersDark: boolean): void {
  systemPrefersDark = prefersDark
  const event = { matches: prefersDark } as MediaQueryListEvent
  changeListeners.forEach((listener) => listener(event))
}

beforeEach(() => {
  localStorage.clear()
  systemPrefersDark = false
  changeListeners = []
  originalMatchMedia = window.matchMedia
  useThemeStore.getState().dispose()
  useThemeStore.setState({ theme: 'system', resolvedTheme: 'light' })
  document.documentElement.removeAttribute('data-theme')

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => mediaQuery as unknown as MediaQueryList)
  })
})

afterEach(() => {
  useThemeStore.getState().dispose()
  localStorage.clear()
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
  it('system 模式跟随 matchMedia 变化', () => {
    systemPrefersDark = true
    useThemeStore.getState().initialize()

    expect(useThemeStore.getState().theme).toBe('system')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    emitSystemChange(false)

    expect(useThemeStore.getState().resolvedTheme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('显式主题不跟随系统变化', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    useThemeStore.getState().initialize()

    expect(useThemeStore.getState().theme).toBe('dark')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')

    emitSystemChange(false)

    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
  })

  it('切换主题时写入 localStorage 并尝试同步主进程', () => {
    const save = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '未实现' }
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { settings: { save } }
    })

    useThemeStore.getState().setTheme('dark')

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(save).toHaveBeenCalledWith({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
