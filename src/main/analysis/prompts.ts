import { z } from 'zod'
import type { AnalysisItem } from './types'

export const ownershipResultSchema = z.array(
  z.object({
    path: z.string(),
    appName: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(40)
  })
)

export const unownedResultSchema = z.array(
  z.object({
    path: z.string(),
    kind: z.enum([
      'orphan-uninstall-leftover',
      'system-component',
      'user-data',
      'temp-or-cache',
      'unknown-software',
      'other'
    ]),
    summary: z.string().max(60),
    riskLevel: z.enum(['low', 'medium', 'high'])
  })
)

export const OWNERSHIP_SYSTEM_PROMPT = [
  '你是 Windows 软件占用分析助手。',
  '根据提供的路径元数据，判断每个目录最可能属于哪个已安装软件。',
  '只输出 JSON 数组，不要输出解释或 Markdown 围栏。',
  '每项格式：{"path":"...","appName":"候选软件名或null","confidence":0到1,"reason":"不超过40字"}。',
  'appName 必须来自 candidateApps；不确定就返回 null，不要编造。',
  '不要请求或假设任何文件内容。'
].join('\n')

export const UNOWNED_SYSTEM_PROMPT = [
  '你是 Windows 磁盘清理分析助手。',
  '根据路径元数据判断未归属目录是什么、做什么、是否像卸载残留。',
  '只输出 JSON 数组，不要输出解释或 Markdown 围栏。',
  '每项格式：{"path":"...","kind":"orphan-uninstall-leftover|system-component|user-data|temp-or-cache|unknown-software|other","summary":"不超过60字","riskLevel":"low|medium|high"}。',
  '不要请求或假设任何文件内容。'
].join('\n')

export function buildMessages(kind: 'ownership' | 'unowned', items: AnalysisItem[]): string {
  return JSON.stringify(
    {
      task: kind === 'ownership' ? 'ownership' : 'unowned-explain',
      items: items.map((item) => ({
        kind: item.kind,
        path: item.path,
        name: item.name,
        sizeBytes: item.sizeBytes,
        childCount: item.childCount,
        childNames: item.childNames,
        extensions: item.extensions,
        candidateApps: item.candidateApps
      }))
    },
    null,
    2
  )
}
