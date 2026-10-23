import type { LlmProvider } from './types'

export interface LlmProviderPreset {
  baseUrl: string
  protocol: 'openai' | 'anthropic'
  // true 表示接口地址由应用固定，用户无需也无法修改
  baseUrlLocked: boolean
}

export const LLM_PROVIDERS: readonly LlmProvider[] = ['openai', 'anthropic', 'deepseek']

export const LLM_PRESETS: Record<LlmProvider, LlmProviderPreset> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    baseUrlLocked: false
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    protocol: 'anthropic',
    baseUrlLocked: false
  },
  // DeepSeek 官方 OpenAI 兼容接口，用户只需填写 API Key 并选择模型
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    protocol: 'openai',
    baseUrlLocked: true
  }
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === 'string' && (LLM_PROVIDERS as readonly string[]).includes(value)
}
