import { useEffect, useState } from 'react'
import type {
  LlmProvider,
  LlmProviderConfig,
  Result,
  TestConnectionResult
} from '../../../../shared/types'
import { zhCN } from '../../i18n/zh-CN'
import { Badge, Button, Card, Input } from '../ui'

interface ProviderCardProps {
  provider: LlmProvider
  config: LlmProviderConfig
  onSaveConfig: (values: { baseUrl: string; modelId: string }) => Promise<void>
  onSetApiKey: (apiKey: string) => Promise<boolean>
  onClearApiKey: () => Promise<void>
  onTestConnection: () => Promise<Result<TestConnectionResult>>
}

interface TestState {
  status: 'idle' | 'running' | 'success' | 'error'
  latencyMs?: number
  preview?: string
  message?: string
}

export function ProviderCard({
  provider,
  config,
  onSaveConfig,
  onSetApiKey,
  onClearApiKey,
  onTestConnection
}: ProviderCardProps): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [modelId, setModelId] = useState(config.modelId)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [keyNotice, setKeyNotice] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })
  const title = provider === 'openai' ? zhCN.settingsPage.openai : zhCN.settingsPage.anthropic
  const canTest = config.hasApiKey && modelId.trim().length > 0

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
    setTestState({ status: 'idle' })
    setKeyNotice(zhCN.settingsPage.keyCleared)
  }

  async function handleTestConnection(): Promise<void> {
    if (!canTest) {
      return
    }

    setTestState({ status: 'running' })
    await onSaveConfig({ baseUrl, modelId })
    const result = await onTestConnection()

    if (result.ok) {
      setTestState({
        status: 'success',
        latencyMs: result.data.latencyMs,
        preview: result.data.replyPreview
      })
    } else {
      setTestState({ status: 'error', message: result.error.message })
    }
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
              disabled={!canTest || testState.status === 'running'}
              title={!canTest ? zhCN.settingsPage.testNeedsConfig : undefined}
              onClick={() => void handleTestConnection()}
            >
              {testState.status === 'running'
                ? zhCN.settingsPage.testRunning
                : zhCN.settingsPage.testConnection}
            </Button>
            <Badge
              tone={
                testState.status === 'success'
                  ? 'success'
                  : testState.status === 'running'
                    ? 'accent'
                    : 'neutral'
              }
            >
              {testState.status === 'success'
                ? zhCN.settingsPage.testVerified
                : zhCN.settingsPage.testUnverified}
            </Badge>
          </div>
        </div>

        {testState.status === 'success' ? (
          <div className="settings-test-result">
            <p>
              {zhCN.settingsPage.testConnection} · {zhCN.settingsPage.testLatency}{' '}
              {testState.latencyMs}ms
            </p>
            <p className="settings-hint">
              {zhCN.settingsPage.testReply}：{testState.preview}
            </p>
          </div>
        ) : null}
        {testState.status === 'error' ? (
          <p className="settings-test-result settings-test-result--error">
            {zhCN.settingsPage.testFailed}：{testState.message}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
