import fs from 'node:fs'
import path from 'node:path'
import type { ProgressEvent } from '../../shared/types'
import { normalizePath, pathDepth, toLongPath } from './path'

export interface ScanEntry {
  path: string
  parentPath: string | null
  name: string
  isDir: boolean
  sizeBytes: number
  mtimeMs: number
}

export interface ScanError {
  path: string
  code: string
  message: string
}

export interface ScanOptions {
  roots: string[]
  totalUsedBytes: number
  onBatch: (entries: ScanEntry[]) => void | Promise<void>
  onProgress: (event: ProgressEvent) => void
  onError: (error: ScanError) => void
  isCancelled?: () => boolean
  batchSize?: number
  progressIntervalMs?: number
  now?: () => number
}

export interface ScanSummary {
  files: number
  directories: number
  bytes: number
}

export class ScanCancelledError extends Error {
  constructor() {
    super('扫描已取消')
    this.name = 'ScanCancelledError'
  }
}

interface PendingDir {
  path: string
  parentPath: string | null
  name: string
  mtimeMs: number
  sizeBytes: number
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as NodeJS.ErrnoException).code)
  }
  return 'INTERNAL'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function scanDirectory(options: ScanOptions): Promise<ScanSummary> {
  const now = options.now ?? Date.now
  const batchSize = options.batchSize ?? 2000
  const progressIntervalMs = options.progressIntervalMs ?? 150
  const rootPaths = options.roots.map(normalizePath)
  const stack: PendingDir[] = []
  const directories: PendingDir[] = []
  const directSizes = new Map<string, number>()
  let fileBatch: ScanEntry[] = []
  let lastFlush = now()
  let lastProgress = 0
  let scannedBytes = 0
  let filesScanned = 0
  let files = 0
  let lastPercent = 0

  const addSize = (parentPath: string | null, size: number): void => {
    if (!parentPath) {
      return
    }
    directSizes.set(parentPath, (directSizes.get(parentPath) ?? 0) + size)
  }

  const flush = async (force = false): Promise<void> => {
    if (fileBatch.length === 0) {
      return
    }
    if (!force && fileBatch.length < batchSize && now() - lastFlush < 200) {
      return
    }
    const batch = fileBatch
    fileBatch = []
    lastFlush = now()
    await options.onBatch(batch)
  }

  const emitProgress = (currentPath: string, force = false): void => {
    const current = now()
    if (!force && current - lastProgress < progressIntervalMs) {
      return
    }
    lastProgress = current
    const percent =
      options.totalUsedBytes > 0
        ? Math.min(1, scannedBytes / options.totalUsedBytes)
        : scannedBytes > 0
          ? 1
          : 0
    lastPercent = Math.max(lastPercent, percent)
    options.onProgress({
      stage: 'scanning',
      scannedBytes,
      totalUsedBytes: options.totalUsedBytes,
      percent: lastPercent,
      currentPath,
      filesScanned,
      message: `正在扫描：${currentPath}`
    })
  }

  const checkCancelled = (): void => {
    if (options.isCancelled?.()) {
      throw new ScanCancelledError()
    }
  }

  for (const root of rootPaths) {
    checkCancelled()
    try {
      const stats = await fs.promises.lstat(toLongPath(root))
      if (stats.isSymbolicLink()) {
        options.onError({ path: root, code: 'REPARSE_SKIPPED', message: '跳过重解析点' })
        continue
      }
      if (!stats.isDirectory()) {
        continue
      }

      const rootDir: PendingDir = {
        path: root,
        parentPath: null,
        name: root,
        mtimeMs: stats.mtimeMs,
        sizeBytes: 0
      }
      directories.push(rootDir)
      stack.push(rootDir)
      emitProgress(root, true)
    } catch (error) {
      options.onError({ path: root, code: errorCode(error), message: errorMessage(error) })
    }
  }

  while (stack.length > 0) {
    checkCancelled()
    const currentDir = stack.pop()
    if (!currentDir) {
      break
    }

    let directory: fs.Dir | null = null
    try {
      directory = await fs.promises.opendir(toLongPath(currentDir.path))
      for await (const dirent of directory) {
        checkCancelled()
        const childPath = normalizePath(path.join(currentDir.path, dirent.name))
        let stats: fs.Stats
        try {
          stats = await fs.promises.lstat(toLongPath(childPath))
        } catch (error) {
          options.onError({
            path: childPath,
            code: errorCode(error),
            message: errorMessage(error)
          })
          continue
        }

        if (stats.isSymbolicLink()) {
          options.onError({
            path: childPath,
            code: 'REPARSE_SKIPPED',
            message: '跳过符号链接或 junction'
          })
          continue
        }

        if (stats.isDirectory()) {
          const dir: PendingDir = {
            path: childPath,
            parentPath: currentDir.path,
            name: dirent.name,
            mtimeMs: stats.mtimeMs,
            sizeBytes: 0
          }
          directories.push(dir)
          stack.push(dir)
          continue
        }

        if (!stats.isFile()) {
          continue
        }

        const entry: ScanEntry = {
          path: childPath,
          parentPath: currentDir.path,
          name: dirent.name,
          isDir: false,
          sizeBytes: stats.size,
          mtimeMs: stats.mtimeMs
        }
        fileBatch.push(entry)
        files += 1
        filesScanned += 1
        scannedBytes += stats.size
        addSize(currentDir.path, stats.size)
        emitProgress(childPath)
        if (fileBatch.length >= batchSize) {
          await flush(true)
        } else if (now() - lastFlush >= 200) {
          await flush()
        }
      }
    } catch (error) {
      if (error instanceof ScanCancelledError) {
        throw error
      }
      options.onError({
        path: currentDir.path,
        code: errorCode(error),
        message: errorMessage(error)
      })
    } finally {
      if (directory) {
        await directory.close().catch(() => undefined)
      }
    }
  }

  await flush(true)

  const sorted = [...directories].sort((a, b) => pathDepth(b.path) - pathDepth(a.path))
  for (const dir of sorted) {
    const size = directSizes.get(dir.path) ?? 0
    dir.sizeBytes = size
    addSize(dir.parentPath, size)
  }

  for (let index = 0; index < directories.length; index += batchSize) {
    await options.onBatch(
      directories.slice(index, index + batchSize).map((dir) => ({
        path: dir.path,
        parentPath: dir.parentPath,
        name: dir.name,
        isDir: true,
        sizeBytes: dir.sizeBytes,
        mtimeMs: dir.mtimeMs
      }))
    )
  }

  options.onProgress({
    stage: 'scanning',
    scannedBytes,
    totalUsedBytes: options.totalUsedBytes,
    percent: 1,
    currentPath: '',
    filesScanned,
    message: '扫描完成'
  })

  return { files, directories: directories.length, bytes: scannedBytes }
}
