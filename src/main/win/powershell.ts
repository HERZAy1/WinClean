import { execFile } from 'node:child_process'

export interface PowerShellOptions {
  timeoutMs?: number
  maxBuffer?: number
}

export class PowerShellError extends Error {
  readonly exitCode: number | null
  readonly stderr: string

  constructor(message: string, exitCode: number | null, stderr: string) {
    super(message)
    this.name = 'PowerShellError'
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

const UTF8_PREFIX = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '$OutputEncoding = [Console]::OutputEncoding'
].join('; ')

export async function runPs(script: string, options: PowerShellOptions = {}): Promise<string> {
  const command = `${UTF8_PREFIX}; ${script}`
  const timeout = options.timeoutMs ?? 30_000

  return new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        timeout,
        windowsHide: true,
        maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (error) {
          const exitCode =
            typeof error.code === 'number'
              ? error.code
              : error.killed
                ? null
                : (error as NodeJS.ErrnoException).errno ?? null
          reject(
            new PowerShellError(
              error.killed ? `PowerShell 执行超时（${timeout}ms）` : 'PowerShell 执行失败',
              exitCode,
              String(stderr)
            )
          )
          return
        }

        resolve(String(stdout))
      }
    )
  })
}
