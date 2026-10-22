# T03 LLM 适配层与连接测试

**前置**：T02

## 目标
统一封装 OpenAI 与 Anthropic，支持流式、重试、JSON 结构化输出，并实现"测试连接"。

## 要做
1. `src/main/llm/` 下：
   - `types.ts`：`LlmClient` 接口：`complete(req)`、`stream(req, onDelta)`，`req` 含 `system`、`messages`、`maxTokens`、`temperature`、`signal`。
   - `openai.ts`：调用 `POST {baseUrl}/chat/completions`，Header `Authorization: Bearer`，用 `fetch`（Node 18+），支持 `stream: true` 的 SSE 解析。
   - `anthropic.ts`：调用 `POST {baseUrl}/v1/messages`，Header `x-api-key`、`anthropic-version: 2023-06-01`，支持 SSE 流式。注意：`baseUrl` 默认不含 `/v1`，由代码拼接；两家都要处理用户填写 Base URL 末尾带或不带 `/` 的情况。
   - `factory.ts`：根据设置与 Key 创建客户端，未配置抛 `LLM_NOT_CONFIGURED`。
2. 错误映射：401/403→`LLM_AUTH_FAILED`，429→`LLM_RATE_LIMITED`（带 `retry-after`），5xx/网络错误→`LLM_NETWORK`，响应无法解析→`LLM_BAD_RESPONSE`。
3. 重试：对 429 与 5xx 指数退避最多 3 次，可取消。
4. `completeJson<T>(client, req, validate)`：要求模型只输出 JSON，剥离 ```json 围栏，用 zod 校验；失败重试一次，再失败抛 `LLM_BAD_RESPONSE`。引入 zod。
5. 并发控制器 `LlmQueue`：限制同时请求数（默认 2，可配置），支持取消全部。
6. `llm:testConnection`：向当前选定服务商发送测试消息（如"请只回复：连接成功"），返回 `TestConnectionResult`（延迟、回复前 80 字）；失败返回对应错误码与中文信息。
7. 设置页接通"测试连接"按钮：点击后显示加载→成功（延迟、回复预览）或失败原因。未通过测试时，在设置页显示"尚未验证"状态徽标；`analysis:start` 将来要求"最近一次测试成功"。

## 验收
- 用 mock HTTP 服务（msw 或本地 http server）为两家各写测试：成功、401、429 重试、SSE 流式拼接、JSON 围栏剥离、校验失败重试。
- 日志与错误信息中不出现 API Key。
- typecheck / test / lint 通过。

## 不要做
真实调用付费 API 的测试；分析逻辑。
