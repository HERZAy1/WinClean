import { describe, expect, it } from 'vitest'
import { isPathCleanable, type CleanableAppContext } from './guard'

const context: CleanableAppContext = {
  appName: 'Acme',
  installLocation: 'C:\\Program Files\\Acme',
  allowedRoots: [
    'C:\\Program Files\\Acme',
    'C:\\Users\\Alice\\AppData\\Local\\Acme',
    'C:\\Users\\Alice\\AppData\\Roaming\\Acme',
    'C:\\Users\\Alice\\AppData\\LocalLow\\Acme',
    'C:\\ProgramData\\Acme',
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Acme'
  ]
}

const blocked = [
  'C:\\',
  'C:\\Windows',
  'C:\\Windows\\System32',
  'C:\\Windows\\Temp',
  'C:\\Windows\\..\\Windows\\System32',
  '\\\\?\\C:\\Windows\\Temp',
  'C:\\WINDOW~1\\System32',
  'C:\\Windows. ',
  'C:\\$Recycle.Bin',
  'C:\\$Recycle.Bin\\a',
  'C:\\System Volume Information',
  'C:\\System Volume Information\\a',
  'C:\\Recovery\\a',
  'C:\\Boot\\a',
  'C:\\EFI\\a',
  'C:\\pagefile.sys',
  'D:\\hiberfil.sys',
  'C:\\swapfile.sys',
  'C:\\Users\\Alice\\Documents',
  'C:\\Users\\Alice\\Documents\\a.txt',
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
  'C:\\Users\\Alice\\AppData\\LocalLow',
  'C:\\ProgramData\\Microsoft\\Windows',
  'C:\\ProgramData\\Microsoft\\Windows\\a',
  'C:\\PROGRA~1',
  'C:\\Users\\Alice\\DOCUME~1\\a',
  'D:\\Other\\Cache'
]

describe('isPathCleanable', () => {
  it.each(blocked)('拦截 %s', (path) => {
    const result = isPathCleanable(path, context)
    expect(result.ok).toBe(false)
  })

  it('允许软件安装目录、AppData、ProgramData、Temp 下的缓存', () => {
    const allowed = [
      'C:\\Program Files\\Acme\\Cache\\a.bin',
      'C:\\Program Files\\Acme\\Cache. ',
      'C:\\Users\\Alice\\AppData\\Local\\Acme\\Cache\\a.bin',
      'C:\\Users\\Alice\\AppData\\Roaming\\Acme\\Cache\\a.bin',
      'C:\\Users\\Alice\\AppData\\LocalLow\\Acme\\Cache\\a.bin',
      'C:\\ProgramData\\Acme\\Cache\\a.bin',
      'C:\\Users\\Alice\\AppData\\Local\\Temp\\Acme\\Cache\\a.bin'
    ]
    for (const path of allowed) {
      expect(isPathCleanable(path, context)).toEqual({ ok: true })
    }
  })

  it('8.3 短名展开后仍可匹配允许根', () => {
    expect(isPathCleanable('C:\\PROGRA~1\\Acme\\Cache\\a.bin', context)).toEqual({ ok: true })
  })

  it('junction 与真实路径逃逸被拦截', () => {
    expect(
      isPathCleanable('C:\\Users\\Alice\\AppData\\Local\\Acme\\Cache', context, {
        isReparsePoint: true
      }).ok
    ).toBe(false)
    expect(
      isPathCleanable('C:\\Users\\Alice\\AppData\\Local\\Acme\\Cache', context, {
        realPath: 'C:\\Windows\\Temp'
      }).ok
    ).toBe(false)
  })

  it('没有允许根时拒绝', () => {
    expect(isPathCleanable('C:\\Users\\Alice\\AppData\\Local\\Acme\\Cache', { appName: 'Acme' }).ok).toBe(
      false
    )
  })
})
