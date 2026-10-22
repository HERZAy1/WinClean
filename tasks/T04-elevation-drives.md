# T04 管理员提权与磁盘枚举

**前置**：T00

## 目标
应用能获取管理员权限，并列出可扫描的磁盘及其容量。

## 要做
1. 提权策略：开发期不强制；打包配置里设置 `requestedExecutionLevel: requireAdministrator`（electron-builder `win.requestedExecutionLevel`），此项在 T14 验证。运行时仍需检测：
   - `app:isElevated`：在 Windows 上执行 `net session`（退出码 0 即管理员）或 `fsutil dirty query %SystemDrive%`，二选一并缓存结果。
   - `app:relaunchElevated`：用 `powershell Start-Process -Verb RunAs` 重启自身后退出当前进程。
2. 顶部栏：非管理员时显示醒目的橙色条"当前非管理员，部分目录将无法读取"，带"以管理员重启"按钮。
3. `drives:list`：枚举本地固定磁盘（排除光驱、网络盘、可移动盘，可移动盘做成可选），优先用 PowerShell `Get-CimInstance Win32_LogicalDisk | Where DriveType -eq 3 | ConvertTo-Json`，在 `[Console]::OutputEncoding=[Text.Encoding]::UTF8` 下执行；解析为 `DriveInfo[]`（total、free、used = total-free）。
4. 封装通用工具 `src/main/win/powershell.ts`：`runPs(script, {timeoutMs})`，统一 UTF-8、`-NoProfile -NonInteractive`、超时与错误处理，后续任务复用。
5. 设置页的"扫描盘符"多选接上 `drives:list`，显示每个盘的已用/总量条形条。
6. 非 Windows 平台（开发机可能是 mac/linux）：`drives:list` 返回一份 mock 数据并在日志中标明，保证 UI 可开发。

## 验收
- 对 PowerShell 输出解析做单测（给固定 JSON 样例：单盘时 PowerShell 输出是对象而非数组，必须覆盖）。
- Windows 上手动验证：普通启动出现橙色条，点击后以管理员重启橙色条消失。
- typecheck / test / lint 通过。
