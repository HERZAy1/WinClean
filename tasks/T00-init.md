# T00 工程初始化与契约落地

**前置**：无　**预计改动**：新建工程

## 目标
搭好 Electron + React + TypeScript + Vite 骨架，把 `docs/CONTRACT.md` 里的类型落地为代码，建立 IPC 骨架。

## 要做
1. 初始化工程，目录：`src/main`、`src/preload`、`src/renderer`、`src/shared`、`docs`、`tasks`。将本套件的 `AGENT_RULES.md`、`PROGRESS.md`、`docs/`、`tasks/` 放入仓库根目录。
2. 依赖：electron、react、react-dom、typescript、vite（建议 electron-vite 或 vite-plugin-electron）、zustand、better-sqlite3、vitest、eslint、prettier。
3. `tsconfig` 开启 `strict`。npm 脚本：`dev`、`build`、`typecheck`、`test`、`lint`。
4. 把 CONTRACT.md 第 1~5 节的全部类型原样写入 `src/shared/types.ts`；把通道名写成常量 `src/shared/channels.ts`。
5. preload 用 `contextBridge` 暴露 `window.api`，按命名空间（app/settings/llm/drives/scan/analysis/tree/unowned/apps/clean）声明方法；暂时全部返回 `{ok:false,error:{code:'INTERNAL',message:'未实现'}}`；并提供 `on(channel, cb)` 事件订阅（返回取消订阅函数）。
6. 主进程开启 `contextIsolation: true`、`nodeIntegration: false`、`sandbox` 能用则开。
7. 初始化 SQLite 封装 `src/main/db/index.ts`：打开 `userData/app.db`，建 CONTRACT 第 6 节的表（字段按第 2 节类型设计），启用 WAL。
8. 渲染进程只显示一行"磁盘管家"文字。
9. 写一个 Vitest 单测：校验 `channels.ts` 中的通道名与 CONTRACT.md 表格一致（解析 md 表格或硬编码对照均可）。

## 验收
- `npm run dev` 启动，窗口显示文字。
- `npm run typecheck && npm test && npm run lint` 全部通过。
- 渲染进程里 `window.api.settings.get()` 返回"未实现"错误且类型正确。

## 不要做
业务逻辑、样式、扫描、LLM。
