import { describe, expect, it } from 'vitest'
import { parseDrivesJson } from './drives'

describe('parseDrivesJson', () => {
  it('解析单盘对象（PowerShell 单结果不是数组）', () => {
    const drives = parseDrivesJson(
      JSON.stringify({
        DeviceID: 'C:',
        VolumeName: '系统',
        FileSystem: 'NTFS',
        Size: 1000,
        FreeSpace: 250
      })
    )

    expect(drives).toEqual([
      {
        letter: 'C',
        label: '系统',
        fsType: 'NTFS',
        totalBytes: 1000,
        usedBytes: 750,
        freeBytes: 250
      }
    ])
  })

  it('解析多盘数组并按盘符排序', () => {
    const drives = parseDrivesJson(
      JSON.stringify([
        { DeviceID: 'D:', VolumeName: null, FileSystem: 'NTFS', Size: 2000, FreeSpace: 500 },
        { DeviceID: 'c:', VolumeName: '系统', FileSystem: 'NTFS', Size: 1000, FreeSpace: 100 }
      ])
    )

    expect(drives.map((drive) => drive.letter)).toEqual(['C', 'D'])
    expect(drives[1].label).toBe('')
    expect(drives[0].usedBytes).toBe(900)
  })

  it('空输出和非法 JSON 返回空数组', () => {
    expect(parseDrivesJson('')).toEqual([])
    expect(parseDrivesJson('not json')).toEqual([])
  })
})
