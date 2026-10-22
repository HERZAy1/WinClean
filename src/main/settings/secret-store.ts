import type { LlmProvider } from '../../shared/types'

export interface SecretStore {
  isAvailable(): boolean
  encrypt(plainText: string): string
  decrypt(cipherText: string): string
}

export interface StoredSecret {
  provider: LlmProvider
  cipherText: string
}
