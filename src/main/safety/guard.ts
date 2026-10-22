import path from 'node:path'
import { normalizePath } from '../scan/path'

export interface CleanableAppContext {
  appName: string
  installLocation?: string
  localAppData?: string
  appData?: string
  programData?: string
  temp?: string
  allowedRoots?: string[]
}

export interface CleanableOptions {
  isReparsePoint?: boolean
  realPath?: string
}

export type CleanableResult = { ok: true } | { ok: false; reason: string }

const SHORT_NAMES: Record<string, string> = {
  'PROGRA~1': 'Program Files',
  'PROGRA~2': 'Program Files (x86)',
  'WINDOW~1': 'Windows',
  'DOCUME~1': 'Documents',
  'DESKTO~1': 'Desktop',
  'DOWNLO~1': 'Downloads'
}

function normalizeForSafety(input: string): string {
  const normalized = normalizePath(input)
  const parts = normalized.split('\\')
  return parts
    .map((part, index) => {
      let segment = part.replace(/[. ]+$/g, '')
      if (index === 0) {
        segment = segment.toUpperCase()
      } else {
        const expanded = SHORT_NAMES[segment.toUpperCase()]
        if (expanded) {
          segment = expanded
        }
      }
      return segment
    })
    .join('\\')
}

function isUnderPath(candidate: string, parent: string): boolean {
  const child = candidate.toLowerCase()
  const root = parent.replace(/[\\/]+$/, '').toLowerCase()
  return child === root || child.startsWith(`${root}\\`)
}

function allowedRoots(context: CleanableAppContext): string[] {
  if (context.allowedRoots) {
    return context.allowedRoots.map(normalizeForSafety)
  }

  const roots = [context.installLocation]
  const local = context.localAppData ?? process.env['LOCALAPPDATA']
  const roaming = context.appData ?? process.env['APPDATA']
  const programData = context.programData ?? process.env['PROGRAMDATA']
  const temp = context.temp ?? process.env['TEMP']
  if (local) roots.push(path.win32.join(local, context.appName))
  if (roaming) roots.push(path.win32.join(roaming, context.appName))
  if (programData) roots.push(path.win32.join(programData, context.appName))
  if (temp) roots.push(path.win32.join(temp, context.appName))

  return roots.filter((root): root is string => Boolean(root)).map(normalizeForSafety)
}

export function isPathCleanable(
  pathValue: string,
  context: CleanableAppContext,
  options: CleanableOptions = {}
): CleanableResult {
  const normalized = normalizeForSafety(pathValue)

  if (options.isReparsePoint) {
    return { ok: false, reason: '目标是符号链接或 junction，拒绝删除' }
  }

  if (options.realPath && normalizeForSafety(options.realPath) !== normalized) {
    return isPathCleanable(options.realPath, context)
  }

  if (/^[A-Z]:\\$/i.test(normalized)) {
    return { ok: false, reason: '禁止删除盘符根目录' }
  }

  if (
    /^[A-Z]:\\(Windows|Windows\.old|\$Recycle\.Bin|System Volume Information|Recovery|Boot|EFI)(\\|$)/i.test(
      normalized
    )
  ) {
    return { ok: false, reason: '禁止删除 Windows 系统目录' }
  }

  if (/\\pagefile\.sys$|\\hiberfil\.sys$|\\swapfile\.sys$/i.test(normalized)) {
    return { ok: false, reason: '禁止删除系统页面/休眠文件' }
  }

  if (
    /\\Users\\[^\\]+\\(Documents|Desktop|Pictures|Videos|Music|Downloads|OneDrive)(\\|$)/i.test(
      normalized
    )
  ) {
    return { ok: false, reason: '禁止删除用户个人库及其内容' }
  }

  if (
    /^[A-Z]:\\(Program Files|Program Files \(x86\)|ProgramData|Users)$/i.test(normalized)
  ) {
    return { ok: false, reason: '禁止删除系统容器目录本身' }
  }

  if (/^[A-Z]:\\Users\\[^\\]+$/i.test(normalized)) {
    return { ok: false, reason: '禁止删除用户主目录本身' }
  }

  if (/^[A-Z]:\\Users\\[^\\]+\\AppData(\\Local|\\Roaming|\\LocalLow)?$/i.test(normalized)) {
    return { ok: false, reason: '禁止删除 AppData 目录本身' }
  }

  if (/^[A-Z]:\\ProgramData\\Microsoft\\Windows(\\|$)/i.test(normalized)) {
    return { ok: false, reason: '禁止删除 Windows 共享数据' }
  }

  const roots = allowedRoots(context)
  if (roots.length === 0 || !roots.some((root) => isUnderPath(normalized, root))) {
    return { ok: false, reason: '路径不在软件已登记的安装或数据目录内' }
  }

  return { ok: true }
}
