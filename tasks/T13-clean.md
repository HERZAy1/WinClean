# T13 一键清理与安全拦截

**前置**：T11、T12　**这是高危任务，必须严格对照 `docs/SAFETY.md` 实现。**

## 目标
安全地清理"非必要缓存"（及用户手动勾选的必要缓存），可预览、可追溯、默认进回收站。

## 要做
1. `clean:preview`：为所选 App 生成 `CleanPlan`（默认只含 `disposableCache`；`includeEssential=true` 时含必要缓存但默认不勾选），**每个条目重新过 `isPathCleanable`**，不通过的剔除并在计划中标注数量；计划存入 `clean_plans`，生成不可猜测的 `planId`（`crypto.randomUUID`）。
2. `clean:execute`：只接受 `planId + selectedPaths`；
   - 主进程从 `clean_plans` 取计划，`selectedPaths` 必须是计划子集，否则 `PATH_BLOCKED`；
   - 执行前**再次**对每个路径做 `isPathCleanable` 与 `lstat` 检查（路径可能在预览后变化，如被替换为 junction）；
   - 默认 `shell.trashItem`；`permanent` 模式需设置开启，用 `fs.rm`（`recursive`，不跟随链接）；
   - 被占用/无权限 → `skipped`，不重试强杀进程；
   - 每个条目写 `clean_log`；
   - 返回 `CleanResult`，并重新计算相关软件的 `SizeBreakdown`。
3. 前端：
   - 预览对话框：分类分组、勾选框、总预计释放量、风险徽标、"必要缓存"区折叠且有红色警示文案；
   - 二次确认：显示条数与总量；永久删除模式需输入"确认删除"；
   - 执行中进度、完成后结果摘要（释放量、跳过项及原因）；
   - "清理记录"抽屉（`clean:log`）。
4. 一键清理入口（页面二底部）：对所有软件的 `disposableCache` 合并成一个计划，仍走预览与确认，不可跳过。
5. 安全测试套件（独立文件 `safety.test.ts`），必须包含：
   - 对 SAFETY.md A3 每个硬拦截目录各至少 2 个攻击路径（大小写混写、`..\` 穿越、`\\?\C:\Windows`、尾部点/空格、8.3 短名如 `PROGRA~1`）；
   - 用户个人库根目录及内容；
   - junction 指向系统目录的路径；
   - 伪造 `selectedPaths` 不在计划内；
   - 计划预览后目标被替换为链接的竞态场景；
   - LLM 声称 disposable 但命中硬拦截时被降级。
6. 无任何测试路径允许在真实系统目录上执行删除（测试只在临时目录内运行，Windows 专有行为用 mock）。

## 验收
- `safety.test.ts` 全部通过，贴出测试名清单。
- 在虚拟机/测试目录里手动演练：预览 → 取消 → 再预览 → 执行 → 回收站可恢复 → `clean_log` 有记录。
- 代码中 `shell.trashItem` / `fs.rm` 的调用点**只有一处封装函数**，`grep` 结果贴出。
- typecheck / test / lint 通过。
