import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let logFilePath: string | null = null
let logDirPath: string | null = null

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function cleanupOldLogs(dir: string): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(name)) {
        continue
      }
      const filePath = path.join(dir, name)
      if (fs.statSync(filePath).mtimeMs < cutoff) {
        fs.rmSync(filePath, { force: true })
      }
    }
  } catch {
    // 日志清理失败不影响应用运行。
  }
}

export function redactLog(input: string): string {
  const username = process.env['USERNAME'] ?? os.userInfo().username
  let value = input
  if (username.length >= 2) {
    value = value.replace(new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERNAME%')
  }
  value = value.replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_API_KEY]')
  value = value.replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, 'Bearer [REDACTED]')
  return value
}

export function initLogger(dir?: string): void {
  logDirPath = dir ?? path.join(process.env['WINCLEAN_USER_DATA_DIR'] ?? '', 'logs')
  if (!logDirPath || logDirPath === 'logs') {
    return
  }

  try {
    fs.mkdirSync(logDirPath, { recursive: true })
    const current = path.join(logDirPath, 'app.log')
    const marker = path.join(logDirPath, '.date')
    const previous = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : ''
    if (fs.existsSync(current) && previous && previous !== today()) {
      fs.renameSync(current, path.join(logDirPath, `app-${previous}.log`))
    }
    fs.writeFileSync(marker, today(), 'utf8')
    cleanupOldLogs(logDirPath)
    logFilePath = current
  } catch {
    logFilePath = null
  }
}

function append(level: string, message: string): void {
  if (!logFilePath) {
    return
  }
  try {
    fs.appendFileSync(
      logFilePath,
      `[${new Date().toISOString()}] ${level} ${redactLog(message)}\n`,
      'utf8'
    )
  } catch {
    // 日志写入失败不影响应用运行。
  }
}

export function logInfo(message: string): void {
  append('INFO', message)
}

export function logError(message: string, error?: unknown): void {
  append('ERROR', `${message}${error ? `: ${error instanceof Error ? error.message : String(error)}` : ''}`)
}
