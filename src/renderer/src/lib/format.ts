const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** unitIndex
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1

  return `${value.toFixed(digits)} ${UNITS[unitIndex]}`
}
