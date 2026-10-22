import { app } from 'electron'
import { runPs } from './powershell'

let elevationPromise: Promise<boolean> | null = null

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return Promise.resolve(true)
  }

  if (!app.isPackaged && process.argv.includes('--no-elevate')) {
    return Promise.resolve(false)
  }

  if (!elevationPromise) {
    elevationPromise = runPs('net session *> $null; exit $LASTEXITCODE', {
      timeoutMs: 10_000
    }).then(
      () => true,
      () => false
    )
  }

  return elevationPromise
}

export function clearElevationCache(): void {
  elevationPromise = null
}

export async function relaunchElevated(): Promise<void> {
  if (process.platform !== 'win32') {
    return
  }

  const executable = process.execPath
  const args = process.argv.slice(1)
  const argumentList = args.map(quotePowerShell).join(', ')
  const script = [
    `$process = Start-Process -FilePath ${quotePowerShell(executable)}`,
    argumentList ? `-ArgumentList @(${argumentList})` : '',
    '-Verb RunAs -PassThru',
    'if (-not $process) { exit 1 }'
  ]
    .filter(Boolean)
    .join(' ')

  await runPs(script, { timeoutMs: 20_000 })
  app.quit()
}
