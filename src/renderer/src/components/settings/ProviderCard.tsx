import { useEffect, useState } from 'react'
import type { LlmProvider, LlmProviderConfig } from '../../../../shared/types'
import { zhCN } from '../../i18n/zh-CN'
import { Badge, Button, Card, Input } from '../ui'

interface ProviderCardProps {
  provider: LlmProvider
  config: LlmProviderConfig
  onSaveConfig: (values: { baseUrl: string; modelId: string }) => Promise<void>
  onSetApiKey: (apiKey: string) => Promise<boolean>
  onClearApiKey: () => Promise<void>
}

export function ProviderCard({
  provider,
  config,
  onSaveConfig,
  onSetApiKey,
  onClearApiKey
}: ProviderCardProps): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [modelId, setModelId] = useState(config.modelId)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [keyNotice, setKeyNotice] = useState<string | null>(null)
  const title = provider === 'openai' ? zhCN.settingsPage.openai : zhCN.settingsPage.anthropic

  useEffect(() => {
    setBaseUrl(config.baseUrl)
    setModelId(config.modelId)
  }, [config.baseUrl, config.modelId])

  async function handleSaveKey(): Promise<void> {
    if (!apiKey.trim()) {
      return
    }

    setBusy(true)
    setKeyNotice(null)
    const success = await onSetApiKey(apiKey)
    setBusy(false)
    if (success) {
      setApiKey('')
      setKeyNotice(zhCN.settingsPage.keySaved)
    } else {
      setKeyNotice(zhCN.settingsPage.keySaveFailed)
    }
  }

  async function handleClearKey(): Promise<void> {
    setBusy(true)
    await onClearApiKey()
    setBusy(false)
    setKeyNotice(zhCN.settingsPage.keyCleared)
  }

  return (
    <Card
      heading={title}
      actions={
        <Badge tone={config.hasApiKey ? 'success' : 'neutral'}>
          {config.hasApiKey ? zhCN.settingsPage.apiKeyConfigured : zhCN.settingsPage.apiKeyMissing}
        </Badge>
      }
    >
      <div className="settings-form">
        <Input
          label={zhCN.settingsPage.baseUrl}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          spellCheck={false}
        />
        <Input
          label={zhCN.settingsPage.modelId}
          value={modelId}
          placeholder={zhCN.settingsPage.modelPlaceholder}
          onChange={(event) => setModelId(event.target.value)}
          spellCheck={false}
        />

        <div className="settings-key">
          <Input
            label={zhCN.settingsPage.apiKey}
            type="password"
            value={apiKey}
            placeholder={zhCN.settingsPage.apiKeyPlaceholder}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
          />
          <div className="settings-key__actions">
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !apiKey.trim()}
              onClick={() => void handleSaveKey()}
            >
              {zhCN.settingsPage.saveKey}
            </Button>
            {config.hasApiKey ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void handleClearKey()}
              >
                {zhCN.settingsPage.clearKey}
              </Button>
            ) : null}
          </div>
          {keyNotice ? <p className="settings-hint">{keyNotice}</p> : null}
        </div>

        <div className="settings-provider__footer">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void onSaveConfig({ baseUrl, modelId })}
          >
            {zhCN.settingsPage.providerSave}
          </Button>
          <div className="settings-provider__test">
            <Button
              size="sm"
              variant="ghost"
              disabled
              title={zhCN.settingsPage.testPending}
            >
              {zhCN.settingsPage.testConnection}
            </Button>
            <Badge tone="neutral">{zhCN.settingsPage.testUnverified}</Badge>
          </div>
        </div>
      </div>
    </Card>
  )
}
