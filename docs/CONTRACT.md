# CONTRACT.md — 数据模型与 IPC 契约（v1.0）

> 本文件与 `src/shared/types.ts` 必须保持一致。改契约先改本文件并说明原因。
> 所有 IPC 返回统一包装为 `Result<T>`。

## 1. 通用类型

```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export interface AppError {
  code:
    | 'NOT_ELEVATED' | 'PERMISSION_DENIED' | 'PATH_BLOCKED' | 'NOT_FOUND'
    | 'LLM_NOT_CONFIGURED' | 'LLM_AUTH_FAILED' | 'LLM_RATE_LIMITED'
    | 'LLM_UNAVAILABLE' | 'LLM_REQUEST_REJECTED' | 'LLM_TRUNCATED'
    | 'LLM_BAD_RESPONSE' | 'LLM_NETWORK' | 'CANCELLED' | 'INTERNAL';
  message: string;      // 面向用户的中文信息
  detail?: string;      // 技术细节（可选）：HTTP 状态码 + 上游 error.code/message/gateway_hint
}
```

## 2. 领域模型

```ts
export type Owner = 'system' | 'user' | 'unknown';   // 文件所属：Windows 系统 / 用户 / 未判定
export type SizeCategory = 'body' | 'essentialCache' | 'disposableCache';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface DriveInfo {
  letter: string;            // 'C'
  label: string;
  fsType: string;            // 'NTFS'
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

export interface FileNode {
  id: number;                // SQLite 自增
  scanId: number;
  path: string;              // 规范化绝对路径
  parentPath: string | null;
  name: string;
  isDir: boolean;
  sizeBytes: number;         // 目录为递归汇总值
  mtimeMs: number;
  owner: Owner;
  ownerReason?: string;      // 命中的分类规则 id
  appId: string | null;      // 归属软件，null = 未归属
}

export interface RegistryEntry {
  id: number;
  hive: 'HKLM' | 'HKCU';
  keyPath: string;           // 如 SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}
  valueName?: string;
  valueData?: string;
  appId: string | null;
}

export interface InstalledApp {
  id: string;                // 稳定ID：registry key 名 或 UWP PackageFullName 的哈希
  name: string;
  publisher?: string;
  version?: string;
  installLocation?: string;
  uninstallString?: string;
  source: 'registry' | 'uwp' | 'portable-guess';
  registryKeys: string[];
}

export interface Ownership {
  targetType: 'path' | 'registry';
  targetId: string;          // path 或 registry 条目 id
  appId: string | null;
  confidence: number;        // 0~1
  source: 'rule' | 'llm';
  reason: string;            // 一句话中文理由
}

export interface UnownedExplain {
  path: string;
  kind: 'orphan-uninstall-leftover' | 'system-component' | 'user-data' | 'temp-or-cache' | 'unknown-software' | 'other';
  summary: string;           // ≤ 60 字中文简述：是什么、干什么、是否残留
  riskLevel: RiskLevel;
  source: 'llm';
}

export interface CleanItem {
  path: string;
  sizeBytes: number;
  category: SizeCategory;
  riskLevel: RiskLevel;
  reason: string;
  source: 'rule' | 'llm';
}

export interface SizeBreakdown {
  appId: string;
  appName: string;
  publisher?: string;
  totalBytes: number;
  bodyBytes: number;
  essentialCacheBytes: number;
  disposableCacheBytes: number;
  items: CleanItem[];        // bodyBytes+essential+disposable === totalBytes
}

export interface CleanPlan {
  planId: string;
  createdAt: number;
  items: CleanItem[];
  estimatedFreeBytes: number;
  mode: 'recycle' | 'permanent';
  blockedCount?: number;
}

export interface CleanResult {
  planId: string;
  freedBytes: number;
  succeeded: string[];
  skipped: { path: string; reason: 'in-use' | 'blocked' | 'not-found' | 'error'; detail?: string }[];
}
```

## 3. 设置与 LLM

```ts
export type LlmProvider = 'openai' | 'anthropic' | 'deepseek';

export interface LlmProviderConfig {
  provider: LlmProvider;
  baseUrl: string;           // OpenAI: https://api.openai.com/v1；Claude: https://api.anthropic.com；DeepSeek 固定 https://api.deepseek.com
  modelId: string;           // 通过上游 /models 拉取后选择，或手动填写
  hasApiKey: boolean;        // 渲染进程只能知道是否已配置
}

export interface LlmUsage {
  tokensIn: number;
  tokensOut: number;
  requests: number;
  updatedAt: number;
}

export interface AppSettings {
  activeProvider: LlmProvider;
  providers: Record<LlmProvider, LlmProviderConfig>;
  llmUsage: Record<LlmProvider, LlmUsage>;   // 累计 Token 用量，供设置页汇总
  privacyConsent: boolean;                   // 默认 true
  theme: 'light' | 'dark' | 'system';
  cleanMode: 'recycle' | 'permanent';
  scanDrives: string[];      // ['C','D']
}

export interface TestConnectionResult {
  provider: LlmProvider;
  modelId: string;
  latencyMs: number;
  replyPreview: string;      // 模型对测试消息的回复前 80 字
  tokensIn?: number;
  tokensOut?: number;
}
```

上游错误透传：`AppError.detail` 中携带 `HTTP <status> · <上游 error.code> · <上游 error.message> · <gateway_hint>`，渲染层原样展示。

## 4. 进度事件

```ts
export type Stage = 'idle' | 'scanning' | 'collecting-registry' | 'classifying' | 'rule-matching' | 'llm-analysis' | 'breakdown' | 'done' | 'cancelled' | 'error';

// 总进度条：percent = scannedBytes / totalUsedBytes（扫描阶段）。必须单调不减，上限 1。
// llm-analysis 阶段：percent = (已完成条目 + 失败条目) / 总条目，结束时必定为 1。
export interface ProgressEvent {
  stage: Stage;
  scannedBytes: number;
  totalUsedBytes: number;    // 所选盘符已用空间之和
  percent: number;           // 0~1
  currentPath?: string;
  filesScanned: number;
  message: string;
  batchTotal?: number;       // 仅 llm-analysis：总批次数
  completedBatches?: number; // 成功批次数
  failedBatches?: number;    // 失败批次数
  lastError?: string;        // 最近一次失败原因（含上游 detail）
  source?: 'scan' | 'analysis'; // 事件来源，渲染层据此路由
  finished?: boolean;        // 该阶段是否已结束（完成/取消/失败）
}

// LLM 思考进度（独立于总进度）
export interface LlmThinkingEvent {
  batchIndex: number;        // 从 1 开始
  batchTotal: number;
  status: 'queued' | 'thinking' | 'streaming' | 'done' | 'retrying' | 'failed';
  focus: string;             // 本批正在分析的对象，如“Chrome 缓存目录”
  streamedText?: string;     // 流式片段（用于“思考中”展示）
  tokensIn?: number;
  tokensOut?: number;
  error?: string;            // status=failed 或 retrying 时的原因摘要
}
```

## 5. IPC 通道

渲染进程通过 `window.api.<namespace>.<method>` 调用，与下表一一对应。

| 通道 | 入参 | 返回 `Result<…>` | 说明 |
|---|---|---|---|
| `app:isElevated` | - | `boolean` | 是否管理员 |
| `app:relaunchElevated` | - | `void` | 以管理员重启 |
| `settings:get` | - | `AppSettings` | |
| `settings:save` | `Partial<AppSettings>` | `AppSettings` | |
| `settings:setApiKey` | `{provider, apiKey}` | `void` | 主进程加密存储 |
| `settings:clearApiKey` | `{provider}` | `void` | |
| `llm:testConnection` | `{provider}` | `TestConnectionResult` | 用已保存配置发测试消息；失败时 `detail` 透传上游错误 |
| `llm:listModels` | `{provider, baseUrl?}` | `string[]` | 调用上游 `/models` 拉取模型列表 |
| `drives:list` | - | `DriveInfo[]` | |
| `scan:start` | `{drives: string[]}` | `{scanId: number}` | 开始完整流水线（扫描→注册表→分类→规则归属） |
| `scan:cancel` | - | `void` | |
| `scan:latest` | - | `{scanId: number} \| null` | 最近一次扫描 |
| `analysis:start` | `{scanId: number}` | `void` | 启动 LLM 补全与拆分；需 `privacyConsent` |
| `analysis:cancel` | - | `void` | |
| `tree:getRoots` | `{scanId}` | `AppTreeRoot[]` | 软件节点（含系统、未归属两个虚拟根） |
| `tree:getChildren` | `{scanId, nodeId}` | `TreeNode[]` | 懒加载子节点 |
| `unowned:list` | `{scanId, offset, limit}` | `{items: (FileNode & {explain?: UnownedExplain})[]; total: number}` | |
| `unowned:explain` | `{paths: string[]}` | `UnownedExplain[]` | 按需触发 LLM 简述 |
| `apps:list` | `{scanId}` | `SizeBreakdown[]`（按 totalBytes 降序） | |
| `apps:getBreakdown` | `{scanId, appId}` | `SizeBreakdown` | |
| `clean:preview` | `{scanId, appIds: string[], includeEssential?: boolean}` | `CleanPlan` | |
| `clean:execute` | `{planId, selectedPaths: string[]}` | `CleanResult` | 路径必须是计划子集 |
| `clean:log` | `{limit}` | `CleanLogEntry[]` | |
| `shell:showItemInFolder` | `{path: string}` | `void` | 在资源管理器中显示 |

事件（主进程 → 渲染进程，`window.api.on(channel, cb)`）：

| 事件 | 载荷 |
|---|---|
| `event:progress` | `ProgressEvent` |
| `event:llm-thinking` | `LlmThinkingEvent` |
| `event:scan-error-count` | `{count: number}` |

```ts
export interface AppTreeRoot {
  nodeId: string;            // 'app:<appId>' | 'virtual:system' | 'virtual:user' | 'virtual:unowned'
  label: string;
  kind: 'app' | 'system' | 'user' | 'unowned';
  totalBytes: number;
  childCount: number;
}

export interface TreeNode {
  nodeId: string;
  label: string;
  kind: 'dir' | 'file' | 'registry' | 'group';
  sizeBytes: number;
  path?: string;
  childCount: number;
  confidence?: number;
  reason?: string;
}

export interface CleanLogEntry {
  ts: number; planId: string; path: string; sizeBytes: number;
  result: 'trashed' | 'deleted' | 'skipped'; detail?: string;
}
```

## 6. SQLite 表（初版）

`scans(id, startedAt, finishedAt, drives, totalUsedBytes)` ·
`files(id, scanId, path UNIQUE per scan, parentPath, name, isDir, sizeBytes, mtimeMs, owner, ownerReason, appId)` + 索引 `(scanId,parentPath)`、`(scanId,appId)` ·
`registry_entries(...)` · `apps(...)` · `ownerships(...)` ·
`llm_cache(key TEXT PRIMARY KEY, response TEXT, createdAt)` ·
`unowned_explain(path, scanId, json)` · `size_items(scanId, appId, ...CleanItem)` ·
`scan_errors(scanId, path, code, message)` · `clean_log(...)` · `clean_plans(planId, json, createdAt)`
