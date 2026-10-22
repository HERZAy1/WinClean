import os from 'node:os'
import type { Owner } from '../../shared/types'
import { normalizePath } from '../scan/path'

export type RuleKind = 'prefix' | 'exact' | 'regex'

export interface ClassificationRule {
  id: string
  pattern: string
  kind: RuleKind
  owner: Owner
  priority: number
  description: string
}

export interface ClassificationResult {
  owner: Owner
  ruleId: string
}

function addRule(
  rules: ClassificationRule[],
  id: string,
  pattern: string,
  owner: Owner,
  priority: number,
  description: string,
  kind: RuleKind = 'prefix'
): void {
  rules.push({
    id,
    pattern: normalizePath(pattern),
    kind,
    owner,
    priority,
    description
  })
}

export function buildRules(
  drives: string[],
  username = process.env['USERNAME'] ?? os.userInfo().username,
  localAppData = process.env['LOCALAPPDATA'] ?? ''
): ClassificationRule[] {
  const rules: ClassificationRule[] = []
  const normalizedDrives = drives.length > 0 ? drives : ['C']

  for (const rawDrive of normalizedDrives) {
    const drive = rawDrive.replace(/:.*$/, '').toUpperCase()
    if (!/^[A-Z]$/.test(drive)) {
      continue
    }

    addRule(rules, `system-windows-${drive}`, `${drive}:\\Windows`, 'system', 50, 'Windows 系统目录')
    addRule(
      rules,
      `system-recycle-${drive}`,
      `${drive}:\\$Recycle.Bin`,
      'system',
      50,
      '回收站'
    )
    addRule(
      rules,
      `system-volume-${drive}`,
      `${drive}:\\System Volume Information`,
      'system',
      50,
      '系统卷信息'
    )
    addRule(rules, `system-recovery-${drive}`, `${drive}:\\Recovery`, 'system', 50, '恢复分区目录')
    addRule(rules, `system-boot-${drive}`, `${drive}:\\Boot`, 'system', 50, '启动目录')
    addRule(rules, `system-efi-${drive}`, `${drive}:\\EFI`, 'system', 50, 'EFI 目录')
    addRule(
      rules,
      `system-programdata-${drive}`,
      `${drive}:\\ProgramData\\Microsoft\\Windows`,
      'system',
      55,
      'Windows 共享数据'
    )
    addRule(
      rules,
      `system-windows-old-${drive}`,
      `${drive}:\\Windows.old`,
      'system',
      55,
      '旧版 Windows 目录，可由系统清理'
    )
    addRule(rules, `system-users-${drive}`, `${drive}:\\Users`, 'system', 5, '用户目录容器')
    addRule(
      rules,
      `system-pagefile-${drive}`,
      `${drive}:\\pagefile.sys`,
      'system',
      60,
      '页面文件',
      'exact'
    )
    addRule(
      rules,
      `system-hiberfil-${drive}`,
      `${drive}:\\hiberfil.sys`,
      'system',
      60,
      '休眠文件',
      'exact'
    )
    addRule(
      rules,
      `system-swapfile-${drive}`,
      `${drive}:\\swapfile.sys`,
      'system',
      60,
      '交换文件',
      'exact'
    )

    const home = `${drive}:\\Users\\${username}`
    addRule(rules, `user-home-${drive}`, home, 'user', 20, '用户主目录')
    for (const library of [
      'Documents',
      'Desktop',
      'Pictures',
      'Videos',
      'Music',
      'Downloads',
      'OneDrive'
    ]) {
      addRule(
        rules,
        `user-${library.toLowerCase()}-${drive}`,
        `${home}\\${library}`,
        'user',
        30,
        `用户 ${library}`
      )
    }
    addRule(
      rules,
      `unknown-appdata-${drive}`,
      `${home}\\AppData`,
      'unknown',
      40,
      'AppData 由软件归属引擎处理'
    )
    addRule(rules, `user-public-${drive}`, `${drive}:\\Users\\Public`, 'user', 25, '公共用户目录')

    if (localAppData.toLowerCase().startsWith(`${drive.toLowerCase()}:`)) {
      addRule(
        rules,
        `system-localappdata-microsoft-${drive}`,
        `${localAppData}\\Microsoft\\Windows`,
        'system',
        60,
        '用户级 Windows 数据'
      )
    }
  }

  return rules
}

function normalizedForCompare(value: string): string {
  return normalizePath(value).toLowerCase()
}

function matches(pathValue: string, rule: ClassificationRule): boolean {
  const pattern = rule.pattern.toLowerCase()

  if (rule.kind === 'regex') {
    try {
      return new RegExp(pattern, 'i').test(pathValue)
    } catch {
      return false
    }
  }

  if (rule.kind === 'exact') {
    return pathValue === pattern
  }

  if (pathValue === pattern) {
    return true
  }

  const prefix = pattern.endsWith('\\') ? pattern : `${pattern}\\`
  return pathValue.startsWith(prefix)
}

export function sortRules(rules: ClassificationRule[]): ClassificationRule[] {
  return [...rules].sort((a, b) => {
    if (a.pattern.length !== b.pattern.length) {
      return b.pattern.length - a.pattern.length
    }
    return b.priority - a.priority
  })
}

export function classifyPath(
  pathValue: string,
  rules: ClassificationRule[] = buildRules(['C'])
): ClassificationResult {
  const normalized = normalizedForCompare(pathValue)
  for (const rule of sortRules(rules)) {
    if (matches(normalized, rule)) {
      return { owner: rule.owner, ruleId: rule.id }
    }
  }

  return { owner: 'unknown', ruleId: 'default-unknown' }
}
