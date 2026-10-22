import { describe, expect, it } from 'vitest'
import { normalizePath, toLongPath } from './path'

describe('scan path helpers', () => {
  it('盘符根目录不添加长路径前缀', () => {
    expect(toLongPath('C:\\')).toBe('C:\\')
  })

  it.skipIf(process.platform !== 'win32')('规范化盘符大小写并去掉非根目录尾斜杠', () => {
    const normalized = normalizePath('c:\\Temp\\')
    expect(normalized.startsWith('C:')).toBe(true)
    expect(normalized.endsWith('\\')).toBe(false)
  })
})
