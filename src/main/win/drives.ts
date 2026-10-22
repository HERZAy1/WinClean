import type { DriveInfo } from '../../shared/types'
import { runPs } from './powershell'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeDrive(raw: Record<string, unknown>): DriveInfo | null {
  const deviceId = typeof raw['DeviceID'] === 'string' ? raw['DeviceID'] : ''
  const letter = deviceId.replace(/:$/, '').toUpperCase()
  if (!letter) {
    return null
  }

  const totalBytes = asNumber(raw['Size'])
  const freeBytes = asNumber(raw['FreeSpace'])
  return {
    letter,
    label: typeof raw['VolumeName'] === 'string' ? raw['VolumeName'] : '',
    fsType: typeof raw['FileSystem'] === 'string' ? raw['FileSystem'] : '',
    totalBytes,
    usedBytes: Math.max(0, totalBytes - freeBytes),
    freeBytes
  }
}

export function parseDrivesJson(stdout: string): DriveInfo[] {
  const text = stdout.trim()
  if (!text) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return []
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed]
  return entries
    .filter(isRecord)
    .map(normalizeDrive)
    .filter((drive): drive is DriveInfo => drive !== null)
    .sort((a, b) => a.letter.localeCompare(b.letter))
}

const DRIVES_SCRIPT = [
  'Get-CimInstance Win32_LogicalDisk',
  '| Where-Object { $_.DriveType -eq 3 }',
  '| Select-Object DeviceID, VolumeName, FileSystem, Size, FreeSpace',
  '| ConvertTo-Json -Compress'
].join(' ')

export async function listDrives(): Promise<DriveInfo[]> {
  if (process.platform !== 'win32') {
    return [
      {
        letter: 'C',
        label: '系统盘（Mock）',
        fsType: 'NTFS',
        totalBytes: 512 * 1024 ** 3,
        usedBytes: 318 * 1024 ** 3,
        freeBytes: 194 * 1024 ** 3
      },
      {
        letter: 'D',
        label: '数据盘（Mock）',
        fsType: 'NTFS',
        totalBytes: 1024 * 1024 ** 3,
        usedBytes: 462 * 1024 ** 3,
        freeBytes: 562 * 1024 ** 3
      }
    ]
  }

  const stdout = await runPs(DRIVES_SCRIPT, { timeoutMs: 20_000 })
  return parseDrivesJson(stdout)
}
