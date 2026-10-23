# QA 验收清单

日期：2026-10-23　版本：0.1.0

## 自动化与构建

- [x] `npm run typecheck` 通过
- [x] `npm test` 通过（当前 312 项）
- [x] `npm run lint` 通过
- [x] `npm run build` 通过
- [x] 设置页单一「模型配置」区块、DeepSeek 预设、模型列表拉取、Token 用量、上游错误透传均有单元测试覆盖
- [x] `electron-builder` 配置存在，NSIS x64 + `requireAdministrator`
- [x] 已产出 `dist/WinClean-0.1.0-Setup.exe`（约 123MB）
- [x] `shell.trashItem` / `fs.rm` 仅在 `src/main/clean/delete.ts` 出现
- [x] TSX 无硬编码颜色、无硬编码中文（除 `tokens.css`）

## 手动回归（需普通 Windows 桌面/虚拟机）

- [ ] 首次启动 → 设置页单一「模型配置」区块 → 选择 OpenAI / Claude / DeepSeek
- [ ] DeepSeek 仅填 API Key，Base URL 锁定为 `https://api.deepseek.com`
- [ ] 点「获取模型列表」→ 下拉出现上游模型 → 选择模型 → 保存 → 测试连接成功
- [ ] 断开网络 / 401 / 429 / 503 → 界面展示「连接失败：…」并附上游原始错误码与信息
- [ ] 测试连接或 AI 分析后，「Token 用量」区块累计次数与 in/out
- [ ] 隐私授权默认开启，关闭后重启仍保持关闭
- [ ] 选盘 → 扫描进度走完 → 规则归属 → LLM 分析思考进度可见
- [ ] 页面一：展开软件节点、查看注册表、未归属 AI 简述
- [ ] 页面二：三段拆分、预览清理、执行清理、回收站恢复
- [ ] 取消扫描 / 取消分析
- [ ] 深浅色切换与重启保持
- [ ] 非管理员橙色条与“以管理员重启”
- [ ] UWP 应用采集（当前 DSH Electron 子进程返回 0 条）
- [ ] 真实 C 盘全量扫描、内存峰值
- [ ] 在干净 Windows 虚拟机安装/卸载安装包
- [ ] 管理员权限清单与 UAC 行为

## 性能基线

| 场景 | 结果 | 环境 |
|---|---|---|
| 1M 行分类 SQL 更新 | 3.467s | 内存 SQLite，Node 24 |
| 100k 节点 tree roots | 40ms | 内存 SQLite |
| 100k 节点首次展开 | 12ms（100 + 1 个 +N 节点） | 内存 SQLite |
| subst X: 完整扫描 | 3 文件 / 4 目录 / 15B，root=15B、sub=12B、deep=7B、empty=0 | Windows 本机 |
| 真实 C 盘冒烟 | 2.5s 内扫描 49 文件、5 个错误后取消 | 未做全量 |

## 已知问题

1. 当前 DSH 的 Electron 子进程执行 `Get-AppxPackage` 返回 0 条；普通 PowerShell 返回 164 条，已实现回退逻辑。
2. LLM >50MB 未命中目录复核尚未接入实际调用。
3. 未执行真实回收站删除与恢复演练；自动化使用 mock remove 验证计划/子集/日志。
4. 未在 10 万节点真实 Electron 窗口中测量交互帧率，仅测后端查询。
5. 未执行真实付费 API 调用。
6. 模型服务 503（如网关 `no_healthy_account`）现在会原样透传错误码；若上游账号池限流，需等待解锁或改用 `cn:` 等其它模型别名。
