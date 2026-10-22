import { createHash } from 'node:crypto'
import path from 'node:path'
import type { InstalledApp, RegistryEntry } from '../../shared/types'
import { normalizePath } from '../scan/path'

export interface CollectedApp extends InstalledApp {
  hidden: boolean
  exePaths: string[]
  publisherKeys: string[]
  servicePaths: string[]
  uwpPackage?: string
}

export interface ParsedRegistryEntry extends Omit<RegistryEntry, 'id'> {
  hidden: boolean
}

export interface ParsedRegistrySnapshot {
  apps: CollectedApp[]
  registryEntries: ParsedRegistryEntry[]
}

type RawRecord = Record<string, unknown>

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }
  return value === null || value === undefined ? [] : [value]
}

function stringField(record: RawRecord, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function booleanField(record: RawRecord, key: string): boolean {
  const value = record[key]
  return value === true || value === 1 || value === '1'
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function stableId(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 20)
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    return end > 0 ? trimmed.slice(1, end) : trimmed.slice(1)
  }
  return trimmed
}

function expandEnvironment(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, name: string) => {
    const envValue = process.env[name]
    return envValue ?? match
  })
}

function looksLikePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

function cleanPathCandidate(value: string): string {
  const expanded = expandEnvironment(stripQuotes(value))
  const comma = expanded.indexOf(',')
  return (comma >= 0 ? expanded.slice(0, comma) : expanded).trim()
}

export function inferInstallLocation(value: string): string | undefined {
  const candidate = cleanPathCandidate(value)
  if (!candidate || !looksLikePath(candidate)) {
    return undefined
  }

  const lower = candidate.toLowerCase()
  if (
    lower.includes('msiexec') ||
    lower.includes('rundll32') ||
    lower.includes('powershell') ||
    lower.includes('cmd.exe')
  ) {
    return undefined
  }

  let resolved = candidate
  const executableMatch = /^(.+?\.(?:exe|dll|ico|msi))(?:\s|$)/i.exec(candidate)
  if (executableMatch?.[1]) {
    resolved = path.win32.dirname(executableMatch[1])
  } else if (/\.(exe|dll|ico|msi)$/i.test(resolved)) {
    resolved = path.win32.dirname(resolved)
  }

  try {
    return normalizePath(resolved)
  } catch {
    return undefined
  }
}

function uninstallLocation(record: RawRecord): string | undefined {
  const installLocation = inferInstallLocation(stringField(record, 'InstallLocation'))
  if (installLocation) {
    return installLocation
  }
  return (
    inferInstallLocation(stringField(record, 'DisplayIcon')) ??
    inferInstallLocation(stringField(record, 'UninstallString'))
  )
}

function executablePath(value: string): string | undefined {
  const candidate = cleanPathCandidate(value)
  if (!candidate || !looksLikePath(candidate)) {
    return undefined
  }

  const exeMatch = /^(.+?\.exe)(?:\s|$)/i.exec(candidate)
  if (exeMatch?.[1]) {
    return normalizePath(exeMatch[1])
  }

  if (/\.exe$/i.test(candidate)) {
    return normalizePath(candidate)
  }

  return undefined
}

function appKey(name: string, publisher: string, version: string, fallback: string): string {
  const normalized = `${normalizeText(name)}|${normalizeText(publisher)}|${normalizeText(version)}`
  return normalized === '||' ? fallback : normalized
}

function mergeApp(map: Map<string, CollectedApp>, app: CollectedApp): void {
  const existing = map.get(app.id)
  if (!existing) {
    map.set(app.id, app)
    return
  }

  existing.registryKeys = [...new Set([...existing.registryKeys, ...app.registryKeys])]
  existing.exePaths = [...new Set([...existing.exePaths, ...app.exePaths])]
  existing.publisherKeys = [...new Set([...existing.publisherKeys, ...app.publisherKeys])]
  existing.servicePaths = [...new Set([...existing.servicePaths, ...app.servicePaths])]
  existing.hidden = existing.hidden && app.hidden
  existing.installLocation = existing.installLocation ?? app.installLocation
  existing.uninstallString = existing.uninstallString ?? app.uninstallString
  existing.version = existing.version ?? app.version
  existing.publisher = existing.publisher ?? app.publisher
}

function matchAppByPath(apps: CollectedApp[], exePath: string): CollectedApp | undefined {
  const normalizedExe = exePath.toLowerCase()
  return apps.find((app) => {
    if (app.installLocation) {
      const install = app.installLocation.toLowerCase()
      if (normalizedExe === install || normalizedExe.startsWith(`${install}\\`)) {
        return true
      }
    }
    const baseName = path.win32.basename(normalizedExe, '.exe').toLowerCase()
    const appName = normalizeText(app.name)
    return baseName.length >= 3 && appName.includes(baseName)
  })
}

export function parseRegistrySnapshot(raw: unknown): ParsedRegistrySnapshot {
  const snapshot = isRecord(raw) ? raw : {}
  const apps = new Map<string, CollectedApp>()
  const registryEntries: ParsedRegistryEntry[] = []

  for (const item of asArray(snapshot['uninstall'])) {
    if (!isRecord(item)) {
      continue
    }

    const displayName = stringField(item, 'DisplayName')
    const publisher = stringField(item, 'Publisher')
    const version = stringField(item, 'DisplayVersion')
    const psChildName = stringField(item, 'PSChildName')
    const hive = item['Hive'] === 'HKCU' ? 'HKCU' : 'HKLM'
    const keyPath =
      stringField(item, 'KeyPath') ||
      `SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${psChildName}`
    const hidden = !displayName || booleanField(item, 'SystemComponent')
    const name = displayName || psChildName || '未命名软件'
    const installLocation = uninstallLocation(item)
    const uninstallString = stringField(item, 'UninstallString')
    const id = stableId(appKey(name, publisher, version, `${hive}:${keyPath}`))

    mergeApp(apps, {
      id,
      name,
      publisher: publisher || undefined,
      version: version || undefined,
      installLocation,
      uninstallString: uninstallString || undefined,
      source: 'registry',
      registryKeys: [`${hive}:${keyPath}`],
      hidden,
      exePaths: [],
      publisherKeys: [],
      servicePaths: []
    })

    registryEntries.push({
      hive,
      keyPath,
      valueName: 'DisplayName',
      valueData: name,
      appId: id,
      hidden
    })
  }

  for (const item of asArray(snapshot['appPaths'])) {
    if (!isRecord(item)) {
      continue
    }
    const exePath = executablePath(stringField(item, 'Path'))
    if (!exePath) {
      continue
    }
    const app = matchAppByPath([...apps.values()], exePath)
    if (app) {
      app.exePaths = [...new Set([...app.exePaths, exePath])]
    }
  }

  for (const item of asArray(snapshot['services'])) {
    if (!isRecord(item)) {
      continue
    }
    const exePath = executablePath(stringField(item, 'PathName'))
    if (!exePath) {
      continue
    }
    const app = matchAppByPath([...apps.values()], exePath)
    if (app) {
      app.servicePaths = [...new Set([...app.servicePaths, exePath])]
    }
  }

  for (const item of asArray(snapshot['publisherKeys'])) {
    if (!isRecord(item)) {
      continue
    }
    const keyName = stringField(item, 'Name')
    if (!keyName) {
      continue
    }
    const normalizedKey = normalizeText(keyName)
    for (const app of apps.values()) {
      const publisher = normalizeText(app.publisher ?? '')
      if (publisher && (publisher === normalizedKey || publisher.includes(normalizedKey))) {
        app.publisherKeys = [...new Set([...app.publisherKeys, keyName])]
      }
    }
  }

  for (const item of asArray(snapshot['uwp'])) {
    if (!isRecord(item)) {
      continue
    }
    const packageFullName = stringField(item, 'PackageFullName')
    const name = stringField(item, 'Name')
    if (!packageFullName || !name) {
      continue
    }
    const id = `uwp-${stableId(packageFullName)}`
    mergeApp(apps, {
      id,
      name,
      publisher: stringField(item, 'Publisher') || undefined,
      installLocation: stringField(item, 'InstallLocation') || undefined,
      source: 'uwp',
      registryKeys: [],
      hidden: false,
      exePaths: [],
      publisherKeys: [],
      servicePaths: [],
      uwpPackage: packageFullName
    })
  }

  return { apps: [...apps.values()], registryEntries }
}
