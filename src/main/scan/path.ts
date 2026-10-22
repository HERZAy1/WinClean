import path from 'node:path'

export function normalizePath(input: string): string {
  const windowsPath = /^[a-zA-Z]:/.test(input) || input.startsWith('\\\\')
  const resolved = windowsPath ? path.win32.resolve(input) : path.resolve(input)
  let normalized = resolved.replace(/^\\\\\?\\/, '')

  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized[0].toUpperCase() + normalized.slice(1)
  }

  if (normalized.length > 3 && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

export function toLongPath(input: string): string {
  if (process.platform !== 'win32') {
    return input
  }

  if (/^[a-zA-Z]:[\\/]$/.test(input)) {
    return input
  }

  if (input.startsWith('\\\\?\\')) {
    return input
  }

  if (input.startsWith('\\\\')) {
    return `\\\\?\\UNC\\${input.slice(2)}`
  }

  return `\\\\?\\${input}`
}

export function pathDepth(input: string): number {
  return input.split(/[\\/]/).filter(Boolean).length
}
