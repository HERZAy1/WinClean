import { describe, expect, it } from 'vitest'
import { classifyBreakdownPath } from './rules'

const installContext = { installLocation: 'C:\\Program Files\\Acme' }
const disposableNames = [
  'Cache',
  'Cache2',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'GrShaderCache',
  'ShaderCache',
  'D3DSCache',
  'NV_Cache',
  'AMDCache',
  'blob_storage',
  'Service Worker\\CacheStorage',
  'CacheStorage',
  'Temp',
  'tmp',
  'logs',
  'log',
  'Crashpad',
  'CrashDumps',
  'dumps',
  'CrashReports',
  'Downloading',
  'depotcache',
  'pip\\Cache',
  'npm-cache',
  'node-gyp',
  '.gradle\\caches',
  '.m2\\repository',
  '.nuget\\packages',
  'SoftwareDistribution\\Download',
  'Thumbnails',
  'INetCache',
  'WebCache',
  'Recent',
  'Update Cache',
  'Download Cache',
  'Component Cache',
  'Packages\\Cache',
  'StartupCache',
  'shader_cache',
  'gpu_cache'
]

const sensitiveNames = [
  'Documents',
  'Desktop',
  'Pictures',
  'Videos',
  'Music',
  'Downloads',
  'WeChat Files\\Msg',
  'WeChat Files\\FileStorage',
  'QQ\\Msg',
  'Messages',
  'databases',
  'saves',
  'SaveGames',
  'Local Storage',
  'IndexedDB',
  'models',
  'config',
  'settings'
]

describe('classifyBreakdownPath', () => {
  it.each(disposableNames)('缓存目录 %s 归为 disposableCache', (name) => {
    const result = classifyBreakdownPath(`C:\\Users\\Alice\\AppData\\Local\\Acme\\${name}`, installContext)
    expect(result.category).toBe('disposableCache')
    expect(result.riskLevel).toBe('low')
  })

  it.each(sensitiveNames)('用户数据 %s 不得归为 disposableCache', (name) => {
    const result = classifyBreakdownPath(`C:\\Users\\Alice\\AppData\\Local\\Acme\\${name}`, installContext)
    expect(result.category).not.toBe('disposableCache')
    expect(result.riskLevel).toBe('high')
  })

  it('安装目录内未命中缓存规则归为 body', () => {
    expect(classifyBreakdownPath('C:\\Program Files\\Acme\\app.exe', installContext)).toMatchObject({
      category: 'body',
      ruleId: 'body-install'
    })
  })

  it('AppData 未命中规则保守归为 essentialCache', () => {
    expect(
      classifyBreakdownPath('C:\\Users\\Alice\\AppData\\Local\\Acme\\data.bin', installContext)
    ).toMatchObject({ category: 'essentialCache', ruleId: 'essential-default' })
  })

  it('个人库路径优先于缓存规则', () => {
    expect(
      classifyBreakdownPath('C:\\Users\\Alice\\Documents\\Cache\\a.bin', installContext).category
    ).toBe('essentialCache')
    expect(
      classifyBreakdownPath('C:\\Users\\Alice\\Downloads\\Cache\\a.bin', installContext).category
    ).toBe('essentialCache')
  })

  it('聊天记录与数据库即使位于 Cache 下也不可清理', () => {
    expect(
      classifyBreakdownPath('C:\\Users\\Alice\\Documents\\WeChat Files\\Msg\\Cache\\a.dat', installContext)
        .category
    ).toBe('essentialCache')
    expect(
      classifyBreakdownPath('C:\\Users\\Alice\\AppData\\Local\\Acme\\databases\\Cache\\a.db', installContext)
        .category
    ).toBe('essentialCache')
  })
})
