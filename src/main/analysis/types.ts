import type { RiskLevel, UnownedExplain } from '../../shared/types'

export type AnalysisKind = 'ownership' | 'unowned'

export interface AnalysisItem {
  kind: AnalysisKind
  sourcePath: string
  path: string
  name: string
  sizeBytes: number
  childCount: number
  childNames: string[]
  extensions: Record<string, number>
  candidateApps: string[]
}

export interface OwnershipAnalysisResult {
  path: string
  appName: string | null
  confidence: number
  reason: string
}

export interface UnownedAnalysisResult {
  path: string
  kind: UnownedExplain['kind']
  summary: string
  riskLevel: RiskLevel
}
