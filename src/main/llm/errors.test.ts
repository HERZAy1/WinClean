import { describe, expect, it } from 'vitest'
import { mapHttpError } from './errors'
import { readUpstreamError } from './http'

function jsonResponse(payload: unknown, status = 400): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('readUpstreamError', () => {
  it('解析 OpenAI 风格的 error 对象', async () => {
    const info = await readUpstreamError(
      jsonResponse({ error: { code: 'invalid_api_key', message: 'bad key' } }, 401)
    )

    expect(info).toEqual({ code: 'invalid_api_key', message: 'bad key', hint: undefined })
  })

  it('解析网关的 gateway_hint 与数字错误码', async () => {
    const info = await readUpstreamError(
      jsonResponse(
        {
          error: {
            code: 11158,
            msg: 'model not allowed',
            gateway_hint: 'upgrade plan'
          }
        },
        503
      )
    )

    expect(info).toEqual({ code: '11158', message: 'model not allowed', hint: 'upgrade plan' })
  })

  it('非 JSON 响应退化为文本片段', async () => {
    const info = await readUpstreamError(new Response('<html>oops</html>', { status: 500 }))

    expect(info?.message).toBe('<html>oops</html>')
  })
})

describe('mapHttpError', () => {
  it('401/403 映射为鉴权失败', () => {
    expect(mapHttpError(401).code).toBe('LLM_AUTH_FAILED')
    expect(mapHttpError(403).code).toBe('LLM_AUTH_FAILED')
  })

  it('503 映射为服务不可用而不是网络错误', () => {
    const error = mapHttpError(503, undefined, {
      code: 'no_healthy_account',
      message: 'all accounts are temporarily unavailable',
      hint: 'retry later'
    })

    expect(error.code).toBe('LLM_UNAVAILABLE')
    expect(error.detail).toBe(
      'HTTP 503 · no_healthy_account · all accounts are temporarily unavailable · retry later'
    )
  })

  it('400/404 映射为请求被拒绝并保留状态码', () => {
    const error = mapHttpError(404, undefined, { message: 'model not found' })

    expect(error.code).toBe('LLM_REQUEST_REJECTED')
    expect(error.status).toBe(404)
    expect(error.detail).toContain('model not found')
  })
})
