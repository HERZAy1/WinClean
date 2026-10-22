import { describe, expect, it } from 'vitest'
import { inferInstallLocation, parseRegistrySnapshot } from './parse'

function uninstall(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Hive: 'HKLM',
    KeyPath: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\App',
    DisplayName: 'Acme App',
    Publisher: 'Acme Inc',
    DisplayVersion: '1.0.0',
    InstallLocation: 'C:\\Program Files\\Acme App',
    UninstallString: '"C:\\Program Files\\Acme App\\unins000.exe" /S',
    DisplayIcon: 'C:\\Program Files\\Acme App\\app.exe,0',
    PSChildName: 'App',
    ...overrides
  }
}

describe('inferInstallLocation', () => {
  it('处理引号、参数、DisplayIcon 逗号与目录', () => {
    expect(inferInstallLocation('"C:\\Program Files\\Acme App"')).toBe(
      'C:\\Program Files\\Acme App'
    )
    expect(inferInstallLocation('C:\\Program Files\\Acme App\\app.exe,0')).toBe(
      'C:\\Program Files\\Acme App'
    )
    expect(inferInstallLocation('"C:\\Program Files\\Acme App\\unins000.exe" /S')).toBe(
      'C:\\Program Files\\Acme App'
    )
    expect(inferInstallLocation('C:\\Program Files\\Acme App\\unins000.exe /S')).toBe(
      'C:\\Program Files\\Acme App'
    )
    expect(inferInstallLocation('MsiExec.exe /X{GUID}')).toBeUndefined()
  })
})

describe('parseRegistrySnapshot', () => {
  it('解析标准卸载项并生成稳定 appId', () => {
    const result = parseRegistrySnapshot({ uninstall: [uninstall()] })

    expect(result.apps).toHaveLength(1)
    expect(result.apps[0]).toMatchObject({
      name: 'Acme App',
      publisher: 'Acme Inc',
      version: '1.0.0',
      installLocation: 'C:\\Program Files\\Acme App',
      source: 'registry',
      hidden: false
    })
    expect(result.apps[0].id).toMatch(/^[0-9a-f]{20}$/)
    expect(result.registryEntries[0]).toMatchObject({
      hive: 'HKLM',
      keyPath: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\App',
      appId: result.apps[0].id
    })
  })

  it('无 DisplayName 的条目标记 hidden', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall({ DisplayName: '', PSChildName: 'HiddenApp' })]
    })

    expect(result.apps[0].hidden).toBe(true)
    expect(result.apps[0].name).toBe('HiddenApp')
  })

  it('SystemComponent=1 的条目标记 hidden', () => {
    const result = parseRegistrySnapshot({ uninstall: [uninstall({ SystemComponent: '1' })] })
    expect(result.apps[0].hidden).toBe(true)
  })

  it('32/64 位重复项合并 registryKeys', () => {
    const result = parseRegistrySnapshot({
      uninstall: [
        uninstall(),
        uninstall({
          KeyPath: 'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\App'
        })
      ]
    })

    expect(result.apps).toHaveLength(1)
    expect(result.apps[0].registryKeys).toHaveLength(2)
    expect(result.registryEntries).toHaveLength(2)
  })

  it('不同版本不合并', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall(), uninstall({ DisplayVersion: '2.0.0' })]
    })
    expect(result.apps).toHaveLength(2)
  })

  it('MsiExec 卸载项无安装目录但仍保留应用', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall({ InstallLocation: '', DisplayIcon: '', UninstallString: 'MsiExec.exe /X{GUID}' })]
    })
    expect(result.apps[0].installLocation).toBeUndefined()
  })

  it('从 DisplayIcon 推断安装目录', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall({ InstallLocation: '', DisplayIcon: 'D:\\Tools\\App\\app.exe,0' })]
    })
    expect(result.apps[0].installLocation).toBe('D:\\Tools\\App')
  })

  it('从 UninstallString 推断安装目录', () => {
    const result = parseRegistrySnapshot({
      uninstall: [
        uninstall({
          InstallLocation: '',
          DisplayIcon: '',
          UninstallString: '"D:\\Tools\\App\\unins000.exe" /S'
        })
      ]
    })
    expect(result.apps[0].installLocation).toBe('D:\\Tools\\App')
  })

  it('保留非 ASCII 名称与发布者', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall({ DisplayName: '微信', Publisher: '腾讯科技' })]
    })
    expect(result.apps[0].name).toBe('微信')
    expect(result.apps[0].publisher).toBe('腾讯科技')
  })

  it('关联 App Paths 可执行文件线索', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall()],
      appPaths: [{ Exe: 'app.exe', Path: 'C:\\Program Files\\Acme App\\app.exe' }]
    })
    expect(result.apps[0].exePaths).toContain('C:\\Program Files\\Acme App\\app.exe')
  })

  it('关联服务 PathName 线索', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall()],
      services: [{ Name: 'AcmeService', PathName: '"C:\\Program Files\\Acme App\\svc.exe" -k' }]
    })
    expect(result.apps[0].servicePaths).toContain('C:\\Program Files\\Acme App\\svc.exe')
  })

  it('关联发布者一级键', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall()],
      publisherKeys: [{ Hive: 'HKLM', Name: 'Acme' }]
    })
    expect(result.apps[0].publisherKeys).toContain('Acme')
  })

  it('解析 UWP 应用', () => {
    const result = parseRegistrySnapshot({
      uwp: [
        {
          Name: 'Microsoft.WindowsCalculator',
          PackageFullName: 'Microsoft.WindowsCalculator_11.0.0_x64__8wekyb3d8bbwe',
          InstallLocation: 'C:\\Program Files\\WindowsApps\\Calculator',
          Publisher: 'CN=Microsoft Corporation'
        }
      ]
    })
    expect(result.apps[0].source).toBe('uwp')
    expect(result.apps[0].id).toMatch(/^uwp-[0-9a-f]{20}$/)
    expect(result.apps[0].installLocation).toContain('WindowsApps')
  })

  it('空快照返回空结果', () => {
    expect(parseRegistrySnapshot(null)).toEqual({ apps: [], registryEntries: [] })
    expect(parseRegistrySnapshot({ uninstall: [] })).toEqual({ apps: [], registryEntries: [] })
  })

  it('单对象与数组输入都能解析', () => {
    const single = parseRegistrySnapshot({ uninstall: uninstall() })
    const array = parseRegistrySnapshot({ uninstall: [uninstall()] })
    expect(single.apps).toHaveLength(1)
    expect(array.apps).toHaveLength(1)
    expect(single.apps[0].id).toBe(array.apps[0].id)
  })

  it('未匹配的 App Paths 不生成额外应用', () => {
    const result = parseRegistrySnapshot({
      uninstall: [uninstall()],
      appPaths: [{ Path: 'D:\\Other\\other.exe' }]
    })
    expect(result.apps).toHaveLength(1)
    expect(result.apps[0].exePaths).toHaveLength(0)
  })
})
