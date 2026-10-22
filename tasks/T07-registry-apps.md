# T07 注册表与已安装软件采集

**前置**：T04

## 目标
采集已安装软件清单及其相关注册表项。

## 要做
1. 用 `runPs` 执行 PowerShell 读取，**只读**，禁止任何写注册表操作：
   - `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*`
   - `HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*`
   - `HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*`
   - 取 `DisplayName, Publisher, DisplayVersion, InstallLocation, UninstallString, DisplayIcon, EstimatedSize, PSChildName`；无 `DisplayName` 或 `SystemComponent=1` 的条目单独标记 `hidden`。
   - UWP/商店应用：`Get-AppxPackage -AllUsers | Select Name,PackageFullName,InstallLocation,Publisher`（管理员权限下可全用户）。
2. 辅助线索采集（只用于归属判断，作为 `InstalledApp` 的附加字段或独立表）：
   - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\*`（exe 路径）
   - `HKLM\SOFTWARE\<Publisher>`、`HKCU\SOFTWARE\<Publisher>` 一级键名（用于"软件厂商 → 注册表项"匹配）
   - 服务：`Get-CimInstance Win32_Service | Select Name,PathName`（仅取 PathName 中的程序目录）
   - 开始菜单快捷方式目标（可选，视复杂度可放遗留）
3. 归一化：从 `InstallLocation`/`DisplayIcon`/`UninstallString` 推断安装目录（去引号、去参数、取目录）；生成稳定 `appId`；去重（同一软件 32/64 位重复）。
4. 写入 `apps` 与 `registry_entries` 表，`appId` 对应 `InstalledApp.id`；流水线阶段 `collecting-registry`。
5. PowerShell 输出解析要健壮：单个对象 vs 数组、空结果、含非 ASCII 字符、含引号的路径。

## 验收
- 用固定的 JSON 样例做解析与归一化单测（至少 15 条，含引号路径、`MsiExec.exe /X{GUID}`、无 InstallLocation、32/64 位重复、UWP）。
- Windows 上手动运行，输出 `apps:list` 数量并抽样 5 条贴在回复里。
- 确认代码中没有任何 `Set-ItemProperty / Remove-Item / reg add / reg delete`（`grep` 结果贴出）。
- typecheck / test / lint 通过。
