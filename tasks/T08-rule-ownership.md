# T08 规则式归属引擎

**前置**：T06、T07

## 目标
用确定性规则把尽可能多的文件、目录、注册表项归属到软件，产出置信度，并留下"未归属"集合。**这一步要消灭绝大部分归属工作，LLM 只处理剩余疑难项。**

## 要做
1. 归属规则（按置信度从高到低，命中即停，写入 `ownerships`）：
   - R1 路径位于某 App 的 `installLocation` 之内 → confidence 0.98
   - R2 路径位于该 App 的 exe（App Paths / 服务 PathName）所在目录之内 → 0.95
   - R3 `%LOCALAPPDATA%|%APPDATA%|%PROGRAMDATA%\<名>`，且 `<名>` 与 App 名称或发布者规范化后匹配 → 0.85（规范化：小写、去空格/标点/版本号/`inc|ltd|corp|co`；允许编辑距离≤1 或包含关系，需有最短长度保护避免误配）
   - R4 `Users\<name>\AppData\LocalLow`、`Local\Packages\<PackageFamilyName>` 与 UWP 匹配 → 0.9
   - R5 `%TEMP%` 及其子目录名含软件名 → 0.6
   - R6 注册表项：位于 `SOFTWARE\<发布者或软件名>` 一级键下 → 0.8；Uninstall 项本身 → 1.0
2. 目录级归属向下传递：目录命中后，其下所有文件继承 `appId`（用 SQL 前缀更新，不逐文件匹配），除非子目录有更高置信度的不同归属。
3. 冲突处理：同一路径多条规则命中不同 App 时，取最高置信度；置信度相差 < 0.1 时标记为"歧义"，进入 LLM 待处理集合。
4. 系统文件（owner=system）不参与归属，直接归入"Windows 系统"虚拟根。
5. 输出统计：已归属字节占比、未归属字节占比、未归属 TOP 50 目录（按大小）。这些统计通过日志与 `event:progress` 的 message 暴露。
6. 流水线阶段 `rule-matching`；写入 `files.appId`。

## 验收
- 构造一个合成文件系统 + 合成 App 列表的夹具，至少 25 个用例，覆盖每条规则、冲突、歧义、名称规范化误配（如 `Adobe` vs `Adobe Acrobat` 两个 App）。
- 在真实机器上跑，贴出：已归属比例、未归属 TOP 10。
- typecheck / test / lint 通过。

## 不要做
LLM 调用、UI。
