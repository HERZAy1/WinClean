# PROGRESS.md — 项目进度

| 任务 | 标题 | 前置 | 状态 | 提交 |
|---|---|---|---|---|
| T00 | 工程初始化与契约落地 | - | ✅ 已验收 | f46fc1c |
| T01 | 主题系统与布局壳 | T00 | ✅ 已验收 | 42d885e |
| T02 | 设置页与 API Key 加密存储 | T01 | ✅ 已验收 | 7d46695 |
| T03 | LLM 适配层与连接测试 | T02 | ✅ 已验收 | d76eaa3 |
| T04 | 管理员提权与磁盘枚举 | T00 | ✅ 已验收 | |
| T05 | 文件扫描器与进度 | T04 | ⬜ | |
| T06 | 系统/用户文件分类 | T05 | ⬜ | |
| T07 | 注册表与已安装软件采集 | T04 | ⬜ | |
| T08 | 规则式归属引擎 | T06, T07 | ⬜ | |
| T09 | LLM 归属补全与未归属分析 | T03, T08 | ⬜ | |
| T10 | 页面一：文件关系树 + 未归属面板 | T09 | ⬜ | |
| T11 | 软件占用三段拆分 | T09 | ⬜ | |
| T12 | 页面二：软件占用分析 | T11 | ⬜ | |
| T13 | 一键清理与安全拦截 | T11, T12 | ⬜ | |
| T14 | 打包与全流程回归 | 全部 | ⬜ | |

状态图例：⬜ 未开始 / 🔄 进行中 / ✅ 已验收 / ❌ 被打回

## 任务记录

### 2026-10-23 · T00 工程初始化与契约落地
- 状态：✅ 已验收
- 遗留问题：无
- 给下一个任务的提示：可直接使用 `src/shared/types.ts`、`src/shared/channels.ts` 和 `window.api`；主进程 IPC 目前统一返回 `INTERNAL / 未实现`，实现业务时替换对应 handler。`better-sqlite3` 13 使用 N-API 预编译产物，无需针对 Electron ABI 重新编译。开发时若遇到 Chromium sandbox 启动失败，可临时使用 `npm run dev -- --noSandbox`，正常桌面环境不要关闭 sandbox。

### 2026-10-23 · T01 主题系统与布局壳
- 状态：✅ 已验收
- 遗留问题：开发模式仍有 Electron CSP 提示；主题目前同时写 localStorage 并尝试 `settings:save`，T02 接通设置持久化后应移除 localStorage 回退。
- 给下一个任务的提示：主题状态使用 `useThemeStore`，设计变量集中在 `src/renderer/styles/tokens.css`；布局壳、三页路由和 `/dev/ui` 组件预览已就绪。新增依赖 `react-router-dom`（路由要求）与 `happy-dom`（useTheme DOM 单测）。

### 2026-10-23 · T02 设置页与 API Key 加密存储
- 状态：✅ 已验收
- 遗留问题：测试连接按钮暂为 disabled，T03 接入；扫描盘符仍为占位，T04 接入。设置页的“最近一次连接测试成功”状态将由 T03 在主进程维护。
- 给下一个任务的提示：主进程设置入口为 `SettingsService`，API Key 通过 `safeStorage` 加密后写入 `secrets.bin`；渲染进程只能拿到 `hasApiKey`。主题已改为完全走 `settings:get/save`，localStorage 回退已移除。

### 2026-10-23 · T03 LLM 适配层与连接测试
- 状态：✅ 已验收
- 遗留问题：最近一次连接测试成功状态仅保存在主进程内存中，重启后需重新测试；T09 的 `analysis:start` 将依赖该状态。
- 给下一个任务的提示：`createLlmClient`、`completeJson`、`LlmQueue` 已可复用；OpenAI 默认 baseUrl 已含 `/v1`，Anthropic 默认不含 `/v1`，`joinUrl` 会处理末尾斜杠与重复 `/v1`。新增依赖 `zod` 用于结构化输出校验。

### 2026-10-23 · T04 管理员提权与磁盘枚举
- 状态：✅ 已验收
- 遗留问题：本机当前为非管理员，未实际点击“以管理员重启”触发 UAC；提权重启代码已实现，T14 再验证安装包 `requireAdministrator`。
- 给下一个任务的提示：通用 PowerShell 工具为 `src/main/win/powershell.ts` 的 `runPs`，后续扫描/注册表采集可复用。磁盘枚举已实测返回 C/D 两块 NTFS 盘，设置页盘符多选会写入 `scanDrives`。
