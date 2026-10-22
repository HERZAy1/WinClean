# T14 打包与全流程回归

**前置**：T00~T13 全部 ✅

## 要做
1. electron-builder 配置：Windows NSIS 安装包（x64），`requestedExecutionLevel: requireAdministrator`，应用名、图标占位、版本号、`asarUnpack` 包含 better-sqlite3 原生模块（并确保 `electron-rebuild` 流程可复现）。
2. 生产构建检查：关闭 DevTools、CSP 设置（`default-src 'self'`；connect 仅主进程发起，渲染进程不直接联网）、禁用远程模块、`will-navigate`/`setWindowOpenHandler` 拦截外部跳转。
3. 日志：`userData/logs/app.log`，按日滚动，保留 7 天，确认不含 API Key 与完整用户名路径。
4. 全流程回归脚本与清单（`docs/QA.md`）：
   - 首次启动 → 设置 OpenAI/Claude → 测试连接成功 → 勾选隐私授权；
   - 选盘 → 扫描（进度条走完）→ 规则归属 → LLM 分析（思考进度可见）；
   - 页面一：展开软件节点、查看注册表、未归属 AI 简述；
   - 页面二：三段拆分、预览清理、执行清理、回收站恢复；
   - 取消扫描/取消分析；断网/401/429 的提示；深浅色切换；
   - 非管理员警告（用 `--no-elevate` 开关仅在开发构建中启用）。
5. 性能基线记录（写入 `docs/QA.md`）：全盘扫描耗时、峰值内存、文件数、数据库大小、UI 展开耗时。
6. README：功能说明、权限与隐私说明（发送了什么、没发送什么）、构建步骤、已知限制。
7. 在干净的 Windows 虚拟机上安装并跑通 QA 清单，记录结果。

## 验收
- 产出 `dist/*.exe` 安装包；QA 清单逐项打勾并附问题列表。
- typecheck / test / lint / build 全绿。
