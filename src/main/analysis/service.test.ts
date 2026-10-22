import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { LlmClient, LlmRequest, LlmResponse } from '../llm/types'
import { LlmError } from '../llm/errors'
import { SettingsService } from '../settings/service'
import type { SecretStore } from '../settings/secret-store'
import { AnalysisService } from './service'

const tempDirs: string[] = []

const secretStore: SecretStore = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString('utf8')
}

interface Fixture {
  db: Database.Database
  service: AnalysisService
  client: LlmClient
  requests: LlmRequest[]
  thinking: unknown[]
  progress: unknown[]
  ambiguousPath: string
  unownedPath: string
}

function createDb(includeUnowned = true): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE scans (id INTEGER PRIMARY KEY, startedAt INTEGER, drives TEXT, totalUsedBytes INTEGER);
    CREATE TABLE apps (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, publisher TEXT, version TEXT,
      installLocation TEXT, uninstallString TEXT, source TEXT NOT NULL,
      registryKeys TEXT NOT NULL DEFAULT '[]', hidden INTEGER NOT NULL DEFAULT 0,
      exePaths TEXT NOT NULL DEFAULT '[]', publisherKeys TEXT NOT NULL DEFAULT '[]',
      servicePaths TEXT NOT NULL DEFAULT '[]', uwpPackage TEXT
    );
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scanId INTEGER NOT NULL, path TEXT NOT NULL,
      parentPath TEXT, name TEXT NOT NULL, isDir INTEGER NOT NULL, sizeBytes INTEGER NOT NULL,
      owner TEXT NOT NULL DEFAULT 'unknown', ownerReason TEXT, appId TEXT
    );
    CREATE TABLE ownerships (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scanId INTEGER NOT NULL, targetType TEXT NOT NULL,
      targetId TEXT NOT NULL, appId TEXT, confidence REAL NOT NULL, source TEXT NOT NULL,
      reason TEXT NOT NULL, UNIQUE (scanId, targetType, targetId)
    );
    CREATE TABLE llm_cache (key TEXT PRIMARY KEY, response TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE unowned_explain (path TEXT NOT NULL, scanId INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (scanId, path));
  `)
  db.prepare('INSERT INTO scans (id, startedAt, drives, totalUsedBytes) VALUES (1, ?, ?, ?)').run(
    Date.now(),
    '["C"]',
    10000
  )
  db.prepare(
    "INSERT INTO apps (id, name, publisher, source, registryKeys, hidden, exePaths, publisherKeys, servicePaths) VALUES ('acme', 'Acme App', 'Acme', 'registry', '[]', 0, '[]', '[]', '[]')"
  ).run()

  const username = process.env['USERNAME'] ?? os.userInfo().username
  const ambiguousPath = `C:\\Users\\${username}\\AppData\\Local\\Acme`
  const unownedPath = 'C:\\Temp\\UnknownStuff'
  const insertFile = db.prepare(
    'INSERT INTO files (scanId, path, parentPath, name, isDir, sizeBytes, owner, appId) VALUES (1, ?, ?, ?, ?, ?, ?, NULL)'
  )
  insertFile.run(ambiguousPath, `C:\\Users\\${username}\\AppData\\Local`, 'Acme', 1, 1000, 'unknown')
  insertFile.run(`${ambiguousPath}\\cache.bin`, ambiguousPath, 'cache.bin', 0, 400, 'unknown')
  if (includeUnowned) {
    insertFile.run(unownedPath, 'C:\\Temp', 'UnknownStuff', 1, 800, 'unknown')
    insertFile.run(`${unownedPath}\\old.log`, unownedPath, 'old.log', 0, 800, 'unknown')
  }
  db.prepare(
    "INSERT INTO ownerships (scanId, targetType, targetId, appId, confidence, source, reason) VALUES (1, 'path', ?, NULL, 0.8, 'rule', '归属歧义：Acme / Other')"
  ).run(ambiguousPath)

  return db
}

function createSettings(): SettingsService {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-analysis-'))
  tempDirs.push(dir)
  const settings = new SettingsService(dir, secretStore)
  const providers = settings.getSettings().providers
  settings.save({
    privacyConsent: true,
    activeProvider: 'openai',
    providers: {
      openai: { ...providers.openai, modelId: 'gpt-test' },
      anthropic: { ...providers.anthropic, modelId: 'claude-test' }
    }
  })
  settings.setApiKey('openai', 'sk-analysis-test')
  settings.markConnectionTestSuccess('openai')
  return settings
}

function createFixture(options: {
  includeUnowned?: boolean
  firstResponse?: 'invalid' | '429' | null
  holdStream?: boolean
} = {}): Fixture {
  const db = createDb(options.includeUnowned ?? true)
  const settings = createSettings()
  const requests: LlmRequest[] = []
  const thinking: unknown[] = []
  const progress: unknown[] = []
  let callCount = 0

  const client: LlmClient = {
    complete: async (request) => {
      requests.push(request)
      return responseFor(request)
    },
    stream: async (request, onDelta) => {
      requests.push(request)
      callCount += 1
      if (options.firstResponse === 'invalid' && callCount === 1) {
        onDelta('not-json')
        return { text: 'not-json' }
      }
      if (options.firstResponse === '429' && callCount === 1) {
        throw new LlmError('LLM_RATE_LIMITED', { retryAfterMs: 0 })
      }
      if (options.holdStream) {
        await new Promise<void>((_resolve, reject) => {
          const onAbort = (): void => reject(new LlmError('CANCELLED'))
          request.signal?.addEventListener('abort', onAbort, { once: true })
        })
      }
      const response = responseFor(request)
      onDelta(response.text)
      return response
    }
  }

  const service = new AnalysisService(settings, {
    db,
    clientFactory: () => client,
    onThinking: (event) => thinking.push(event),
    onProgress: (event) => progress.push(event)
  })

  return {
    db,
    service,
    client,
    requests,
    thinking,
    progress,
    ambiguousPath: `C:\\Users\\${process.env['USERNAME'] ?? os.userInfo().username}\\AppData\\Local\\Acme`,
    unownedPath: 'C:\\Temp\\UnknownStuff'
  }
}

function responseFor(request: LlmRequest): LlmResponse {
  const payload = JSON.parse(request.messages[0].content) as {
    task: string
    items: { path: string }[]
  }
  if (payload.task === 'ownership') {
    return {
      text: JSON.stringify(
        payload.items.map((item) => ({
          path: item.path,
          appName: 'Acme App',
          confidence: 0.8,
          reason: '名称匹配'
        }))
      ),
      tokensIn: 10,
      tokensOut: 5
    }
  }
  return {
    text: JSON.stringify(
      payload.items.map((item) => ({
        path: item.path,
        kind: 'temp-or-cache',
        summary: '临时缓存目录',
        riskLevel: 'low'
      }))
    ),
    tokensIn: 10,
    tokensOut: 5
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('AnalysisService', () => {
  it('正常分析归属与未归属，写入数据库并产生思考事件', async () => {
    const fixture = createFixture()
    const result = await fixture.service.start(1)
    expect(result.ok).toBe(true)
    await fixture.service.waitForIdle()

    expect(fixture.requests).toHaveLength(2)
    const serialized = JSON.stringify(fixture.requests)
    expect(serialized).not.toContain(process.env['USERNAME'] ?? os.userInfo().username)
    expect(serialized).toContain('%USERNAME%')
    expect(serialized).not.toContain('file content')

    const ownership = fixture.db
      .prepare('SELECT appId, source FROM ownerships WHERE targetId = ?')
      .get(fixture.ambiguousPath) as { appId: string; source: string }
    expect(ownership).toMatchObject({ appId: 'acme', source: 'llm' })
    expect(
      fixture.db
        .prepare('SELECT appId FROM files WHERE path = ?')
        .get(fixture.ambiguousPath)
    ).toEqual({ appId: 'acme' })
    expect(
      fixture.db
        .prepare('SELECT appId FROM files WHERE path = ?')
        .get(`${fixture.ambiguousPath}\\cache.bin`)
    ).toEqual({ appId: 'acme' })

    expect(
      fixture.db
        .prepare('SELECT json FROM unowned_explain WHERE path = ?')
        .get(fixture.unownedPath)
    ).toBeTruthy()

    const statuses = fixture.thinking.map((event) => (event as { status: string }).status)
    expect(statuses).toContain('thinking')
    expect(statuses).toContain('streaming')
    expect(statuses).toContain('done')
    const progress = fixture.progress.at(-1) as { stage: string; percent: number }
    expect(progress.stage).toBe('llm-analysis')
    expect(progress.percent).toBe(1)

    const explanations = await fixture.service.explain([fixture.unownedPath])
    expect(explanations.ok).toBe(true)
    if (explanations.ok) {
      expect(explanations.data[0]?.summary).toBe('临时缓存目录')
    }
  })

  it('第二次分析命中缓存，不再调用 LLM', async () => {
    const fixture = createFixture()
    await fixture.service.start(1)
    await fixture.service.waitForIdle()
    const firstCount = fixture.requests.length

    const second = new AnalysisService(createSettings(), {
      db: fixture.db,
      clientFactory: () => fixture.client,
      onThinking: () => undefined,
      onProgress: () => undefined
    })
    await second.start(1)
    await second.waitForIdle()

    expect(fixture.requests.length).toBe(firstCount)
  })

  it('非法 JSON 会重试一次后成功', async () => {
    const fixture = createFixture({ includeUnowned: false, firstResponse: 'invalid' })
    await fixture.service.start(1)
    await fixture.service.waitForIdle()

    expect(fixture.requests).toHaveLength(2)
    expect(
      fixture.db
        .prepare('SELECT appId FROM ownerships WHERE targetId = ?')
        .get(fixture.ambiguousPath)
    ).toEqual({ appId: 'acme' })
  })

  it('429 会重试一次后成功', async () => {
    const fixture = createFixture({ includeUnowned: false, firstResponse: '429' })
    await fixture.service.start(1)
    await fixture.service.waitForIdle()

    expect(fixture.requests).toHaveLength(2)
    expect(
      fixture.db
        .prepare('SELECT appId FROM ownerships WHERE targetId = ?')
        .get(fixture.ambiguousPath)
    ).toEqual({ appId: 'acme' })
  })

  it('取消会中止在途流式请求', async () => {
    const fixture = createFixture({ includeUnowned: false, holdStream: true })
    await fixture.service.start(1)
    await new Promise((resolve) => setTimeout(resolve, 20))
    fixture.service.cancel()
    await fixture.service.waitForIdle()

    const last = fixture.progress.at(-1) as { stage: string }
    expect(last.stage).toBe('cancelled')
  })
})
