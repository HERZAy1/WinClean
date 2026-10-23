import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsService } from './service'
import type { SecretStore } from './secret-store'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-settings-'))
  tempDirs.push(dir)
  return dir
}

const fakeSecretStore: SecretStore = {
  isAvailable: () => true,
  encrypt: (plainText) => Buffer.from([...plainText].reverse().join(''), 'utf8').toString('base64'),
  decrypt: (cipherText) =>
    [...Buffer.from(cipherText, 'base64').toString('utf8')].reverse().join('')
}

const unavailableSecretStore: SecretStore = {
  isAvailable: () => false,
  encrypt: () => '',
  decrypt: () => ''
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('SettingsService', () => {
  it('返回契约默认值且隐私授权默认开启', () => {
    const service = new SettingsService(makeTempDir(), fakeSecretStore)
    const settings = service.getSettings()

    expect(settings.activeProvider).toBe('openai')
    expect(settings.providers.openai.baseUrl).toBe('https://api.openai.com/v1')
    expect(settings.providers.anthropic.baseUrl).toBe('https://api.anthropic.com')
    expect(settings.providers.deepseek.baseUrl).toBe('https://api.deepseek.com')
    expect(settings.privacyConsent).toBe(true)
    expect(settings.cleanMode).toBe('recycle')
    expect(settings.theme).toBe('system')
    expect(settings.providers.openai.hasApiKey).toBe(false)
    expect(settings.llmUsage.deepseek).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      requests: 0,
      updatedAt: 0
    })
  })

  it('保存后重启仍保留设置', () => {
    const dir = makeTempDir()
    const service = new SettingsService(dir, fakeSecretStore)
    expect(service.save({ theme: 'dark', privacyConsent: true }).ok).toBe(true)

    const reloaded = new SettingsService(dir, fakeSecretStore)
    expect(reloaded.getSettings().theme).toBe('dark')
    expect(reloaded.getSettings().privacyConsent).toBe(true)
  })

  it('用户显式关闭隐私授权后保持关闭', () => {
    const dir = makeTempDir()
    const service = new SettingsService(dir, fakeSecretStore)
    service.save({ privacyConsent: false })

    const reloaded = new SettingsService(dir, fakeSecretStore)
    expect(reloaded.getSettings().privacyConsent).toBe(false)
  })

  it('Key 加密落盘且不出现在任何设置或密钥文件中', () => {
    const dir = makeTempDir()
    const service = new SettingsService(dir, fakeSecretStore)
    const apiKey = 'sk-test-SECRET-12345'

    expect(service.setApiKey('openai', apiKey).ok).toBe(true)
    expect(service.getApiKey('openai')).toBe(apiKey)
    expect(service.getSettings().providers.openai.hasApiKey).toBe(true)

    const secrets = fs.readFileSync(path.join(dir, 'secrets.bin'), 'utf8')
    const settings = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
    expect(secrets).not.toContain(apiKey)
    expect(settings).not.toContain(apiKey)
    expect(JSON.stringify(service.getSettings())).not.toContain(apiKey)
  })

  it('清除 Key 后 hasApiKey 变回 false', () => {
    const dir = makeTempDir()
    const service = new SettingsService(dir, fakeSecretStore)
    service.setApiKey('anthropic', 'sk-ant-secret')
    service.clearApiKey('anthropic')

    expect(service.hasApiKey('anthropic')).toBe(false)
    expect(service.getApiKey('anthropic')).toBeNull()
    expect(service.getSettings().providers.anthropic.hasApiKey).toBe(false)
  })

  it('系统加密不可用时拒绝保存 Key', () => {
    const service = new SettingsService(makeTempDir(), unavailableSecretStore)
    const result = service.setApiKey('openai', 'sk-secret')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL')
      expect(result.error.message).toContain('加密')
    }
    expect(service.getSettings().providers.openai.hasApiKey).toBe(false)
  })

  it('DeepSeek 接口地址固定为官方地址，本地覆盖被忽略', () => {
    const dir = makeTempDir()
    const service = new SettingsService(dir, fakeSecretStore)
    const providers = service.getSettings().providers
    service.save({
      providers: {
        ...providers,
        deepseek: { ...providers.deepseek, baseUrl: 'https://evil.example.com', modelId: 'deepseek-chat' }
      }
    })

    expect(service.getSettings().providers.deepseek.baseUrl).toBe('https://api.deepseek.com')
    expect(service.getSettings().providers.deepseek.modelId).toBe('deepseek-chat')
  })

  it('累计 Token 用量并持久化', () => {
    const dir = makeTempDir()
    const service = new SettingsService(dir, fakeSecretStore)

    service.recordUsage('deepseek', { tokensIn: 10, tokensOut: 5 })
    service.recordUsage('deepseek', { tokensIn: 3, tokensOut: 2 })

    const usage = service.getSettings().llmUsage.deepseek
    expect(usage.tokensIn).toBe(13)
    expect(usage.tokensOut).toBe(7)
    expect(usage.requests).toBe(2)
    expect(usage.updatedAt).toBeGreaterThan(0)

    const reloaded = new SettingsService(dir, fakeSecretStore)
    expect(reloaded.getSettings().llmUsage.deepseek.tokensIn).toBe(13)
    expect(reloaded.getSettings().llmUsage.openai.requests).toBe(0)
  })

  it('settings.json 带 UTF-8 BOM 时仍能读取', () => {
    const dir = makeTempDir()
    const payload = {
      activeProvider: 'deepseek',
      providers: {
        deepseek: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat' }
      },
      privacyConsent: true
    }
    fs.writeFileSync(path.join(dir, 'settings.json'), `\uFEFF${JSON.stringify(payload)}`, 'utf8')

    const service = new SettingsService(dir, fakeSecretStore)
    const settings = service.getSettings()

    expect(settings.activeProvider).toBe('deepseek')
    expect(settings.providers.deepseek.modelId).toBe('deepseek-chat')
  })
})
