import { describe, expect, it } from 'vitest'
import {
  matchPath,
  matchRegistryEntry,
  nameSimilarity,
  normalizeName,
  type OwnershipApp
} from './engine'

const apps: OwnershipApp[] = [
  {
    id: 'adobe',
    name: 'Adobe',
    publisher: 'Adobe Inc.',
    installLocation: 'C:\\Program Files\\Adobe',
    exePaths: ['C:\\Program Files\\Adobe\\Photoshop.exe'],
    registryKeys: [],
    publisherKeys: ['Adobe'],
    source: 'registry',
    hidden: false
  },
  {
    id: 'acrobat',
    name: 'Adobe Acrobat',
    publisher: 'Adobe Inc.',
    installLocation: 'C:\\Program Files\\Adobe Acrobat',
    exePaths: [],
    registryKeys: [],
    publisherKeys: ['Adobe'],
    source: 'registry',
    hidden: false
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    publisher: 'Google LLC',
    installLocation: 'C:\\Program Files\\Google\\Chrome',
    exePaths: ['C:\\Program Files\\Google\\Chrome\\chrome.exe'],
    registryKeys: [],
    publisherKeys: ['Google'],
    source: 'registry',
    hidden: false
  },
  {
    id: 'wechat',
    name: '微信',
    publisher: 'Tencent',
    installLocation: 'C:\\Program Files\\Tencent\\WeChat',
    exePaths: [],
    registryKeys: [],
    publisherKeys: ['Tencent'],
    source: 'registry',
    hidden: false
  },
  {
    id: 'tool',
    name: 'Acme Tool',
    publisher: 'Acme',
    exePaths: ['C:\\Tools\\Acme\\tool.exe'],
    registryKeys: [],
    publisherKeys: [],
    source: 'registry',
    hidden: false
  },
  {
    id: 'uwp',
    name: 'Microsoft.WindowsCalculator',
    publisher: 'CN=Microsoft',
    exePaths: [],
    registryKeys: [],
    publisherKeys: [],
    source: 'uwp',
    hidden: false,
    uwpPackage: 'Microsoft.WindowsCalculator_11.0_x64__8wekyb3d8bbwe'
  },
  {
    id: 'hidden',
    name: 'Hidden App',
    publisher: 'Hidden',
    installLocation: 'C:\\Program Files\\Hidden',
    exePaths: [],
    registryKeys: [],
    publisherKeys: [],
    source: 'registry',
    hidden: true
  }
]

function result(path: string) {
  return matchPath(path, apps)
}

describe('normalizeName / nameSimilarity', () => {
  it('去掉公司后缀、版本号和标点', () => {
    expect(normalizeName('Adobe Inc.')).toBe('adobe')
    expect(normalizeName('Acme Tool v2.1.0')).toBe('acmetool')
  })

  it('包含关系与编辑距离受最短长度保护', () => {
    expect(nameSimilarity('Adobe', 'Adobe Acrobat')).toBe(0.9)
    expect(nameSimilarity('Adobe', 'Adobe')).toBe(1)
    expect(nameSimilarity('Chrome', 'Chromz')).toBe(0.85)
    expect(nameSimilarity('AI', 'AI')).toBe(0)
  })
})

describe('matchPath', () => {
  it('R1 安装目录内置信度 0.98', () => {
    const value = result('C:\\Program Files\\Adobe\\Photoshop\\plugin.dll')
    expect(value).toMatchObject({ appId: 'adobe', confidence: 0.98, ruleId: 'R1' })
  })

  it('R1 不误匹配相邻目录', () => {
    const value = result('C:\\Program Files\\Adobe Acrobat\\Acrobat.exe')
    expect(value?.appId).toBe('acrobat')
  })

  it('R1 大小写不敏感', () => {
    expect(result('c:\\program files\\adobe\\a.dll')?.appId).toBe('adobe')
  })

  it('R1 命中安装目录本身', () => {
    expect(result('C:\\Program Files\\Adobe')?.appId).toBe('adobe')
  })

  it('R2 可执行文件目录内置信度 0.95', () => {
    const value = result('C:\\Tools\\Acme\\data\\cache.bin')
    expect(value).toMatchObject({ appId: 'tool', confidence: 0.95, ruleId: 'R2' })
  })

  it('R3 Local AppData 发布者匹配', () => {
    const value = result('C:\\Users\\Alice\\AppData\\Local\\Google\\Chrome\\User Data')
    expect(value).toMatchObject({ appId: 'chrome', ruleId: 'R3' })
    expect(value?.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('R3 Roaming 应用名匹配', () => {
    expect(result('C:\\Users\\Alice\\AppData\\Roaming\\Tencent\\WeChat\\config')?.appId).toBe(
      'wechat'
    )
  })

  it('R3 ProgramData 匹配', () => {
    expect(result('C:\\ProgramData\\Tencent\\WeChat\\data')?.appId).toBe('wechat')
  })

  it('R3 近似名称匹配', () => {
    expect(result('C:\\Users\\Alice\\AppData\\Local\\Acrobat\\cache')?.appId).toBe('acrobat')
  })

  it('R3 Adobe 与 Adobe Acrobat 产生歧义', () => {
    const value = result('C:\\Users\\Alice\\AppData\\Local\\Adobe\\cache')
    expect(value?.ambiguous).toBe(true)
    expect(value?.appId).toBeNull()
    expect(value?.candidates.map((item) => item.appId).sort()).toEqual(['acrobat', 'adobe'])
  })

  it('R4 UWP 包目录匹配', () => {
    const value = result(
      'C:\\Users\\Alice\\AppData\\Local\\Packages\\Microsoft.WindowsCalculator_8wekyb3d8bbwe\\LocalState'
    )
    expect(value).toMatchObject({ appId: 'uwp', confidence: 0.9, ruleId: 'R4' })
  })

  it('R5 临时目录名称匹配', () => {
    const value = result('C:\\Users\\Alice\\AppData\\Local\\Temp\\Chrome')
    expect(value).toMatchObject({ appId: 'chrome', confidence: 0.6, ruleId: 'R5' })
  })

  it('隐藏应用不参与归属', () => {
    expect(result('C:\\Program Files\\Hidden\\a.dll')).toBeNull()
  })

  it('无匹配返回 null', () => {
    expect(result('C:\\Random\\Folder\\file.txt')).toBeNull()
  })

  it('R1 优先于 R3', () => {
    const value = result('C:\\Program Files\\Adobe\\User Data')
    expect(value).toMatchObject({ appId: 'adobe', ruleId: 'R1' })
  })
})

describe('matchRegistryEntry', () => {
  it('R6 卸载项本身置信度 1.0', () => {
    const value = matchRegistryEntry(
      {
        hive: 'HKLM',
        keyPath: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe'
      },
      [
        {
          ...apps[0],
          registryKeys: ['HKLM:SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe']
        }
      ]
    )
    expect(value).toMatchObject({ appId: 'adobe', confidence: 1, ruleId: 'R6' })
  })

  it('R6 发布者一级键匹配', () => {
    const value = matchRegistryEntry({ hive: 'HKLM', keyPath: 'SOFTWARE\\Google\\Update' }, apps)
    expect(value?.appId).toBe('chrome')
  })

  it('R6 发布者键产生歧义', () => {
    const value = matchRegistryEntry({ hive: 'HKCU', keyPath: 'SOFTWARE\\Adobe\\Acrobat' }, apps)
    expect(value?.ambiguous).toBe(true)
  })

  it('R6 未匹配返回 null', () => {
    expect(matchRegistryEntry({ hive: 'HKLM', keyPath: 'SOFTWARE\\Unknown\\Thing' }, apps)).toBeNull()
  })

  it('R6 隐藏应用不参与', () => {
    expect(
      matchRegistryEntry(
        { hive: 'HKLM', keyPath: 'SOFTWARE\\Hidden\\App' },
        apps
      )
    ).toBeNull()
  })
})
