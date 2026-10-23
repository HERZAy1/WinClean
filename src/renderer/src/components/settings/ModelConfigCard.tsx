import { useEffect, useMemo, useState } from 'react'
import { LLM_PRESETS, LLM_PROVIDERS } from '../../../../shared/llm'
import type {
  AppSettings,
  LlmProvider,
  Result,
  TestConnectionResult
} from '../../../../shared/types'
import { zhCN } from '../../i18n/zh-CN'
import { Badge, Button, Card, Input, Select } from '../ui'

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: zhCN.settingsPage.providerOpenai,
  anthropic: zhCN.settingsPage.providerAnthropic,
  deepseek: zhCN.settingsPage.providerDeepseek
}

interface ModelConfigCardProps {
  settings: AppSettings
  onSelectProvider: (provider: LlmProvider) => Promise<void>
  onSaveConfig: (
    provider: LlmProvider,
    values: { baseUrl: string; modelId: string }
  ) => Promise<boolean>
  onSetApiKey: (provider: LlmProvider, apiKey: string) => Promise<boolean>
  onClearApiKey: (provider: LlmProvider) => Promise<void>
  onTestConnection: (provider: LlmProvider) => Promise<Result<TestConnectionResult>>
  onListModels: (provider: LlmProvider, baseUrl: string) => Promise<Result<string[]>>
}

interface TestState {
  status: 'idle' | 'running' | 'success' | 'error'
  latencyMs?: number
  preview?: string
  message?: string
  detail?: string
}

interface ModelsState {
  status: 'idle' | 'loading' | 'error'
  message?: string
  detail?: string
}

export function ModelConfigCard({
  settings,
  onSelectProvider,
  onSaveConfig,
  onSetApiKey,
  onClearApiKey,
  onTestConnection,
  onListModels
}: ModelConfigCardProps): React.JSX.Element {
  const provider = settings.activeProvider
  const config = settings.providers[provider]
  const preset = LLM_PRESETS[provider]

  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [modelId, setModelId] = useState(config.modelId)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [keyNotice, setKeyNotice] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [models, setModels] = useState<string[] | null>(null)
  const [modelsState, setModelsState] = useState<ModelsState>({ status: 'idle' })
  const [manualModel, setManualModel] = useState(false)
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })

  useEffect(() => {
    setBaseUrl(config.baseUrl)
    setModelId(config.modelId)
    setModels(null)
    setManualModel(false)
    setModelsState({ status: 'idle' })
    setTestState({ status: 'idle' })
    setNotice(null)
  }, [settings.activeProvider, config.baseUrl, config.modelId])

  const modelOptions = useMemo(() => {
    const options = new Set(models ?? [])
    if (modelId) {
      options.add(modelId)
    }
    return [...options]
  }, [models, modelId])

  const usage = settings.llmUsage
  const totals = useMemo(() => {
    let tokensIn = 0
    let tokensOut = 0
    let requests = 0
    for (const item of LLM_PROVIDERS) {
      tokensIn += usage[item].tokensIn
      tokensOut += usage[item].tokensOut
      requests += usage[item].requests
    }
    return { tokensIn, tokensOut, requests }
  }, [usage])

  const canTest = config.hasApiKey && modelId.trim().length > 0

  async function handleSaveKey(): Promise<void> {
    if (!apiKey.trim()) {
      return
    }

    setBusy(true)
    setKeyNotice(null)
    const success = await onSetApiKey(provider, apiKey)
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
    await onClearApiKey(provider)
    setBusy(false)
    setTestState({ status: 'idle' })
    setModels(null)
    setKeyNotice(zhCN.settingsPage.keyCleared)
  }

  async function handleSave(): Promise<boolean> {
    const saved = await onSaveConfig(provider, { baseUrl, modelId })
    setNotice(saved ? zhCN.settingsPage.modelSaved : null)
    return saved
  }

  async function handleFetchModels(): Promise<void> {
    setModelsState({ status: 'loading' })
    const result = await onListModels(provider, baseUrl)
    if (result.ok) {
      setModels(result.data)
      setModelsState({ status: 'idle' })
      if (!modelId.trim() && result.data.length > 0) {
        setModelId(result.data[0])
      }
      if (result.data.length === 0) {
        setManualModel(true)
      }
      return
    }

    setModelsState({
      status: 'error',
      message: result.error.message,
      detail: result.error.detail
    })
  }

  async function handleTestConnection(): Promise<void> {
    if (!canTest) {
      return
    }

    setTestState({ status: 'running' })
    const saved = await handleSave()
    if (!saved) {
      setTestState({ status: 'error', message: zhCN.settingsPage.saveFailed })
      return
    }

    const result = await onTestConnection(provider)
    if (result.ok) {
      setTestState({
        status: 'success',
        latencyMs: result.data.latencyMs,
        preview: result.data.replyPreview
      })
    } else {
      setTestState({
        status: 'error',
        message: result.error.message,
        detail: result.error.detail
      })
    }
  }

  return (
    <Card
      heading={zhCN.settingsPage.modelTitle}
      description={zhCN.settingsPage.modelDescription}
      actions={
        <Badge tone={config.hasApiKey ? 'success' : 'neutral'}>
          {config.hasApiKey ? zhCN.settingsPage.apiKeyConfigured : zhCN.settingsPage.apiKeyMissing}
        </Badge>
      }
    >
      <div className="settings-form">
        <fieldset className="provider-choice">
          <legend className="visually-hidden">{zhCN.settingsPage.provider}</legend>
          {LLM_PROVIDERS.map((item) => (
            <label
              key={item}
              className="provider-choice__item"
            >
              <input
                type="radio"
                name="llm-provider"
                checked={provider === item}
                onChange={() => void onSelectProvider(item)}
              />
              <span>{PROVIDER_LABELS[item]}</span>
            </label>
          ))}
        </fieldset>

        {provider === 'deepseek' ? (
          <p className="settings-hint">{zhCN.settingsPage.deepseekHint}</p>
        ) : null}

        <Input
          label={zhCN.settingsPage.baseUrl}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          readOnly={preset.baseUrlLocked}
          disabled={preset.baseUrlLocked}
          hint={preset.baseUrlLocked ? zhCN.settingsPage.baseUrlLocked : undefined}
          spellCheck={false}
        />

        <div className="settings-model__row">
          {manualModel ? (
            <Input
              label={zhCN.settingsPage.modelId}
              value={modelId}
              placeholder={zhCN.settingsPage.modelPlaceholder}
              onChange={(event) => setModelId(event.target.value)}
              spellCheck={false}
            />
          ) : (
            <Select
              label={zhCN.settingsPage.modelId}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              hint={
                models === null
                  ? zhCN.settingsPage.modelFetchHint
                  : models.length === 0
                    ? zhCN.settingsPage.modelListEmpty
                    : zhCN.settingsPage.modelSelectHint
              }
            >
              <option value="">{zhCN.settingsPage.modelSelectPlaceholder}</option>
              {modelOptions.map((id) => (
                <option
                  key={id}
                  value={id}
                >
                  {id}
                </option>
              ))}
            </Select>
          )}

          <div className="settings-model__actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={!config.hasApiKey || modelsState.status === 'loading'}
              title={!config.hasApiKey ? zhCN.settingsPage.modelNeedsKey : undefined}
              onClick={() => void handleFetchModels()}
            >
              {modelsState.status === 'loading'
                ? zhCN.settingsPage.modelFetching
                : zhCN.settingsPage.modelFetch}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setManualModel((value) => !value)}
            >
              {manualModel ? zhCN.settingsPage.modelUseList : zhCN.settingsPage.modelUseManual}
            </Button>
          </div>
        </div>

        {modelsState.status === 'error' ? (
          <div className="settings-test-result settings-test-result--error">
            <p>
              {zhCN.settingsPage.modelFetchFailed}：{modelsState.message}
            </p>
            {modelsState.detail ? (
              <pre className="settings-error-detail">{modelsState.detail}</pre>
            ) : null}
          </div>
        ) : null}

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
          <div className="settings-provider__test">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleSave()}
            >
              {zhCN.settingsPage.providerSave}
            </Button>
            {notice ? <span className="settings-hint">{notice}</span> : null}
          </div>
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
          <div className="settings-test-result settings-test-result--error">
            <p>
              {zhCN.settingsPage.testFailed}：{testState.message}
            </p>
            {testState.detail ? (
              <pre className="settings-error-detail">{testState.detail}</pre>
            ) : null}
          </div>
        ) : null}

        <div className="settings-usage">
          <div className="settings-usage__header">
            <span className="ui-field__label">{zhCN.settingsPage.usageTitle}</span>
            <span className="settings-hint">
              {zhCN.settingsPage.usageTotal}：{totals.requests} {zhCN.settingsPage.usageRequests} ·{' '}
              {totals.tokensIn.toLocaleString()} in / {totals.tokensOut.toLocaleString()} out
            </span>
          </div>
          <div className="settings-usage__grid">
            {LLM_PROVIDERS.map((item) => (
              <div
                key={item}
                className="settings-usage__item"
              >
                <span className="settings-usage__name">{PROVIDER_LABELS[item]}</span>
                <span className="settings-usage__value">
                  {usage[item].requests} 次 · {usage[item].tokensIn.toLocaleString()} /{' '}
                  {usage[item].tokensOut.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {totals.requests === 0 ? (
            <p className="settings-hint">{zhCN.settingsPage.usageEmpty}</p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
