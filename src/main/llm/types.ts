export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  system?: string
  messages: LlmMessage[]
  maxTokens: number
  temperature?: number
  signal?: AbortSignal
}

export interface LlmResponse {
  text: string
  tokensIn?: number
  tokensOut?: number
}

export type LlmDeltaHandler = (delta: string) => void

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>
  stream(request: LlmRequest, onDelta: LlmDeltaHandler): Promise<LlmResponse>
}
