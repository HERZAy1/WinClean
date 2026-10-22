# T05 文件扫描器与进度

**前置**：T04

## 目标
可取消的全盘扫描，结果写入 SQLite，并按"已扫描字节 / 磁盘已用总量"上报进度。

## 要做
1. `src/main/scan/worker.ts`（`worker_threads`）：
   - 迭代式遍历（显式栈，不用深递归），用 `fs.promises.opendir` + `lstat`。
   - 对路径加 `\\?\` 长路径前缀处理（内部统一规范化函数 `normalizePath`，输出到库里的路径不带前缀）。
   - **不跟随**符号链接/junction/重解析点（`lstat().isSymbolicLink()`，并识别 junction），遇到时记录一条 `scan_errors`（code=`REPARSE_SKIPPED`）并跳过。
   - 遇到 `EPERM/EACCES/EBUSY/ENOENT` 记入 `scan_errors` 并继续。
   - 跳过 `pagefile.sys / hiberfil.sys / swapfile.sys` 的深入读取（仍记录其大小）。
2. 批量写入：每 2000 条或 200ms 一批，放进一个事务；主线程负责 SQLite 写入或 worker 自带连接均可，但同一时刻只能一个写者。
3. 目录大小汇总：遍历结束后，在 SQL 中从最深层向上累加 `sizeBytes`（或扫描时用栈累加）；保证"目录 size = 子项 size 之和"。
4. 进度：`scannedBytes` 累加文件 `size`（`stat.size`；稀疏/压缩文件接受误差），`percent = min(1, scannedBytes / totalUsedBytes)`，且**单调不减**；事件节流到每 150ms 一次，推送 `event:progress`（stage=`scanning`）。扫描结束强制发 `percent=1, stage` 切换。
5. `scan:start`：创建 `scans` 记录，返回 `scanId`；本任务仅完成"扫描阶段"，后续阶段由 T06~T09 接入同一流水线（预留 `Pipeline` 类，按阶段顺序执行并统一取消）。
6. `scan:cancel`：终止 worker，把 scan 标记为取消，已写入数据保留。
7. 顶部栏接上进度条与"开始扫描/取消"按钮，显示当前路径、已扫文件数、错误数。

## 验收
- 单测：用临时目录构造含深层嵌套、空目录、符号链接、无权限目录（可 mock）的结构，扫描后：文件数、目录汇总大小与 `du` 式手算一致；符号链接未被跟随。
- 单测：进度单调不减，最终 percent=1。
- 取消后 2 秒内 worker 退出。
- 在真实 C 盘上手动运行，应用不卡死，内存稳定（记录峰值内存到回复里）。
- typecheck / test / lint 通过。

## 不要做
分类、归属、LLM。性能优化（MFT）留到之后单独评估。
