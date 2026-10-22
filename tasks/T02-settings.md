# T02 设置页与 API Key 加密存储

**前置**：T01

## 目标
实现设置页与主进程设置存储；OpenAI 与 Claude 两套配置；Key 加密存储。

## 要做
1. 主进程 `SettingsService`：设置存 `userData/settings.json`（不含 Key）；Key 用 `safeStorage.encryptString` 加密后存 `userData/secrets.bin`（或 JSON 中的 base64 密文），读取只在主进程内。若 `safeStorage.isEncryptionAvailable()` 为 false，则拒绝保存并返回明确错误。
2. 实现 IPC：`settings:get`、`settings:save`、`settings:setApiKey`、`settings:clearApiKey`，返回值严格符合契约；`settings:get` 只返回 `hasApiKey`，不含密钥。
3. 设置页 UI（两张 Card）：
   - **OpenAI**：Base URL（默认 `https://api.openai.com/v1`）、模型 ID（文本框，无预设）、API Key（密码框，已保存时显示"已配置·重新输入可覆盖"和"清除"按钮）。
   - **Claude (Anthropic)**：Base URL（默认 `https://api.anthropic.com`）、模型 ID、API Key。
   - 顶部单选：当前使用的服务商。
   - 每张卡下方预留"测试连接"按钮和结果区（按钮先 disabled，T03 接通）。
4. 隐私授权开关（`privacyConsent`）：文案按 `docs/SAFETY.md` B 节，说明会发送哪些信息、不会发送什么。默认关。
5. 主题选项、清理模式（回收站/永久删除，默认回收站，永久删除需弹确认）、扫描盘符选择（根据 `drives:list`，该接口未实现时先用占位）。
6. T01 中的 localStorage 降级改为走 `settings:*`。

## 验收
- 重启应用后设置保留；`secrets.bin` 内容不含明文 Key（单测：保存后读文件，断言不包含 Key 子串）。
- 渲染进程任何 IPC 返回里都找不到 Key（单测断言）。
- typecheck / test / lint 通过。
