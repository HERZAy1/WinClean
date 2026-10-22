import { useEffect, useState } from 'react'
import type { LlmProvider } from '../../../shared/types'
import { ProviderCard } from '../components/settings/ProviderCard'
import { Card, ProgressBar, Select, Switch } from '../components/ui'
import { zhCN } from '../i18n/zh-CN'
import { formatBytes } from '../lib/format'
import { useSettingsStore } from '../stores/useSettings'
import { useSystemStore } from '../stores/useSystem'
import { useThemeStore, type ThemePreference } from '../stores/useTheme'

export function SettingsPage(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const loading = useSettingsStore((state) => state.loading)
  const error = useSettingsStore((state) => state.error)
  const load = useSettingsStore((state) => state.load)
  const save = useSettingsStore((state) => state.save)
  const setApiKey = useSettingsStore((state) => state.setApiKey)
  const clearApiKey = useSettingsStore((state) => state.clearApiKey)
  const testConnection = useSettingsStore((state) => state.testConnection)
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const drives = useSystemStore((state) => state.drives)
  const drivesLoading = useSystemStore((state) => state.drivesLoading)
  const drivesError = useSystemStore((state) => state.drivesError)
  const loadDrives = useSystemStore((state) => state.loadDrives)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void load()
    void loadDrives()
  }, [load, loadDrives])

  async function handleProviderSave(
    provider: LlmProvider,
    values: { baseUrl: string; modelId: string }
  ): Promise<void> {
    if (!settings) {
      return
    }

    const providers =
      provider === 'openai'
        ? {
            ...settings.providers,
            openai: { ...settings.providers.openai, ...values }
          }
        : {
            ...settings.providers,
            anthropic: { ...settings.providers.anthropic, ...values }
          }

    const result = await save({ providers })
    setNotice(result.ok ? zhCN.settingsPage.providerSaved : null)
  }

  async function handleSetApiKey(provider: LlmProvider, apiKey: string): Promise<boolean> {
    const result = await setApiKey(provider, apiKey)
    return result.ok
  }

  async function handleClearApiKey(provider: LlmProvider): Promise<void> {
    await clearApiKey(provider)
  }

  async function handleThemeChange(value: string): Promise<void> {
    const nextTheme = value as ThemePreference
    setTheme(nextTheme)
    setNotice(zhCN.settingsPage.saved)
  }

  async function handleCleanModeChange(value: string): Promise<void> {
    if (!settings) {
      return
    }

    if (value === 'permanent' && !window.confirm(zhCN.settingsPage.permanentConfirm)) {
      return
    }

    const result = await save({ cleanMode: value === 'permanent' ? 'permanent' : 'recycle' })
    setNotice(result.ok ? zhCN.settingsPage.saved : null)
  }

  async function handlePrivacyChange(checked: boolean): Promise<void> {
    const result = await save({ privacyConsent: checked })
    setNotice(result.ok ? zhCN.settingsPage.saved : null)
  }

  async function handleActiveProvider(provider: LlmProvider): Promise<void> {
    const result = await save({ activeProvider: provider })
    setNotice(result.ok ? zhCN.settingsPage.saved : null)
  }

  async function handleDriveToggle(letter: string, checked: boolean): Promise<void> {
    if (!settings) {
      return
    }

    const selected = new Set(settings.scanDrives)
    if (checked) {
      selected.add(letter)
    } else {
      selected.delete(letter)
    }

    const result = await save({ scanDrives: [...selected].sort() })
    setNotice(result.ok ? zhCN.settingsPage.saved : null)
  }

  return (
    <section className="page settings-page">
      <header className="page__header">
        <span className="eyebrow">{zhCN.pages.settings.eyebrow}</span>
        <h2 className="page__title">{zhCN.pages.settings.title}</h2>
        <p className="page__description">{zhCN.pages.settings.description}</p>
      </header>

      {error ? (
        <div
          className="settings-banner settings-banner--error"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {notice ? <div className="settings-banner">{notice}</div> : null}

      {loading || !settings ? (
        <Card>
          <p className="settings-hint">{zhCN.settingsPage.loading}</p>
        </Card>
      ) : (
        <div className="settings-layout">
          <Card heading={zhCN.settingsPage.activeProvider}>
            <fieldset className="provider-choice">
              <legend className="visually-hidden">{zhCN.settingsPage.activeProvider}</legend>
              {(['openai', 'anthropic'] as const).map((provider) => (
                <label
                  key={provider}
                  className="provider-choice__item"
                >
                  <input
                    type="radio"
                    name="active-provider"
                    checked={settings.activeProvider === provider}
                    onChange={() => void handleActiveProvider(provider)}
                  />
                  <span>
                    {provider === 'openai'
                      ? zhCN.settingsPage.openai
                      : zhCN.settingsPage.anthropic}
                  </span>
                </label>
              ))}
            </fieldset>
          </Card>

          <div className="settings-provider-grid">
            <ProviderCard
              provider="openai"
              config={settings.providers.openai}
              onSaveConfig={(values) => handleProviderSave('openai', values)}
              onSetApiKey={(apiKey) => handleSetApiKey('openai', apiKey)}
              onClearApiKey={() => handleClearApiKey('openai')}
              onTestConnection={() => testConnection('openai')}
            />
            <ProviderCard
              provider="anthropic"
              config={settings.providers.anthropic}
              onSaveConfig={(values) => handleProviderSave('anthropic', values)}
              onSetApiKey={(apiKey) => handleSetApiKey('anthropic', apiKey)}
              onClearApiKey={() => handleClearApiKey('anthropic')}
              onTestConnection={() => testConnection('anthropic')}
            />
          </div>

          <Card heading={zhCN.settingsPage.privacyTitle}>
            <div className="settings-privacy">
              <p className="settings-privacy__text">{zhCN.settingsPage.privacyDescription}</p>
              <Switch
                checked={settings.privacyConsent}
                onCheckedChange={(checked) => void handlePrivacyChange(checked)}
                label={zhCN.settingsPage.privacySwitch}
              />
            </div>
          </Card>

          <Card heading={zhCN.settingsPage.generalTitle}>
            <div className="settings-general">
              <Select
                label={zhCN.settingsPage.theme}
                value={theme}
                onChange={(event) => void handleThemeChange(event.target.value)}
              >
                <option value="system">{zhCN.settingsPage.themeSystem}</option>
                <option value="light">{zhCN.settingsPage.themeLight}</option>
                <option value="dark">{zhCN.settingsPage.themeDark}</option>
              </Select>

              <Select
                label={zhCN.settingsPage.cleanMode}
                value={settings.cleanMode}
                onChange={(event) => void handleCleanModeChange(event.target.value)}
              >
                <option value="recycle">{zhCN.settingsPage.cleanRecycle}</option>
                <option value="permanent">{zhCN.settingsPage.cleanPermanent}</option>
              </Select>

              <div className="settings-drives">
                <span className="ui-field__label">{zhCN.settingsPage.scanDrives}</span>
                <p className="settings-hint">{zhCN.settingsPage.scanDrivesHint}</p>
                {drivesLoading ? (
                  <p className="settings-hint">{zhCN.drives.loading}</p>
                ) : drivesError ? (
                  <p className="settings-test-result settings-test-result--error">{drivesError}</p>
                ) : drives.length === 0 ? (
                  <p className="settings-hint">{zhCN.drives.select}</p>
                ) : (
                  <div className="drive-list">
                    {drives.map((drive) => {
                      const checked = settings.scanDrives.includes(drive.letter)
                      const label = drive.label || drive.fsType || drive.letter

                      return (
                        <label
                          key={drive.letter}
                          className={`drive-option${checked ? ' is-selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              void handleDriveToggle(drive.letter, event.target.checked)
                            }
                          />
                          <div className="drive-option__body">
                            <div className="drive-option__header">
                              <span className="drive-option__letter">{drive.letter}:</span>
                              <span className="drive-option__label">{label}</span>
                              <span className="drive-option__size">
                                {formatBytes(drive.usedBytes)} / {formatBytes(drive.totalBytes)}
                              </span>
                            </div>
                            <ProgressBar
                              value={drive.usedBytes}
                              max={drive.totalBytes}
                              label={`${drive.letter}: ${zhCN.drives.used}`}
                            />
                            <span className="drive-option__free">
                              {zhCN.drives.free} {formatBytes(drive.freeBytes)}
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </section>
  )
}
