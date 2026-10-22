import path from 'node:path'
import { normalizePath } from '../scan/path'

export interface OwnershipApp {
  id: string
  name: string
  publisher?: string
  installLocation?: string
  exePaths: string[]
  registryKeys: string[]
  publisherKeys: string[]
  source: string
  hidden: boolean
  uwpPackage?: string
}

export interface OwnershipCandidate {
  appId: string
  appName: string
  confidence: number
  reason: string
  ruleId: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'
}

export interface PathOwnershipResult {
  appId: string | null
  appName: string | null
  confidence: number
  reason: string
  ruleId: OwnershipCandidate['ruleId']
  ambiguous: boolean
  candidates: OwnershipCandidate[]
}

export interface RegistryOwnershipInput {
  hive: 'HKLM' | 'HKCU'
  keyPath: string
}

const SUFFIX_PATTERN = /\b(inc|ltd|corp|co|llc|limited|gmbh|sa|sas|oy|ab)\b/gi

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(SUFFIX_PATTERN, '')
    .replace(/\b(?:v|version)\s*\d+(?:\.\d+)*\b/gi, '')
    .replace(/\b\d+(?:\.\d+)+\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0
  }
  if (a.length === 0) {
    return b.length
  }
  if (b.length === 0) {
    return a.length
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = saved
    }
  }
  return previous[b.length]
}

export function nameSimilarity(left: string, right: string): number {
  const a = normalizeName(left)
  const b = normalizeName(right)
  const shorter = Math.min(a.length, b.length)
  if (shorter < 4) {
    return 0
  }
  if (a === b) {
    return 1
  }
  if (a.includes(b) || b.includes(a)) {
    return 0.9
  }
  if (levenshtein(a, b) <= 1) {
    return 0.85
  }
  return 0
}

function isUnderPath(candidate: string, parent: string): boolean {
  const child = candidate.toLowerCase()
  const root = parent.replace(/[\\/]+$/, '').toLowerCase()
  return child === root || child.startsWith(`${root}\\`)
}

function segmentAfter(value: string, marker: string): string | undefined {
  const lower = value.toLowerCase()
  const index = lower.indexOf(marker)
  if (index < 0) {
    return undefined
  }
  const rest = value.slice(index + marker.length)
  const segment = rest.split(/[\\/]/).find(Boolean)
  return segment
}

function candidateFor(
  app: OwnershipApp,
  ruleId: OwnershipCandidate['ruleId'],
  confidence: number,
  reason: string
): OwnershipCandidate {
  return { appId: app.id, appName: app.name, confidence, reason, ruleId }
}

function dedupeCandidates(candidates: OwnershipCandidate[]): OwnershipCandidate[] {
  const byApp = new Map<string, OwnershipCandidate>()
  for (const candidate of candidates) {
    const existing = byApp.get(candidate.appId)
    if (!existing || candidate.confidence > existing.confidence) {
      byApp.set(candidate.appId, candidate)
    }
  }
  return [...byApp.values()].sort(
    (a, b) => b.confidence - a.confidence || a.appName.localeCompare(b.appName)
  )
}

function finalize(candidates: OwnershipCandidate[]): PathOwnershipResult | null {
  const sorted = dedupeCandidates(candidates)
  const best = sorted[0]
  if (!best) {
    return null
  }
  const second = sorted[1]
  const ambiguous = Boolean(second && best.confidence - second.confidence < 0.1)
  return {
    appId: ambiguous ? null : best.appId,
    appName: ambiguous ? null : best.appName,
    confidence: best.confidence,
    reason: ambiguous ? `归属歧义：${best.appName} / ${second?.appName}` : best.reason,
    ruleId: best.ruleId,
    ambiguous,
    candidates: sorted
  }
}

export function matchPath(pathValue: string, apps: OwnershipApp[]): PathOwnershipResult | null {
  const normalized = normalizePath(pathValue)
  const candidates: OwnershipCandidate[] = []

  for (const app of apps) {
    if (app.hidden) {
      continue
    }

    if (app.installLocation && isUnderPath(normalized, app.installLocation)) {
      candidates.push(candidateFor(app, 'R1', 0.98, `位于 ${app.name} 安装目录内`))
    }

    for (const exePath of app.exePaths) {
      const exeDir = path.win32.dirname(exePath)
      if (isUnderPath(normalized, exeDir)) {
        candidates.push(candidateFor(app, 'R2', 0.95, `位于 ${app.name} 可执行文件目录内`))
      }
    }

    const local = segmentAfter(normalized, '\\appdata\\local\\')
    const roaming = segmentAfter(normalized, '\\appdata\\roaming\\')
    const localLow = segmentAfter(normalized, '\\appdata\\locallow\\')
    const programData = segmentAfter(normalized, '\\programdata\\')
    const appDataSegment = local ?? roaming ?? localLow ?? programData
    if (appDataSegment) {
      const similarity = Math.max(
        nameSimilarity(appDataSegment, app.name),
        nameSimilarity(appDataSegment, app.publisher ?? ''),
        ...app.publisherKeys.map((key) => nameSimilarity(appDataSegment, key))
      )
      if (similarity > 0) {
        const confidence = similarity >= 1 ? 0.85 : similarity >= 0.9 ? 0.8 : 0.78
        candidates.push(candidateFor(app, 'R3', confidence, `AppData/ProgramData 名称匹配 ${app.name}`))
      }
    }

    const packageSegment = segmentAfter(normalized, '\\local\\packages\\')
    if (packageSegment && app.uwpPackage) {
      const packageName = app.uwpPackage.split('_')[0]
      if (
        packageSegment.toLowerCase().startsWith(packageName.toLowerCase()) ||
        nameSimilarity(packageSegment, app.name) > 0
      ) {
        candidates.push(candidateFor(app, 'R4', 0.9, `UWP 包匹配 ${app.name}`))
      }
    }

    const tempSegment = segmentAfter(normalized, '\\temp\\')
    if (tempSegment && nameSimilarity(tempSegment, app.name) >= 0.9) {
      candidates.push(candidateFor(app, 'R5', 0.6, `临时目录名称匹配 ${app.name}`))
    }
  }

  return finalize(candidates)
}

export function matchRegistryEntry(
  entry: RegistryOwnershipInput,
  apps: OwnershipApp[]
): PathOwnershipResult | null {
  const fullKey = `${entry.hive}:${entry.keyPath}`.toLowerCase()
  const candidates: OwnershipCandidate[] = []

  for (const app of apps) {
    if (app.hidden) {
      continue
    }

    if (app.registryKeys.some((key) => key.toLowerCase() === fullKey)) {
      candidates.push(candidateFor(app, 'R6', 1, `卸载注册表项属于 ${app.name}`))
      continue
    }

    const parts = entry.keyPath.toLowerCase().split('\\')
    if (parts[0] !== 'software') {
      continue
    }
    const topSegment = parts[1] === 'wow6432node' ? parts[2] : parts[1]
    if (!topSegment) {
      continue
    }

    const similarity = Math.max(
      nameSimilarity(topSegment, app.name),
      nameSimilarity(topSegment, app.publisher ?? ''),
      ...app.publisherKeys.map((key) => nameSimilarity(topSegment, key))
    )
    if (similarity >= 0.9) {
      candidates.push(candidateFor(app, 'R6', 0.8, `注册表发布者/名称匹配 ${app.name}`))
    }
  }

  return finalize(candidates)
}
