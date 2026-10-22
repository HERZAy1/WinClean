import type {
  AppSettings,
  AppTreeRoot,
  CleanLogEntry,
  CleanPlan,
  CleanResult,
  DriveInfo,
  FileNode,
  LlmProvider,
  LlmThinkingEvent,
  ProgressEvent,
  Result,
  SizeBreakdown,
  TestConnectionResult,
  TreeNode,
  UnownedExplain
} from '../shared/types'

export interface UnownedListResult {
  items: (FileNode & { explain?: UnownedExplain })[]
  total: number
}

export interface EventPayloadMap {
  'event:progress': ProgressEvent
  'event:llm-thinking': LlmThinkingEvent
  'event:scan-error-count': { count: number }
}

export interface WinCleanApi {
  app: {
    isElevated(): Promise<Result<boolean>>
    relaunchElevated(): Promise<Result<void>>
  }
  settings: {
    get(): Promise<Result<AppSettings>>
    save(settings: Partial<AppSettings>): Promise<Result<AppSettings>>
    setApiKey(input: { provider: LlmProvider; apiKey: string }): Promise<Result<void>>
    clearApiKey(input: { provider: LlmProvider }): Promise<Result<void>>
  }
  llm: {
    testConnection(input: { provider: LlmProvider }): Promise<Result<TestConnectionResult>>
  }
  drives: {
    list(): Promise<Result<DriveInfo[]>>
  }
  scan: {
    start(input: { drives: string[] }): Promise<Result<{ scanId: number }>>
    cancel(): Promise<Result<void>>
  }
  analysis: {
    start(input: { scanId: number }): Promise<Result<void>>
    cancel(): Promise<Result<void>>
  }
  tree: {
    getRoots(input: { scanId: number }): Promise<Result<AppTreeRoot[]>>
    getChildren(input: { scanId: number; nodeId: string }): Promise<Result<TreeNode[]>>
  }
  unowned: {
    list(input: { scanId: number; offset: number; limit: number }): Promise<Result<UnownedListResult>>
    explain(input: { paths: string[] }): Promise<Result<UnownedExplain[]>>
  }
  apps: {
    list(input: { scanId: number }): Promise<Result<SizeBreakdown[]>>
    getBreakdown(input: { scanId: number; appId: string }): Promise<Result<SizeBreakdown>>
  }
  clean: {
    preview(input: {
      scanId: number
      appIds: string[]
      includeEssential?: boolean
    }): Promise<Result<CleanPlan>>
    execute(input: { planId: string; selectedPaths: string[] }): Promise<Result<CleanResult>>
    log(input: { limit: number }): Promise<Result<CleanLogEntry[]>>
  }
  on<K extends keyof EventPayloadMap>(
    channel: K,
    callback: (payload: EventPayloadMap[K]) => void
  ): () => void
}
