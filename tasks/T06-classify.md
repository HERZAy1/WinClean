# T06 系统文件与用户文件分类

**前置**：T05

## 目标
为每个 `FileNode` 标注 `owner`：`system` / `user` / `unknown`，规则表驱动，可解释。

## 要做
1. `src/main/classify/rules.ts`：规则表，每条含 `id`、`pattern`（规范化后的前缀或正则）、`owner`、`priority`、`description`。至少覆盖：
   - system：`X:\Windows\**`、`X:\$Recycle.Bin`、`X:\System Volume Information`、`X:\Recovery`、`X:\Boot`、`X:\EFI`、`X:\ProgramData\Microsoft\Windows\**`、`pagefile.sys`/`hiberfil.sys`/`swapfile.sys`、`X:\Windows.old`（单独标记 reason，提示可由系统清理）、`%LOCALAPPDATA%\Microsoft\Windows\**`。
   - user：`X:\Users\<name>\Documents|Desktop|Pictures|Videos|Music|Downloads|OneDrive`，以及用户目录下除 AppData 外的内容。
   - unknown：其余（例如 Program Files、AppData 下第三方目录，交给后续归属引擎）。
2. 分类函数 `classifyPath(path): {owner, ruleId}`：最长前缀优先，其次 priority；大小写不敏感；路径先 `normalizePath`。
3. 扫描后阶段 `classifying`：批量更新 `files.owner` 与 `ownerReason`（用单条 SQL 前缀更新而不是逐行，保证百万级文件在合理时间内完成）。
4. 当前用户名、盘符根通过环境变量与 `drives:list` 动态生成规则（不得硬编码 `C:`）。
5. `tree:getRoots` 先实现返回三个虚拟根：系统文件汇总、用户文件汇总、未判定（仅 size 汇总，子节点留给 T10）。

## 验收
- 规则表单测不少于 30 个路径用例（含大小写、盘符非 C、`Windows.old`、`Users\Public`、OneDrive 路径、边界：`C:\WindowsApps` 不应被 `C:\Windows` 前缀误匹配）。
- 一次对 100 万行 `files` 表的分类更新耗时记录在回复中（可用合成数据）。
- typecheck / test / lint 通过。
