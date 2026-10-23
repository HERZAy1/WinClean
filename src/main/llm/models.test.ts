import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsService } from '../settings/service'
import type { SecretStore } from '../settings/secret-store'
import { listModels } from './models'
import { startTestServer, type TestServer } from './test-server'

const tempDirs: string[] = []
let server: TestServer | undefined

const secretStore: SecretStore = {
  isAvailable: () => true,
  encrypt: (plainText) => Buffer.from(plainText).toString('base64'),
  decrypt: (cipherText) => Buffer.from(cipherText, 'base64').toString('utf8')
}

function makeService(): SettingsService {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-models-'))
  tempDirs.push(dir)
  const service = new SettingsService(dir, secretStore)
  service.setApiKey('deepseek', 'sk-deepseek-test')
  return service
}

afterEach(async () => {
  await server?.close()
  server = undefined
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('listModels', () => {
  it('拉取并排序上游模型列表', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ data: [{ id: 'deepseek-reasoner' }, { id: 'deepseek-chat' }] }))
    })
    const service = makeService()

    const result = await listModels(service, 'deepseek', { baseUrl: server.url })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual(['deepseek-chat', 'deepseek-reasoner'])
    }
    expect(server.requests[0].url).toBe('/models')
    expect(server.requests[0].headers.authorization).toBe('Bearer sk-deepseek-test')
  })

  it('未保存 Key 时返回 LLM_NOT_CONFIGURED 且不发请求', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-models-'))
    tempDirs.push(dir)
    const service = new SettingsService(dir, secretStore)

    const result = await listModels(service, 'deepseek')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_NOT_CONFIGURED')
    }
  })

  it('上游 401 时透传 error.code 与 message', async () => {
    server = await startTestServer((_req, res) => {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { code: 'invalid_api_key', message: 'bad key' } }))
    })
    const service = makeService()

    const result = await listModels(service, 'deepseek', { baseUrl: server.url })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_AUTH_FAILED')
      expect(result.error.detail).toContain('HTTP 401')
      expect(result.error.detail).toContain('invalid_api_key')
      expect(result.error.detail).toContain('bad key')
      expect(JSON.stringify(result)).not.toContain('sk-deepseek-test')
    }
  })

  it('上游返回非 JSON 时给出可读细节', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<html>gateway</html>')
    })
    const service = makeService()

    const result = await listModels(service, 'deepseek', { baseUrl: server.url })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_BAD_RESPONSE')
      expect(result.error.detail).toContain('不是合法 JSON')
    }
  })
})
