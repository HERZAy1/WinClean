import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings, LlmProvider, LlmProviderConfig, Result } from '../../shared/types'
import { fail, ok } from '../ipc/result'
import type { SecretStore } from './secret-store'

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'openai',
  providers: {
    openai: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      modelId: '',
      hasApiKey: false
    },
    anthropic: {
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      modelId: '',
      hasApiKey: false
    }
  },
  privacyConsent: false,
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

function providerConfig(
  raw: unknown,
  provider: LlmProvider,
  fallback: LlmProviderConfig,
  hasApiKey: boolean
): LlmProviderConfig {
  const value = isRecord(raw) ? raw : {}
  return {
    provider,
    baseUrl: stringValue(value['baseUrl'], fallback.baseUrl),
    modelId: stringValue(value['modelId'], fallback.modelId),
    hasApiKey
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
    const next = this.normalize({
      ...current,
      ...patch,
      providers: {
        openai: {
          ...current.providers.openai,
          ...(patch.providers?.openai ?? {})
        },
        anthropic: {
          ...current.providers.anthropic,
          ...(patch.providers?.anthropic ?? {})
        }
      }
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

  markConnectionTestSuccess(provider: LlmProvider): void {
    this.successfulTests.add(provider)
  }

  hasSuccessfulConnectionTest(provider: LlmProvider): boolean {
    return this.successfulTests.has(provider)
  }

  private normalize(raw: unknown): AppSettings {
    const value = isRecord(raw) ? raw : {}
    const activeProvider =
      value['activeProvider'] === 'anthropic' ? 'anthropic' : ('openai' as const)
    const theme =
      value['theme'] === 'light' || value['theme'] === 'dark' || value['theme'] === 'system'
        ? value['theme']
        : DEFAULT_SETTINGS.theme
    const cleanMode = value['cleanMode'] === 'permanent' ? 'permanent' : ('recycle' as const)
    const providers = isRecord(value['providers']) ? value['providers'] : {}
    const scanDrives = Array.isArray(value['scanDrives'])
      ? value['scanDrives'].filter((drive): drive is string => typeof drive === 'string')
      : []

    return {
      activeProvider,
      providers: {
        openai: providerConfig(
          providers['openai'],
          'openai',
          DEFAULT_SETTINGS.providers.openai,
          this.hasApiKey('openai')
        ),
        anthropic: providerConfig(
          providers['anthropic'],
          'anthropic',
          DEFAULT_SETTINGS.providers.anthropic,
          this.hasApiKey('anthropic')
        )
      },
      privacyConsent: value['privacyConsent'] === true,
      theme,
      cleanMode,
      scanDrives
    }
  }

  private withApiKeyFlags(settings: AppSettings): AppSettings {
    return {
      ...settings,
      providers: {
        openai: { ...settings.providers.openai, hasApiKey: this.hasApiKey('openai') },
        anthropic: { ...settings.providers.anthropic, hasApiKey: this.hasApiKey('anthropic') }
      }
    }
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
    for (const provider of ['openai', 'anthropic'] as const) {
      const cipherText = raw[provider]
      if (typeof cipherText === 'string' && cipherText.length > 0) {
        secrets[provider] = cipherText
      }
    }
    return secrets
  }

  private readJson(filePath: string): unknown {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
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
