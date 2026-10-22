import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsService } from '../settings/service'
import type { SecretStore } from '../settings/secret-store'
import { startTestServer, type TestServer } from './test-server'
import { testConnection } from './test-connection'

const tempDirs: string[] = []
let server: TestServer | undefined

const secretStore: SecretStore = {
  isAvailable: () => true,
  encrypt: (plainText) => Buffer.from(plainText).toString('base64'),
  decrypt: (cipherText) => Buffer.from(cipherText, 'base64').toString('utf8')
}

function makeService(): SettingsService {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-llm-'))
  tempDirs.push(dir)
  const service = new SettingsService(dir, secretStore)
  const providers = service.getSettings().providers
  service.save({
    activeProvider: 'openai',
    providers: {
      openai: { ...providers.openai, modelId: 'gpt-test' },
      anthropic: { ...providers.anthropic, modelId: 'claude-test' }
    }
  })
  service.setApiKey('openai', 'sk-test-key')
  return service
}

afterEach(async () => {
  await server?.close()
  server = undefined
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('testConnection', () => {
  it('成功时返回延迟与回复预览，并记录最近一次成功', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: '连接成功' } }] }))
    })
    const service = makeService()
    const providers = service.getSettings().providers
    service.save({
      providers: {
        ...providers,
        openai: { ...providers.openai, baseUrl: server.url }
      }
    })

    const result = await testConnection(service, 'openai')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.replyPreview).toBe('连接成功')
      expect(result.data.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.data.provider).toBe('openai')
    }
    expect(service.hasSuccessfulConnectionTest('openai')).toBe(true)
  })

  it('未配置 Key 时返回 LLM_NOT_CONFIGURED', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-llm-'))
    tempDirs.push(dir)
    const service = new SettingsService(dir, secretStore)

    const result = await testConnection(service, 'openai')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_NOT_CONFIGURED')
    }
  })

  it('401 返回 LLM_AUTH_FAILED 且错误中不含 Key', async () => {
    server = await startTestServer((_req, res) => {
      res.statusCode = 401
      res.end('{}')
    })
    const service = makeService()
    const providers = service.getSettings().providers
    service.save({
      providers: {
        ...providers,
        openai: { ...providers.openai, baseUrl: server.url }
      }
    })

    const result = await testConnection(service, 'openai')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_AUTH_FAILED')
      expect(JSON.stringify(result)).not.toContain('sk-test-key')
    }
  })
})
