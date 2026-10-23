// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, Result, TestConnectionResult } from '../../../../shared/types'
import { ModelConfigCard } from './ModelConfigCard'

afterEach(() => {
  cleanup()
})

const zero = { tokensIn: 0, tokensOut: 0, requests: 0, updatedAt: 0 }

const settings: AppSettings = {
  activeProvider: 'openai',
  providers: {
    openai: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-4o',
      hasApiKey: true
    },
    anthropic: {
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      modelId: '',
      hasApiKey: false
    },
    deepseek: {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      modelId: '',
      hasApiKey: false
    }
  },
  llmUsage: {
    openai: { tokensIn: 1200, tokensOut: 800, requests: 3, updatedAt: 1 },
    anthropic: zero,
    deepseek: zero
  },
  privacyConsent: true,
  theme: 'system',
  cleanMode: 'recycle',
  scanDrives: ['C']
}

function setup(overrides: Partial<Parameters<typeof ModelConfigCard>[0]> = {}) {
  const props = {
    settings,
    onSelectProvider: vi.fn(async () => undefined),
    onSaveConfig: vi.fn(async () => true),
    onSetApiKey: vi.fn(async () => true),
    onClearApiKey: vi.fn(async () => undefined),
    onTestConnection: vi.fn(
      async (): Promise<Result<TestConnectionResult>> => ({
        ok: true,
        data: {
          provider: 'openai',
          modelId: 'gpt-4o',
          latencyMs: 12,
          replyPreview: '连接成功'
        }
      })
    ),
    onListModels: vi.fn(async () => ({ ok: true as const, data: ['gpt-4o', 'gpt-4o-mini'] })),
    ...overrides
  }

  const view = render(<ModelConfigCard {...props} />)
  return {
    props,
    rerender: (next: AppSettings) => view.rerender(<ModelConfigCard {...props} settings={next} />)
  }
}

describe('ModelConfigCard', () => {
  it('在同一个区块内提供服务商选择与 Token 用量汇总', () => {
    setup()

    expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Claude (Anthropic)' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'DeepSeek' })).toBeInTheDocument()
    expect(screen.getByText(/3 次调用/)).toBeInTheDocument()
  })

  it('切换到 DeepSeek 后 Base URL 锁定为官方地址', () => {
    const { props, rerender } = setup()

    fireEvent.click(screen.getByRole('radio', { name: 'DeepSeek' }))
    expect(props.onSelectProvider).toHaveBeenCalledWith('deepseek')

    rerender({ ...settings, activeProvider: 'deepseek' })

    const input = screen.getByLabelText('Base URL')
    expect(input).toHaveValue('https://api.deepseek.com')
    expect(input).toBeDisabled()
  })

  it('连接失败时把上游错误详情展示给用户', async () => {
    setup({
      onTestConnection: vi.fn(
        async (): Promise<Result<TestConnectionResult>> => ({
          ok: false,
          error: {
            code: 'LLM_UNAVAILABLE',
            message: '模型服务暂时不可用，请稍后重试或更换模型',
            detail: 'HTTP 503 · no_healthy_account · all accounts are temporarily unavailable'
          }
        })
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await waitFor(() => {
      expect(screen.getByText(/no_healthy_account/)).toBeInTheDocument()
    })
    expect(screen.getByText(/模型服务暂时不可用/)).toBeInTheDocument()
  })

  it('拉取模型列表后填充下拉选项', async () => {
    const { props } = setup()

    fireEvent.click(screen.getByRole('button', { name: '获取模型列表' }))

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'gpt-4o-mini' })).toBeInTheDocument()
    })
    expect(props.onListModels).toHaveBeenCalledWith('openai', 'https://api.openai.com/v1')
  })
})
