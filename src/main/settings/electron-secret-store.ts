import { safeStorage } from 'electron'
import type { SecretStore } from './secret-store'

export const electronSecretStore: SecretStore = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plainText) => safeStorage.encryptString(plainText).toString('base64'),
  decrypt: (cipherText) => safeStorage.decryptString(Buffer.from(cipherText, 'base64'))
}
