import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AnthropicClient } from './anthropic'
import { completeJson } from './json'
import { startTestServer, type TestServer } from './test-server'

let server: TestServer | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

function anthropicClient(baseUrl: string): AnthropicClient {
  return new AnthropicClient({
    baseUrl,
    apiKey: 'sk-ant-secret',
    modelId: 'claude-test',
    retryBaseMs: 1
  })
}

const request = {
  messages: [{ role: 'user' as const, content: 'hello' }],
  maxTokens: 20,
  temperature: 0
}

describe('AnthropicClient', () => {
  it('成功解析响应、usage，并正确拼接 /v1/messages', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          content: [{ type: 'text', text: '连接成功' }],
          usage: { input_tokens: 5, output_tokens: 3 }
        })
      )
    })

    const result = await anthropicClient(`${server.url}/v1/`).complete(request)

    expect(result.text).toBe('连接成功')
    expect(result.tokensIn).toBe(5)
    expect(result.tokensOut).toBe(3)
    expect(server.requests[0].url).toBe('/v1/messages')
    expect(server.requests[0].headers['x-api-key']).toBe('sk-ant-secret')
    expect(server.requests[0].headers['anthropic-version']).toBe('2023-06-01')
  })

  it('401 映射为 LLM_AUTH_FAILED', async () => {
    server = await startTestServer((_req, res) => {
      res.statusCode = 401
      res.end('{}')
    })

    await expect(anthropicClient(server.url).complete(request)).rejects.toMatchObject({
      code: 'LLM_AUTH_FAILED'
    })
    expect(server.requests).toHaveLength(1)
  })

  it('429 重试后成功', async () => {
    server = await startTestServer((_req, res, _body, index) => {
      if (index === 0) {
        res.statusCode = 429
        res.setHeader('Retry-After', '0')
        res.end('{}')
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }))
    })

    const result = await anthropicClient(server.url).complete(request)

    expect(result.text).toBe('ok')
    expect(server.requests).toHaveLength(2)
  })

  it('SSE 流式拼接并解析 token', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.write(
        'data: {"type":"message_start","message":{"usage":{"input_tokens":6}}}\n\n'
      )
      res.write('data: {"type":"content_block_delta","delta":{"text":"你"}}\n\n')
      res.write('data: {"type":"content_block_delta","delta":{"text":"好"}}\n\n')
      res.write('data: {"type":"message_delta","usage":{"output_tokens":2}}\n\n')
      res.end('data: {"type":"message_stop"}\n\n')
    })

    const deltas: string[] = []
    const result = await anthropicClient(server.url).stream(request, (delta) =>
      deltas.push(delta)
    )

    expect(result.text).toBe('你好')
    expect(result.tokensIn).toBe(6)
    expect(result.tokensOut).toBe(2)
    expect(deltas).toEqual(['你', '好'])
  })

  it('剥离 JSON 围栏', async () => {
    server = await startTestServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          content: [{ type: 'text', text: '```json\n{"path":"C:\\\\x"}\n```' }]
        })
      )
    })

    const result = await completeJson(
      anthropicClient(server.url),
      request,
      (value) => z.object({ path: z.string() }).parse(value)
    )

    expect(result).toEqual({ path: 'C:\\x' })
  })

  it('校验失败后重试一次', async () => {
    server = await startTestServer((_req, res, _body, index) => {
      res.setHeader('Content-Type', 'application/json')
      const text = index === 0 ? '{"bad":1}' : '{"path":"ok"}'
      res.end(JSON.stringify({ content: [{ type: 'text', text }] }))
    })

    const result = await completeJson(
      anthropicClient(server.url),
      request,
      (value) => z.object({ path: z.string() }).parse(value)
    )

    expect(result).toEqual({ path: 'ok' })
    expect(server.requests).toHaveLength(2)
  })
})
