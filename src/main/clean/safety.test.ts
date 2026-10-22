import { describe, expect, it } from 'vitest'
import type { CleanPlan } from '../../shared/types'
import { classifyBreakdownPath } from '../breakdown/rules'
import { isPathCleanable, type CleanableAppContext } from '../safety/guard'
import { validateSelectedPaths } from './service'

const context: CleanableAppContext = {
  appName: 'Acme',
  allowedRoots: [
    'C:\\Program Files\\Acme',
    'C:\\Users\\Alice\\AppData\\Local\\Acme',
    'C:\\ProgramData\\Acme',
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Acme'
  ]
}

const attacks = [
  'C:\\Windows',
  'c:\\windows\\system32',
  'C:\\$Recycle.Bin',
  'C:\\$Recycle.Bin\\a',
  'C:\\System Volume Information',
  'C:\\System Volume Information\\a',
  'C:\\Recovery\\a',
  'C:\\Boot\\a',
  'C:\\EFI\\a',
  'C:\\pagefile.sys',
  'C:\\hiberfil.sys',
  'C:\\swapfile.sys',
  'C:\\Users\\Alice\\Documents',
  'C:\\Users\\Alice\\Documents\\a',
  'C:\\Users\\Alice\\Desktop\\a',
  'C:\\Users\\Alice\\Pictures\\a',
  'C:\\Users\\Alice\\Videos\\a',
  'C:\\Users\\Alice\\Music\\a',
  'C:\\Users\\Alice\\Downloads\\a',
  'C:\\Users\\Alice\\OneDrive\\a',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\Users',
  'C:\\Users\\Alice',
  'C:\\Users\\Alice\\AppData',
  'C:\\Users\\Alice\\AppData\\Local',
  'C:\\Users\\Alice\\AppData\\Roaming',
  'C:\\',
  'C:\\Windows\\..\\Windows\\System32',
  '\\\\?\\C:\\Windows\\Temp',
  'C:\\WINDOW~1\\System32',
  'C:\\Windows. '
]

const plan: CleanPlan = {
  planId: 'p1',
  createdAt: 0,
  items: [
    {
      path: 'C:\\Program Files\\Acme\\Cache',
      sizeBytes: 10,
      category: 'disposableCache',
      riskLevel: 'low',
      reason: 'cache',
      source: 'rule'
    }
  ],
  estimatedFreeBytes: 10,
  mode: 'recycle'
}

describe('clean safety', () => {
  it.each(attacks)('硬拦截 %s', (path) => {
    expect(isPathCleanable(path, context).ok).toBe(false)
  })

  it('用户个人库根目录及内容被拦截', () => {
    expect(isPathCleanable('C:\\Users\\Alice\\Documents\\a', context).ok).toBe(false)
    expect(isPathCleanable('C:\\Users\\Alice\\Downloads\\Cache', context).ok).toBe(false)
  })

  it('junction 与真实路径逃逸被拦截', () => {
    expect(
      isPathCleanable('C:\\Users\\Alice\\AppData\\Local\\Acme\\Cache', context, {
        isReparsePoint: true
      }).ok
    ).toBe(false)
    expect(
      isPathCleanable('C:\\Users\\Alice\\AppData\\Local\\Acme\\Cache', context, {
        realPath: 'C:\\Windows\\System32'
      }).ok
    ).toBe(false)
  })

  it('伪造 selectedPaths 不在计划内被拒绝', () => {
    expect(validateSelectedPaths(plan, ['C:\\Windows\\System32\\cmd.exe'])).toBe(false)
    expect(validateSelectedPaths(plan, ['C:\\Program Files\\Acme\\Cache'])).toBe(true)
  })

  it('LLM 声称 disposable 的 Windows 路径会被本地 guard 拦截', () => {
    const classification = classifyBreakdownPath('C:\\Windows\\Temp\\x')
    expect(classification.category).toBe('disposableCache')
    expect(isPathCleanable('C:\\Windows\\Temp\\x', context).ok).toBe(false)
  })

  it('计划内路径仍必须在软件登记范围内', () => {
    expect(isPathCleanable('D:\\Other\\Cache', context).ok).toBe(false)
  })
})
