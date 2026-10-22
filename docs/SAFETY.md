# SAFETY.md — 删除与隐私红线（不得违反）

## A. 删除安全
1. **只能删除"清理计划"里的项**：`clean:execute` 只接受 `clean:preview` 生成的 `planId`，主进程自行从计划表取路径，不接受渲染进程直接传入路径。
2. **默认进回收站**（`shell.trashItem`）。"永久删除"需要设置里显式开启，且二次确认。
3. **硬拦截目录（任何情况拒绝）**，比较前先规范化路径（`path.resolve`、统一盘符大小写、处理 `\\?\` 前缀、解析 `..`）：
   - `X:\Windows`（含 System32、SysWOW64、WinSxS、Boot、servicing、Installer）
   - `X:\$Recycle.Bin`、`X:\System Volume Information`、`X:\Recovery`、`X:\Boot`、`X:\EFI`
   - `pagefile.sys`、`hiberfil.sys`、`swapfile.sys`
   - 用户个人库根目录本身及其内容：`Documents`、`Desktop`、`Pictures`、`Videos`、`Music`、`Downloads`（仅整目录拦截；这些目录下不得出现在任何清理计划）
   - 盘符根目录、`Program Files` / `Program Files (x86)` / `ProgramData` / `Users` / `AppData` 目录本身（只允许删其下具体的缓存子目录）
4. **不跟随重解析点**（符号链接、junction）：遇到则跳过并记录。
5. **范围校验**：待删路径必须落在对应软件已登记的位置内（安装目录、`%LOCALAPPDATA%\<软件>`、`%APPDATA%\<软件>`、`%PROGRAMDATA%\<软件>`、`%TEMP%` 下属于该软件的子目录）。
6. **分类约束**：
   - `body`（软件本体）：永不进入清理计划。
   - `essentialCache`（必要缓存）：默认不勾选，需要用户手动勾选并看到风险提示。
   - `disposableCache`（非必要缓存）：默认勾选，但必须同时满足：规则校验通过 + `riskLevel !== 'high'`。
7. **LLM 结论不可直接作为删除依据**：LLM 判定为可清理的项，必须再通过 A3、A5 的本地校验才可进入计划；校验失败直接降级为 `essentialCache` 或剔除。
8. **被占用文件**：删除失败不重试强杀进程，记录为 `skipped: in-use`。
9. **操作日志**：每次清理写入 SQLite `clean_log` 表，含时间、路径、大小、结果、planId。
10. **预览必须显示**：路径、大小、分类、风险、理由、预计释放总量。

## B. 隐私
1. 发送给 LLM 的只有：路径、文件/目录名、大小、扩展名、已识别的软件名与发布者。**绝不发送文件内容。**
2. 路径中的用户名替换为 `%USERNAME%` 后再发送。
3. 首次分析前弹窗说明将向所选 API 提供商发送上述信息，用户同意后才可开始；同意状态可在设置里撤销。
4. API Key 仅在主进程使用，用 Electron `safeStorage` 加密存储；渲染进程只能得知"是否已配置"，永远拿不到明文；日志中不得打印 Key。

## C. 稳健性
1. 所有扫描与分析可取消。
2. 单个文件的权限错误、占用错误不得中断整体扫描，记录到 `scan_errors` 表。
3. LLM 返回必须经 JSON schema 校验，不合法则重试一次，再失败则标记 `analysis_failed` 并继续。
