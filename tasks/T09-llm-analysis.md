# T09 LLM 归属补全与未归属分析

**前置**：T03、T08

## 目标
把规则未能确定的部分交给 LLM，补全归属；并为未归属项生成简短分析。全程输出"思考进度"。

## 要做
1. **前置条件检查**（`analysis:start`）：`privacyConsent=true`，当前服务商已配置且最近一次连接测试成功，否则返回对应错误码。
2. **待处理集合构建**：来自 T08 的歧义项 + 未归属 TOP N 目录（按大小，默认累计覆盖未归属字节的 90% 或最多 300 个目录）。**按目录聚合**，不逐文件。每个条目只带：脱敏路径（用户名→`%USERNAME%`）、名称、大小、子项数量与前 10 个子项名、扩展名分布，以及可能相关的候选 App 名（最多 5 个）。**禁止带文件内容。**
3. **分批**：每批约 20 个条目；`LlmQueue` 并发 2；每批结果写入 `llm_cache`（key = 条目指纹哈希），重复分析直接命中缓存。
4. **提示词**（放 `src/main/llm/prompts.ts`，中文，要求只输出 JSON）：
   - 归属任务输出 `[{path, appName|null, confidence(0-1), reason(≤40字)}]`，并要求"不确定就返回 null，不要编造"。
   - 未归属分析输出 `UnownedExplain[]`：`kind`、`summary`（≤60字，说明是什么/干什么/是否像卸载残留）、`riskLevel`。
   - 用 zod 校验；`appName` 必须能在候选 App 名或已安装 App 列表中匹配上，否则视为 null。
5. **思考进度**：每批开始/流式片段/完成/重试/失败都推送 `event:llm-thinking`（`batchIndex/batchTotal/status/focus/streamedText/tokens`）。`streamedText` 节流 100ms。总进度条在 LLM 阶段用 `已完成批次 / 总批次` 换算（stage=`llm-analysis`，`percent` 为该阶段内进度，并在 `message` 中写明"AI 分析 x/y"）。
6. 写回：LLM 归属以 `source='llm'` 写入 `ownerships`，confidence 乘 0.9 的折损；`UnownedExplain` 存入 `unowned_explain` 表；`unowned:explain`（按需）对指定路径立即分析。
7. 取消：`analysis:cancel` 立即中止在途请求；已完成批次保留。
8. 失败处理：单批失败重试 1 次，仍失败则标记并继续后续批次，结束时汇报失败批次数。

## 验收
- 用 mock LLM 客户端做集成测试：正常、某批 JSON 非法、某批 429、中途取消、缓存命中（第二次不再调用 LLM）。
- 单测断言：发送给 LLM 的 payload 中不含用户名、不含文件内容字段（对 payload 序列化后 grep 用户名）。
- 事件序列单测：`thinking → streaming → done` 顺序正确，`batchIndex` 递增。
- typecheck / test / lint 通过。
