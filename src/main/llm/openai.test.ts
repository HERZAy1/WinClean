import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { LlmError } from './errors'
import { completeJson } from './json'
import { OpenAiClient } from './openai'
import { startTestServer, type TestServer } from './test-server'

let server: TestServer | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

function openAiClient(baseUrl: string): OpenAiClient {
  return new OpenAiClient({
    baseUrl,
    apiKey: 'sk-secret-openai',
    modelId: 'gpt-test',
    retryBaseMs: 1
  })
}

const request = {
  messages: [{ role: 'user' as const, content: 'hello' }],
  maxTokens: 20,
  temperature: 0
}

describe('OpenAiClient', () => {
  it('成功解析普通响应与 usage', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '连接成功' } }],
          usage: { prompt_tokens: 4, completion_tokens: 2 }
        })
      )
    })

    const result = await openAiClient(`${server.url}/v1`).complete(request)

    expect(result.text).toBe('连接成功')
    expect(result.tokensIn).toBe(4)
    expect(result.tokensOut).toBe(2)
    expect(server.requests[0].url).toBe('/v1/chat/completions')
    expect(server.requests[0].headers.authorization).toBe('Bearer sk-secret-openai')
    expect(JSON.parse(server.requests[0].body)).toMatchObject({
      model: 'gpt-test',
      max_tokens: 20
    })
  })

  it('401 映射为 LLM_AUTH_FAILED 且不重试', async () => {
    server = await startTestServer((_req, res) => {
      res.statusCode = 401
      res.end('{}')
    })

    await expect(openAiClient(server.url).complete(request)).rejects.toMatchObject({
      code: 'LLM_AUTH_FAILED'
    })
    expect(server.requests).toHaveLength(1)
  })

  it('429 按 Retry-After 重试后成功', async () => {
    server = await startTestServer((_req, res, _body, index) => {
      if (index < 2) {
        res.statusCode = 429
        res.setHeader('Retry-After', '0')
        res.end('{}')
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
    })

    const result = await openAiClient(server.url).complete(request)

    expect(result.text).toBe('ok')
    expect(server.requests).toHaveLength(3)
  })

  it('SSE 流式拼接', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n')
      res.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n')
      res.end('data: [DONE]\n\n')
    })

    const deltas: string[] = []
    const result = await openAiClient(server.url).stream(request, (delta) => deltas.push(delta))

    expect(result.text).toBe('你好')
    expect(deltas).toEqual(['你', '好'])
  })

  it('剥离 JSON 围栏，解析失败时重试一次', async () => {
    server = await startTestServer((_req, res, _body, index) => {
      res.setHeader('Content-Type', 'application/json')
      const content =
        index === 0 ? '这不是 JSON' : '```json\n[{"path":"C:\\\\Temp\\\\x"}]\n```'
      res.end(JSON.stringify({ choices: [{ message: { content } }] }))
    })

    const client = openAiClient(server.url)
    const result = await completeJson(
      client,
      request,
      (value) => z.array(z.object({ path: z.string() })).parse(value)
    )

    expect(result).toEqual([{ path: 'C:\\Temp\\x' }])
    expect(server.requests).toHaveLength(2)
  })

  it('JSON schema 校验失败时重试一次', async () => {
    server = await startTestServer((_req, res, _body, index) => {
      res.setHeader('Content-Type', 'application/json')
      const content = index === 0 ? '{"wrong":true}' : '{"path":"C:\\\\x"}'
      res.end(JSON.stringify({ choices: [{ message: { content } }] }))
    })

    const result = await completeJson(
      openAiClient(server.url),
      request,
      (value) => z.object({ path: z.string() }).parse(value)
    )

    expect(result).toEqual({ path: 'C:\\x' })
    expect(server.requests).toHaveLength(2)
  })

  it('重试耗尽后保留错误码且不泄露 Key', async () => {
    server = await startTestServer((_req, res) => {
      res.statusCode = 429
      res.setHeader('Retry-After', '0')
      res.end('{}')
    })

    try {
      await openAiClient(server.url).complete(request)
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError)
      expect((error as LlmError).code).toBe('LLM_RATE_LIMITED')
      expect((error as LlmError).message).not.toContain('sk-secret-openai')
    }
  })

  it('finish_reason=length 时抛出 LLM_TRUNCATED 并携带已用 token', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 7, completion_tokens: 2000 }
        })
      )
    })

    await expect(openAiClient(server.url).complete(request)).rejects.toMatchObject({
      code: 'LLM_TRUNCATED',
      usage: { tokensIn: 7, tokensOut: 2000 }
    })
  })

  it('流式被截断时同样抛出 LLM_TRUNCATED', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`
      )
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 2000 } })}\n\n`)
      res.end('data: [DONE]\n\n')
    })

    await expect(
      openAiClient(server.url).stream(request, () => undefined)
    ).rejects.toMatchObject({
      code: 'LLM_TRUNCATED',
      usage: { tokensIn: 9, tokensOut: 2000 }
    })
  })
})
