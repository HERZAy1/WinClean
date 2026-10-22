# WinClean · 磁盘管家

Windows 磁盘空间管理桌面应用：扫描磁盘、按软件归属文件、拆分本体/必要缓存/非必要缓存，并在本地安全校验后清理。

## 功能

- 全盘扫描（worker_threads，可取消，跳过符号链接/junction）
- 系统 / 用户 / 未归属分类
- 注册表、UWP、服务、App Paths 采集
- 规则式软件归属（R1~R6，含歧义处理）
- OpenAI / Anthropic LLM 归属补全与未归属目录简述
- React Flow 文件关系树、懒加载、未归属虚拟列表
- 软件占用三段拆分、清理预览、回收站/永久删除、清理日志
- 深浅色主题、三页导航、`/dev/ui` 组件预览

## 权限与隐私

- 安装包请求管理员权限，以读取部分系统目录。
- 开发期可用 `--no-elevate` 模拟非管理员状态（仅未打包时生效）。
- 发送给 LLM 的只有：脱敏路径（用户名替换为 `%USERNAME%`）、名称、大小、扩展名分布、候选软件名。
- **绝不发送文件内容。**
- API Key 只在主进程使用 `safeStorage` 加密保存；渲染进程只能得到 `hasApiKey`。
- 清理默认进入回收站；永久删除需要设置显式开启并在预览中确认。

## 开发

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
```

> 当前 DSH 容器环境启动 Electron 需要 `npm run dev -- --noSandbox`；普通桌面请使用标准 `npm run dev`。

## 打包

```bash
npm run package
```

产物输出到 `dist/`，NSIS 安装包为 `WinClean-<version>-Setup.exe`。
`better-sqlite3` 13 使用 N-API 预编译产物，通常无需重编译；如需重编译可运行：

```bash
npm run rebuild
```

## 目录

- `src/main`：Electron 主进程、扫描 worker、SQLite、规则、LLM、清理
- `src/preload`：contextBridge API
- `src/renderer`：React 页面、组件、主题与样式
- `src/shared`：契约类型与 IPC 通道
- `docs/CONTRACT.md`：数据模型与 IPC 契约
- `docs/SAFETY.md`：删除与隐私红线
- `docs/QA.md`：验收清单与性能基线

## 已知限制

- 当前自动化未覆盖真实付费 LLM API、真实 C 盘全量扫描、真实回收站恢复；需在普通 Windows 桌面/虚拟机复验。
- 当前 DSH 的 Electron 子进程执行 `Get-AppxPackage` 返回 0 条，UWP 采集需在普通桌面复验。
- LLM 对 >50MB 未命中目录的复核尚未接入实际调用，当前使用规则分类 + 本地安全降级。
