export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

export interface AppError {
  code:
    | 'NOT_ELEVATED'
    | 'PERMISSION_DENIED'
    | 'PATH_BLOCKED'
    | 'NOT_FOUND'
    | 'LLM_NOT_CONFIGURED'
    | 'LLM_AUTH_FAILED'
    | 'LLM_RATE_LIMITED'
    | 'LLM_UNAVAILABLE'
    | 'LLM_REQUEST_REJECTED'
    | 'LLM_TRUNCATED'
    | 'LLM_BAD_RESPONSE'
    | 'LLM_NETWORK'
    | 'CANCELLED'
    | 'INTERNAL'
  message: string // 面向用户的中文信息
  detail?: string // 技术细节（可选）
}

export type Owner = 'system' | 'user' | 'unknown' // 文件所属：Windows 系统 / 用户 / 未判定
export type SizeCategory = 'body' | 'essentialCache' | 'disposableCache'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface DriveInfo {
  letter: string // 'C'
  label: string
  fsType: string // 'NTFS'
  totalBytes: number
  usedBytes: number
  freeBytes: number
}

export interface FileNode {
  id: number // SQLite 自增
  scanId: number
  path: string // 规范化绝对路径
  parentPath: string | null
  name: string
  isDir: boolean
  sizeBytes: number // 目录为递归汇总值
  mtimeMs: number
  owner: Owner
  ownerReason?: string // 命中的分类规则 id
  appId: string | null // 归属软件，null = 未归属
}

export interface RegistryEntry {
  id: number
  hive: 'HKLM' | 'HKCU'
  keyPath: string // 如 SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}
  valueName?: string
  valueData?: string
  appId: string | null
}

export interface InstalledApp {
  id: string // 稳定ID：registry key 名 或 UWP PackageFullName 的哈希
  name: string
  publisher?: string
  version?: string
  installLocation?: string
  uninstallString?: string
  source: 'registry' | 'uwp' | 'portable-guess'
  registryKeys: string[]
}

export interface Ownership {
  targetType: 'path' | 'registry'
  targetId: string // path 或 registry 条目 id
  appId: string | null
  confidence: number // 0~1
  source: 'rule' | 'llm'
  reason: string // 一句话中文理由
}

export interface UnownedExplain {
  path: string
  kind:
    | 'orphan-uninstall-leftover'
    | 'system-component'
    | 'user-data'
    | 'temp-or-cache'
    | 'unknown-software'
    | 'other'
  summary: string // ≤ 60 字中文简述：是什么、干什么、是否残留
  riskLevel: RiskLevel
  source: 'llm'
}

export interface CleanItem {
  path: string
  sizeBytes: number
  category: SizeCategory
  riskLevel: RiskLevel
  reason: string
  source: 'rule' | 'llm'
}

export interface SizeBreakdown {
  appId: string
  appName: string
  publisher?: string
  totalBytes: number
  bodyBytes: number
  essentialCacheBytes: number
  disposableCacheBytes: number
  items: CleanItem[] // bodyBytes+essential+disposable === totalBytes
}

export interface CleanPlan {
  planId: string
  createdAt: number
  items: CleanItem[]
  estimatedFreeBytes: number
  mode: 'recycle' | 'permanent'
  blockedCount?: number
}

export interface CleanResult {
  planId: string
  freedBytes: number
  succeeded: string[]
  skipped: {
    path: string
    reason: 'in-use' | 'blocked' | 'not-found' | 'error'
    detail?: string
  }[]
}

export type LlmProvider = 'openai' | 'anthropic' | 'deepseek'

export interface LlmProviderConfig {
  provider: LlmProvider
  baseUrl: string // OpenAI: https://api.openai.com/v1；Claude: https://api.anthropic.com；DeepSeek 固定为官方地址
  modelId: string // 通过 /models 拉取后选择，或手动填写
  hasApiKey: boolean // 渲染进程只能知道是否已配置
}

export interface LlmUsage {
  tokensIn: number
  tokensOut: number
  requests: number
  updatedAt: number
}

export interface AppSettings {
  activeProvider: LlmProvider
  providers: Record<LlmProvider, LlmProviderConfig>
  llmUsage: Record<LlmProvider, LlmUsage>
  privacyConsent: boolean
  theme: 'light' | 'dark' | 'system'
  cleanMode: 'recycle' | 'permanent'
  scanDrives: string[] // ['C','D']
}

export interface TestConnectionResult {
  provider: LlmProvider
  modelId: string
  latencyMs: number
  replyPreview: string // 模型对测试消息的回复前 80 字
  tokensIn?: number
  tokensOut?: number
}

export type Stage =
  | 'idle'
  | 'scanning'
  | 'collecting-registry'
  | 'classifying'
  | 'rule-matching'
  | 'llm-analysis'
  | 'breakdown'
  | 'done'
  | 'cancelled'
  | 'error'

// 总进度条：percent = scannedBytes / totalUsedBytes（扫描阶段）。必须单调不减，上限 1。
export interface ProgressEvent {
  stage: Stage
  scannedBytes: number
  totalUsedBytes: number // 所选盘符已用空间之和
  percent: number // 0~1
  currentPath?: string
  filesScanned: number
  message: string
  // 仅 llm-analysis 阶段：批次统计，供 UI 展示进度与失败原因
  batchTotal?: number
  completedBatches?: number
  failedBatches?: number
  lastError?: string
}

// LLM 思考进度（独立于总进度）
export interface LlmThinkingEvent {
  batchIndex: number // 从 1 开始
  batchTotal: number
  status: 'queued' | 'thinking' | 'streaming' | 'done' | 'retrying' | 'failed'
  focus: string // 本批正在分析的对象，如“Chrome 缓存目录”
  streamedText?: string // 流式片段（用于“思考中”展示）
  tokensIn?: number
  tokensOut?: number
  error?: string // status=failed 时的原因摘要
}

export interface AppTreeRoot {
  nodeId: string // 'app:<appId>' | 'virtual:system' | 'virtual:user' | 'virtual:unowned'
  label: string
  kind: 'app' | 'system' | 'user' | 'unowned'
  totalBytes: number
  childCount: number
}

export interface TreeNode {
  nodeId: string
  label: string
  kind: 'dir' | 'file' | 'registry' | 'group'
  sizeBytes: number
  path?: string
  childCount: number
  confidence?: number
  reason?: string
}

export interface CleanLogEntry {
  ts: number
  planId: string
  path: string
  sizeBytes: number
  result: 'trashed' | 'deleted' | 'skipped'
  detail?: string
}
