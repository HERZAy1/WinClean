import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProgressEvent } from '../../shared/types'
import { scanDirectory, ScanCancelledError, type ScanEntry } from './scanner'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-scan-'))
  tempDirs.push(dir)
  return dir
}

function createTree(): { root: string; linkCreated: boolean } {
  const root = makeTempDir()
  fs.mkdirSync(path.join(root, 'sub', 'deep'), { recursive: true })
  fs.mkdirSync(path.join(root, 'empty'))
  fs.writeFileSync(path.join(root, 'a.txt'), 'abc')
  fs.writeFileSync(path.join(root, 'sub', 'b.txt'), '12345')
  fs.writeFileSync(path.join(root, 'sub', 'deep', 'c.txt'), '1234567')

  const outside = makeTempDir()
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'do-not-follow')
  let linkCreated: boolean
  try {
    fs.symlinkSync(outside, path.join(root, 'outside-link'), 'junction')
    linkCreated = true
  } catch {
    linkCreated = false
  }

  return { root, linkCreated }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('scanDirectory', () => {
  it('统计文件、空目录、目录汇总大小，并跳过符号链接', async () => {
    const { root, linkCreated } = createTree()
    const entries: ScanEntry[] = []
    const errors: string[] = []
    const progress: ProgressEvent[] = []

    const summary = await scanDirectory({
      roots: [root],
      totalUsedBytes: 100,
      batchSize: 2,
      progressIntervalMs: 0,
      onBatch: (batch) => {
        entries.push(...batch)
      },
      onProgress: (event) => progress.push(event),
      onError: (error) => errors.push(error.code)
    })

    const files = entries.filter((entry) => !entry.isDir)
    const dirs = entries.filter((entry) => entry.isDir)
    const byName = new Map(dirs.map((dir) => [dir.name, dir]))

    expect(summary.files).toBe(3)
    expect(summary.directories).toBe(4)
    expect(summary.bytes).toBe(15)
    expect(files.map((file) => file.name).sort()).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(files.some((file) => file.name === 'secret.txt')).toBe(false)
    expect(byName.get('sub')?.sizeBytes).toBe(12)
    expect(byName.get('deep')?.sizeBytes).toBe(7)
    expect(byName.get('empty')?.sizeBytes).toBe(0)
    expect(byName.get(root)?.sizeBytes).toBe(15)
    if (linkCreated) {
      expect(errors).toContain('REPARSE_SKIPPED')
    }

    const percents = progress.map((event) => event.percent)
    expect(percents.every((value, index) => index === 0 || value >= percents[index - 1])).toBe(
      true
    )
    expect(percents.at(-1)).toBe(1)
    expect(progress.at(-1)?.filesScanned).toBe(3)
  })

  it('取消后抛出 ScanCancelledError', async () => {
    const { root } = createTree()
    let checks = 0

    await expect(
      scanDirectory({
        roots: [root],
        totalUsedBytes: 100,
        progressIntervalMs: 0,
        onBatch: () => undefined,
        onProgress: () => undefined,
        onError: () => undefined,
        isCancelled: () => {
          checks += 1
          return checks > 1
        }
      })
    ).rejects.toBeInstanceOf(ScanCancelledError)
  })
})
