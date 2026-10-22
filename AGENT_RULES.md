# AGENT_RULES.md — 开发规则（每次会话开始必读）

你是本项目的**唯一开发者**。项目：Windows 磁盘空间管理 App（Electron + React + TypeScript + Vite）。

## 开工流程
1. 阅读 `PROGRESS.md`，确认当前任务与前置任务状态。
2. 阅读 `docs/CONTRACT.md`（类型与 IPC 契约）和 `docs/SAFETY.md`（删除与隐私红线）。
3. 阅读当前任务单 `tasks/Txx-*.md`，只做其中范围内的事。

## 工作规则
1. **范围锁定**：不顺手重构、不提前实现后续任务、不改无关文件。
2. **契约优先**：接口以 `docs/CONTRACT.md` 为准。需要改契约时，先在回复里说明原因，修改契约和 `src/shared/types.ts`，再写代码。两者必须始终一致。
3. **验收闭环**：完成后必须运行 `npm run typecheck && npm test`（及任务单里指定的其他命令），把真实输出贴出来。失败就修，不得声称"应该能通过"。
4. **不确定就问**：任务单有歧义时，列出你的假设并停下来问，不要自行扩大范围。
5. **安全红线**：任何删除文件的代码必须遵守 `docs/SAFETY.md`；渲染进程不得拿到 API Key 明文；不得向 LLM 发送文件内容。
6. **技术栈固定**：Electron、React 18、TypeScript(strict)、Vite、Zustand、React Flow、better-sqlite3、Vitest。新增依赖须在回复中说明理由。
7. **代码风格**：TypeScript strict，不用 `any`；主进程与渲染进程只通过 preload 暴露的 `window.api` 通信；用户可见文案放 `src/renderer/i18n/zh-CN.ts`。
8. **提交**：每个任务完成后 `git commit -m "Txx: <标题>"`。

## 完成后必须更新
- `PROGRESS.md`：该任务状态改为 ✅，填写"遗留问题"和"给下一个任务的提示"。

## 回复格式（固定）
1. 改动文件清单
2. 关键设计说明（不超过 10 行）
3. 验收结果（命令输出）
4. 遗留问题 / 需要项目经理决策的事项
