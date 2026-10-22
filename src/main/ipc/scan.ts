import { CHANNELS } from '../../shared/channels'
import { fail, ok } from './result'
import { handle } from './registry'
import type { ScanService } from '../scan/service'
import { listDrives } from '../win/drives'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDrive(value: string): string | null {
  const letter = value.replace(/:.*$/, '').trim().toUpperCase()
  return /^[A-Z]$/.test(letter) ? letter : null
}

export function registerScanIpc(service: ScanService): void {
  handle(CHANNELS.scan.start, async (_event, payload) => {
    if (!isRecord(payload) || !Array.isArray(payload['drives'])) {
      return fail('INTERNAL', '扫描磁盘参数无效')
    }

    const drives = [
      ...new Set(
        payload['drives']
          .filter((value): value is string => typeof value === 'string')
          .map(normalizeDrive)
          .filter((value): value is string => value !== null)
      )
    ]

    if (drives.length === 0) {
      return fail('INTERNAL', '请至少选择一个磁盘')
    }

    let totalUsedBytes: number
    try {
      const disks = await listDrives()
      totalUsedBytes = disks
        .filter((drive) => drives.includes(drive.letter))
        .reduce((sum, drive) => sum + drive.usedBytes, 0)
    } catch {
      totalUsedBytes = 0
    }

    try {
      return ok({ scanId: service.start(drives, totalUsedBytes) })
    } catch (error) {
      return fail('INTERNAL', '扫描启动失败', error instanceof Error ? error.message : String(error))
    }
  })

  handle(CHANNELS.scan.cancel, () => {
    service.cancel()
    return ok(undefined)
  })
}
