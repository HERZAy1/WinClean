# T11 软件占用三段拆分

**前置**：T09

## 目标
对每个已归属软件，把占用拆为：软件本体 / 必要缓存 / 非必要缓存。**先规则、后 LLM 复核。**

## 定义
- **body 本体**：安装目录下的程序文件、运行所必需的资源，删除会导致软件无法启动或损坏。
- **essentialCache 必要缓存**：删除后软件不会崩，但会丢失登录态、用户设置、离线数据、数据库、索引、模型等，影响使用体验或需要重新下载/登录。
- **disposableCache 非必要缓存**：可再生的临时数据，如 `Cache`、`Code Cache`、`GPUCache`、`ShaderCache`、`Temp`、`logs`、`crashpad`/`CrashDumps`、下载残留安装包，删除后会自动重建。

## 要做
1. 规则库 `src/main/breakdown/rules.ts`：目录/文件名模式 → 分类 + riskLevel + 理由，至少 40 条，覆盖 Electron/Chromium 系（Cache、Code Cache、GPUCache、DawnCache、Service Worker/CacheStorage、blob_storage）、浏览器、JetBrains/VSCode、微信/QQ/钉钉（聊天记录属于 essential 且高风险）、Office、Adobe、Steam、游戏平台（shadercache、downloading）、Python/Node/Gradle/Maven/NuGet 包缓存（`pip cache`、`npm-cache`、`.gradle\caches`）、Windows 更新下载等。**用户数据（聊天记录、文档、存档、数据库）一律不得归为 disposable。**
2. 对 `body` 采取"默认"：App 的 `installLocation` 下未命中缓存规则者 = body；AppData 下未命中规则者 = `essentialCache`（保守）。
3. **LLM 复核**（经 T09 的队列与进度事件，stage=`breakdown`）：对规则未命中、体积大于 50MB 的目录，批量交给 LLM 判定 `{category, riskLevel, reason}`；zod 校验；LLM 给出 `disposableCache` 时，必须再通过 `docs/SAFETY.md` A 节的本地校验器（实现为 `isPathCleanable(path, appContext)`，T13 复用），否则降级为 `essentialCache`。
4. 汇总到 `SizeBreakdown`，保证 `bodyBytes + essentialCacheBytes + disposableCacheBytes === totalBytes`（含"未分类"并入 essential），并持久化到 `size_items`。
5. 实现 `apps:list`、`apps:getBreakdown`。
6. `isPathCleanable` 位于 `src/main/safety/guard.ts`，纯函数，附完整单测。

## 验收
- 规则单测 ≥ 60 个路径样例；任意用户数据路径（如 `...\WeChat Files\...\Msg`、`...\Documents\...`）不可能被判为 disposable（专门的反例测试集 ≥ 15）。
- 汇总恒等式单测。
- `isPathCleanable` 覆盖 SAFETY.md A3、A5 的每一条硬拦截（含大小写、`..`、`\\?\`、junction 路径）。
- typecheck / test / lint 通过。
