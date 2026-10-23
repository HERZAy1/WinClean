import fs from 'node:fs'
import path from 'node:path'
import { LLM_PRESETS, LLM_PROVIDERS, isLlmProvider } from '../../shared/llm'
import type { AppSettings, LlmProvider, LlmProviderConfig, LlmUsage, Result } from '../../shared/types'
import { fail, ok } from '../ipc/result'
import type { SecretStore } from './secret-store'

function emptyUsage(): LlmUsage {
  return { tokensIn: 0, tokensOut: 0, requests: 0, updatedAt: 0 }
}

function defaultProvider(provider: LlmProvider): LlmProviderConfig {
  return {
    provider,
    baseUrl: LLM_PRESETS[provider].baseUrl,
    modelId: '',
    hasApiKey: false
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'openai',
  providers: {
    openai: defaultProvider('openai'),
    anthropic: defaultProvider('anthropic'),
    deepseek: defaultProvider('deepseek')
  },
  llmUsage: {
    openai: emptyUsage(),
    anthropic: emptyUsage(),
    deepseek: emptyUsage()
  },
  privacyConsent: true,
  theme: 'system',
  cleanMode: 'recycle',
  scanDrives: []
}

type SecretsFile = Partial<Record<LlmProvider, string>>
type SettingsPatch = Partial<AppSettings>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function providerConfig(
  raw: unknown,
  provider: LlmProvider,
  hasApiKey: boolean
): LlmProviderConfig {
  const value = isRecord(raw) ? raw : {}
  const preset = LLM_PRESETS[provider]

  return {
    provider,
    // DeepSeek 等固定接口地址的服务商忽略本地存储的 baseUrl，避免被改坏
    baseUrl: preset.baseUrlLocked ? preset.baseUrl : stringValue(value['baseUrl'], preset.baseUrl),
    modelId: stringValue(value['modelId'], ''),
    hasApiKey
  }
}

function usageValue(raw: unknown): LlmUsage {
  const value = isRecord(raw) ? raw : {}
  return {
    tokensIn: numberValue(value['tokensIn']),
    tokensOut: numberValue(value['tokensOut']),
    requests: numberValue(value['requests']),
    updatedAt: numberValue(value['updatedAt'])
  }
}

export class SettingsService {
  private readonly settingsPath: string
  private readonly secretsPath: string
  private settings: AppSettings
  private secrets: SecretsFile
  private readonly successfulTests = new Set<LlmProvider>()

  constructor(
    baseDir: string,
    private readonly secretStore: SecretStore
  ) {
    fs.mkdirSync(baseDir, { recursive: true })
    this.settingsPath = path.join(baseDir, 'settings.json')
    this.secretsPath = path.join(baseDir, 'secrets.bin')
    this.secrets = this.readSecrets()
    this.settings = this.readSettings()
    this.settings = this.withApiKeyFlags(this.settings)
  }

  getSettings(): AppSettings {
    return structuredClone(this.settings)
  }

  save(patch: SettingsPatch): Result<AppSettings> {
    const current = this.settings
    const providers = { ...current.providers }
    for (const provider of LLM_PROVIDERS) {
      providers[provider] = { ...current.providers[provider], ...(patch.providers?.[provider] ?? {}) }
    }

    const next = this.normalize({
      ...current,
      ...patch,
      providers,
      llmUsage: patch.llmUsage ?? current.llmUsage
    })

    this.settings = this.withApiKeyFlags(next)
    this.writeSettings()
    return ok(this.getSettings())
  }

  setApiKey(provider: LlmProvider, apiKey: string): Result<void> {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      return fail('INTERNAL', 'API Key 不能为空')
    }

    if (!this.secretStore.isAvailable()) {
      return fail('INTERNAL', '系统加密不可用，无法保存 API Key')
    }

    try {
      this.secrets = {
        ...this.secrets,
        [provider]: this.secretStore.encrypt(trimmed)
      }
      this.writeSecrets()
      this.settings = this.withApiKeyFlags(this.settings)
      this.writeSettings()
      return ok(undefined)
    } catch {
      return fail('INTERNAL', 'API Key 加密保存失败')
    }
  }

  clearApiKey(provider: LlmProvider): Result<void> {
    const nextSecrets = { ...this.secrets }
    delete nextSecrets[provider]
    this.secrets = nextSecrets
    this.writeSecrets()
    this.successfulTests.delete(provider)
    this.settings = this.withApiKeyFlags(this.settings)
    this.writeSettings()
    return ok(undefined)
  }

  getApiKey(provider: LlmProvider): string | null {
    const cipherText = this.secrets[provider]
    if (!cipherText) {
      return null
    }

    try {
      return this.secretStore.decrypt(cipherText)
    } catch {
      return null
    }
  }

  hasApiKey(provider: LlmProvider): boolean {
    return Boolean(this.secrets[provider])
  }

  // 累加一次真实调用的 Token 消耗，供设置页汇总展示
  recordUsage(provider: LlmProvider, usage: { tokensIn?: number; tokensOut?: number }): void {
    const current = this.settings.llmUsage[provider] ?? emptyUsage()
    const next: LlmUsage = {
      tokensIn: current.tokensIn + Math.max(0, usage.tokensIn ?? 0),
      tokensOut: current.tokensOut + Math.max(0, usage.tokensOut ?? 0),
      requests: current.requests + 1,
      updatedAt: Date.now()
    }

    this.settings = {
      ...this.settings,
      llmUsage: { ...this.settings.llmUsage, [provider]: next }
    }
    this.writeSettings()
  }

  markConnectionTestSuccess(provider: LlmProvider): void {
    this.successfulTests.add(provider)
  }

  hasSuccessfulConnectionTest(provider: LlmProvider): boolean {
    return this.successfulTests.has(provider)
  }

  private normalize(raw: unknown): AppSettings {
    const value = isRecord(raw) ? raw : {}
    const activeProvider = isLlmProvider(value['activeProvider']) ? value['activeProvider'] : 'openai'
    const theme =
      value['theme'] === 'light' || value['theme'] === 'dark' || value['theme'] === 'system'
        ? value['theme']
        : DEFAULT_SETTINGS.theme
    const cleanMode = value['cleanMode'] === 'permanent' ? 'permanent' : ('recycle' as const)
    const providersRaw = isRecord(value['providers']) ? value['providers'] : {}
    const usageRaw = isRecord(value['llmUsage']) ? value['llmUsage'] : {}
    const scanDrives = Array.isArray(value['scanDrives'])
      ? value['scanDrives'].filter((drive): drive is string => typeof drive === 'string')
      : []

    return {
      activeProvider,
      providers: {
        openai: providerConfig(providersRaw['openai'], 'openai', this.hasApiKey('openai')),
        anthropic: providerConfig(providersRaw['anthropic'], 'anthropic', this.hasApiKey('anthropic')),
        deepseek: providerConfig(providersRaw['deepseek'], 'deepseek', this.hasApiKey('deepseek'))
      },
      llmUsage: {
        openai: usageValue(usageRaw['openai']),
        anthropic: usageValue(usageRaw['anthropic']),
        deepseek: usageValue(usageRaw['deepseek'])
      },
      // 隐私授权默认开启；用户显式关闭后仍保持关闭
      privacyConsent: value['privacyConsent'] !== false,
      theme,
      cleanMode,
      scanDrives
    }
  }

  private withApiKeyFlags(settings: AppSettings): AppSettings {
    const providers = { ...settings.providers }
    for (const provider of LLM_PROVIDERS) {
      providers[provider] = { ...settings.providers[provider], hasApiKey: this.hasApiKey(provider) }
    }
    return { ...settings, providers }
  }

  private readSettings(): AppSettings {
    const raw = this.readJson(this.settingsPath)
    return this.normalize(raw)
  }

  private readSecrets(): SecretsFile {
    const raw = this.readJson(this.secretsPath)
    if (!isRecord(raw)) {
      return {}
    }

    const secrets: SecretsFile = {}
    for (const provider of LLM_PROVIDERS) {
      const cipherText = raw[provider]
      if (typeof cipherText === 'string' && cipherText.length > 0) {
        secrets[provider] = cipherText
      }
    }
    return secrets
  }

  private readJson(filePath: string): unknown {
    try {
      // 兼容带 UTF-8 BOM 的文件（手工编辑或第三方工具写入）
      const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
      return JSON.parse(text) as unknown
    } catch {
      return null
    }
  }

  private writeSettings(): void {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.getSettings(), null, 2), 'utf8')
  }

  private writeSecrets(): void {
    fs.writeFileSync(this.secretsPath, JSON.stringify(this.secrets, null, 2), 'utf8')
  }
}
