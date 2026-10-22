import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CleanItem,
  CleanLogEntry,
  CleanPlan,
  CleanResult,
  SizeBreakdown
} from '../../../shared/types'
import { AnalysisPanel } from '../components/analysis/AnalysisPanel'
import { StackedBar } from '../components/apps/StackedBar'
import { Badge, Button, Card, Select, Switch } from '../components/ui'
import { zhCN } from '../i18n/zh-CN'
import { formatBytes } from '../lib/format'
import { useAnalysisStore } from '../stores/useAnalysis'
import { useScanStore } from '../stores/useScan'

type SortKey = 'total' | 'disposable' | 'name'
const HUNDRED_MB = 100 * 1024 * 1024

function riskTone(risk: CleanItem['riskLevel']): 'success' | 'warning' | 'danger' {
  if (risk === 'low') {
    return 'success'
  }
  if (risk === 'medium') {
    return 'warning'
  }
  return 'danger'
}

function sourceLabel(source: CleanItem['source']): string {
  return source === 'llm' ? zhCN.appsPage.sourceLlm : zhCN.appsPage.sourceRule
}

export function AppsPage(): React.JSX.Element {
  const [scanId, setScanId] = useState<number | null>(null)
  const [apps, setApps] = useState<SizeBreakdown[]>([])
  const [details, setDetails] = useState<Record<string, SizeBreakdown>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [filterLarge, setFilterLarge] = useState(false)
  const [preview, setPreview] = useState<CleanPlan | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [executing, setExecuting] = useState(false)
  const [cleanResult, setCleanResult] = useState<CleanResult | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logEntries, setLogEntries] = useState<CleanLogEntry[]>([])
  const analysisActive = useAnalysisStore((state) => state.active)
  const analysisError = useAnalysisStore((state) => state.error)
  const startAnalysis = useAnalysisStore((state) => state.start)
  const scanProgress = useScanStore((state) => state.progress)
  const wasAnalysisActive = useRef(false)

  const loadApps = useCallback(async (id: number) => {
    setLoading(true)
    setError(null)
    const result = await window.api.apps.list({ scanId: id })
    if (result.ok) {
      setApps(result.data)
    } else {
      setError(result.error.message)
    }
    setLoading(false)
  }, [])

  const loadLatest = useCallback(async () => {
    const result = await window.api.scan.latest()
    if (result.ok && result.data) {
      setScanId(result.data.scanId)
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLatest()
  }, [loadLatest])

  useEffect(() => {
    if (scanId) {
      void loadApps(scanId)
    }
  }, [loadApps, scanId])

  useEffect(() => {
    if (scanProgress?.stage === 'done') {
      void loadLatest()
    }
  }, [loadLatest, scanProgress?.stage])

  useEffect(() => {
    if (wasAnalysisActive.current && !analysisActive && scanId) {
      void loadApps(scanId)
    }
    wasAnalysisActive.current = analysisActive
  }, [analysisActive, loadApps, scanId])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = apps.filter((app) => {
      if (filterLarge && app.disposableCacheBytes <= HUNDRED_MB) {
        return false
      }
      if (!query) {
        return true
      }
      return (
        app.appName.toLowerCase().includes(query) ||
        (app.publisher ?? '').toLowerCase().includes(query)
      )
    })
    return rows.sort((a, b) => {
      if (sortKey === 'name') {
        return a.appName.localeCompare(b.appName)
      }
      if (sortKey === 'disposable') {
        return b.disposableCacheBytes - a.disposableCacheBytes
      }
      return b.totalBytes - a.totalBytes
    })
  }, [apps, filterLarge, search, sortKey])

  const summary = useMemo(
    () =>
      apps.reduce(
        (total, app) => {
          total.bytes += app.totalBytes
          total.disposable += app.disposableCacheBytes
          return total
        },
        { bytes: 0, disposable: 0 }
      ),
    [apps]
  )

  async function handleExpand(appId: string): Promise<void> {
    if (expanded === appId) {
      setExpanded(null)
      return
    }
    setExpanded(appId)
    if (details[appId] || !scanId) {
      return
    }
    const result = await window.api.apps.getBreakdown({ scanId, appId })
    if (result.ok) {
      setDetails((current) => ({ ...current, [appId]: result.data }))
    } else {
      setError(result.error.message)
    }
  }

  async function handlePreview(appIds: string[]): Promise<void> {
    if (!scanId || appIds.length === 0) {
      return
    }
    setPreviewLoading(true)
    setError(null)
    const result = await window.api.clean.preview({
      scanId,
      appIds,
      includeEssential: true
    })
    setPreviewLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setPreview(result.data)
    setConfirmText('')
    setSelectedPaths(
      new Set(
        result.data.items
          .filter((item) => item.category === 'disposableCache')
          .map((item) => item.path)
      )
    )
  }

  async function handleExecute(): Promise<void> {
    if (!preview || selectedPaths.size === 0) {
      return
    }
    if (
      preview.mode === 'permanent' &&
      confirmText.trim() !== zhCN.appsPage.permanentConfirmWord
    ) {
      return
    }

    setExecuting(true)
    const result = await window.api.clean.execute({
      planId: preview.planId,
      selectedPaths: [...selectedPaths]
    })
    setExecuting(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setCleanResult(result.data)
    setPreview(null)
    setConfirmText('')
    if (scanId) {
      void loadApps(scanId)
    }
    void loadLog()
  }

  async function loadLog(): Promise<void> {
    const result = await window.api.clean.log({ limit: 50 })
    if (result.ok) {
      setLogEntries(result.data)
    }
  }

  function openLog(): void {
    setLogOpen(true)
    void loadLog()
  }

  async function handleAnalyze(): Promise<void> {
    if (!scanId) {
      return
    }
    const result = await startAnalysis(scanId)
    if (!result.ok) {
      setError(result.error.message)
    }
  }

  const activeError = error ?? analysisError

  return (
    <section className="page apps-page">
      <header className="page__header files-page__header">
        <div>
          <span className="eyebrow">{zhCN.pages.apps.eyebrow}</span>
          <h2 className="page__title">{zhCN.pages.apps.title}</h2>
          <p className="page__description">{zhCN.pages.apps.description}</p>
        </div>
        <div className="files-page__actions">
          <Button
            size="sm"
            variant="secondary"
            disabled={!scanId || loading}
            onClick={() => (scanId ? void loadApps(scanId) : undefined)}
          >
            {zhCN.appsPage.refresh}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!scanId || analysisActive}
            onClick={() => void handleAnalyze()}
          >
            {analysisActive ? zhCN.appsPage.analyzing : zhCN.appsPage.analyze}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={openLog}
          >
            {zhCN.appsPage.log}
          </Button>
        </div>
      </header>

      {activeError ? <div className="settings-banner settings-banner--error">{activeError}</div> : null}
      <AnalysisPanel />

      {!scanId ? (
        <Card className="empty-state">
          <div className="empty-state__icon">◎</div>
          <div className="empty-state__copy">
            <h3 className="empty-state__title">{zhCN.pages.apps.emptyTitle}</h3>
            <p className="empty-state__description">{zhCN.pages.apps.emptyDescription}</p>
          </div>
        </Card>
      ) : loading ? (
        <p className="unowned-empty">{zhCN.drives.loading}</p>
      ) : apps.length === 0 ? (
        <Card className="empty-state">
          <div className="empty-state__icon">◎</div>
          <div className="empty-state__copy">
            <h3 className="empty-state__title">{zhCN.pages.apps.emptyTitle}</h3>
            <p className="empty-state__description">{zhCN.appsPage.noApps}</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="apps-summary">
            <Card heading={zhCN.appsPage.summaryApps}>
              <span className="apps-summary__value">{apps.length}</span>
            </Card>
            <Card heading={zhCN.appsPage.summaryTotal}>
              <span className="apps-summary__value">{formatBytes(summary.bytes)}</span>
            </Card>
            <Card heading={zhCN.appsPage.summaryDisposable}>
              <span className="apps-summary__value apps-summary__value--accent">
                {formatBytes(summary.disposable)}
              </span>
            </Card>
          </div>

          <div className="apps-toolbar">
            <input
              className="ui-input apps-search"
              value={search}
              placeholder={zhCN.appsPage.searchPlaceholder}
              aria-label={zhCN.appsPage.searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              label={zhCN.appsPage.sort}
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="total">{zhCN.appsPage.sortTotal}</option>
              <option value="disposable">{zhCN.appsPage.sortDisposable}</option>
              <option value="name">{zhCN.appsPage.sortName}</option>
            </Select>
            <Switch
              checked={filterLarge}
              onCheckedChange={setFilterLarge}
              label={zhCN.appsPage.filterLarge}
            />
          </div>

          <div className="apps-table">
            <div className="apps-header">
              <span>{zhCN.pages.apps.title}</span>
              <span>{zhCN.appsPage.summaryTotal}</span>
              <span>{zhCN.appsPage.disposable}</span>
              <span />
            </div>
            {filtered.map((app) => {
              const detail = details[app.appId]
              const isExpanded = expanded === app.appId
              return (
                <div
                  key={app.appId}
                  className="apps-row-wrap"
                >
                  <div className="apps-row">
                    <div className="apps-row__name">
                      <span className="apps-avatar">{app.appName.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{app.appName}</strong>
                        <span>{app.publisher || zhCN.appsPage.noPublisher}</span>
                      </div>
                    </div>
                    <span className="apps-row__size">{formatBytes(app.totalBytes)}</span>
                    <span className="apps-row__disposable">
                      {formatBytes(app.disposableCacheBytes)}
                    </span>
                    <div className="apps-row__actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={isExpanded}
                        onClick={() => void handleExpand(app.appId)}
                      >
                        {isExpanded ? zhCN.appsPage.collapse : zhCN.appsPage.expand}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={previewLoading}
                        onClick={() => void handlePreview([app.appId])}
                      >
                        {zhCN.appsPage.clean}
                      </Button>
                    </div>
                  </div>
                  <div className="apps-row__bar">
                    <StackedBar
                      bodyBytes={app.bodyBytes}
                      essentialBytes={app.essentialCacheBytes}
                      disposableBytes={app.disposableCacheBytes}
                    />
                  </div>
                  {isExpanded ? (
                    <div className="app-detail">
                      {detail ? (
                        <AppDetail detail={detail} />
                      ) : (
                        <p className="settings-hint">{zhCN.drives.loading}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="apps-footer">
            <Button
              variant="ghost"
              onClick={openLog}
            >
              {zhCN.appsPage.log}
            </Button>
            <Button
              variant="primary"
              disabled={previewLoading}
              onClick={() => void handlePreview(filtered.map((app) => app.appId))}
            >
              {zhCN.appsPage.cleanAll}
            </Button>
          </div>
        </>
      )}

      {preview ? (
        <div className="modal-backdrop">
          <div
            className="clean-modal"
            role="dialog"
            aria-modal="true"
            aria-label={zhCN.appsPage.previewTitle}
          >
            <header className="clean-modal__header">
              <div>
                <span className="eyebrow">{zhCN.appsPage.previewTitle}</span>
                <h3>
                  {zhCN.appsPage.previewTotal} {formatBytes(preview.estimatedFreeBytes)}
                </h3>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPreview(null)}
              >
                {zhCN.appsPage.previewCancel}
              </Button>
            </header>
            <p className="settings-hint">
              {zhCN.appsPage.selectedCount.replace('{count}', String(selectedPaths.size))}
            </p>
            {preview.items.length === 0 ? (
              <p className="unowned-empty">{zhCN.appsPage.previewEmpty}</p>
            ) : (
              <div className="clean-modal__items">
                {(['disposableCache', 'essentialCache'] as const).map((category) => {
                  const items = preview.items.filter((item) => item.category === category)
                  if (items.length === 0) {
                    return null
                  }
                  return (
                    <section
                      key={category}
                      className="clean-modal__group"
                    >
                      <h4>
                        {category === 'disposableCache'
                          ? zhCN.appsPage.previewDisposable
                          : zhCN.appsPage.previewEssential}
                      </h4>
                      {category === 'essentialCache' ? (
                        <p className="clean-modal__warning">{zhCN.appsPage.previewEssentialWarning}</p>
                      ) : null}
                      {items.map((item) => (
                        <label
                          key={item.path}
                          className="clean-modal__item"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPaths.has(item.path)}
                            onChange={(event) =>
                              setSelectedPaths((current) => {
                                const next = new Set(current)
                                if (event.target.checked) {
                                  next.add(item.path)
                                } else {
                                  next.delete(item.path)
                                }
                                return next
                              })
                            }
                          />
                          <span className="clean-modal__path">{item.path}</span>
                          <span>{formatBytes(item.sizeBytes)}</span>
                          <Badge tone={riskTone(item.riskLevel)}>
                            {zhCN.filesPage.riskLabels[item.riskLevel]}
                          </Badge>
                          <span className="settings-hint">{item.reason}</span>
                        </label>
                      ))}
                    </section>
                  )
                })}
              </div>
            )}
            <div className="clean-modal__confirm">
              <p className="settings-hint">
                {zhCN.appsPage.executeHint
                  .replace('{count}', String(selectedPaths.size))
                  .replace('{size}', formatBytes(preview.estimatedFreeBytes))}
              </p>
              {preview.mode === 'permanent' ? (
                <label className="clean-modal__confirm-field">
                  <span>{zhCN.appsPage.permanentConfirmLabel}</span>
                  <input
                    className="ui-input"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <footer className="clean-modal__footer">
              <Button
                variant="secondary"
                onClick={() => setPreview(null)}
              >
                {zhCN.appsPage.previewCancel}
              </Button>
              <Button
                variant="primary"
                disabled={
                  executing ||
                  selectedPaths.size === 0 ||
                  (preview.mode === 'permanent' &&
                    confirmText.trim() !== zhCN.appsPage.permanentConfirmWord)
                }
                onClick={() => void handleExecute()}
              >
                {executing ? zhCN.appsPage.executing : zhCN.appsPage.previewExecute}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {cleanResult ? (
        <div className="modal-backdrop">
          <div
            className="clean-modal clean-result"
            role="dialog"
            aria-modal="true"
            aria-label={zhCN.appsPage.resultTitle}
          >
            <header className="clean-modal__header">
              <div>
                <span className="eyebrow">{zhCN.appsPage.resultTitle}</span>
                <h3>
                  {zhCN.appsPage.resultFreed} {formatBytes(cleanResult.freedBytes)}
                </h3>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCleanResult(null)}
              >
                {zhCN.appsPage.previewCancel}
              </Button>
            </header>
            <p className="settings-hint">
              {cleanResult.succeeded.length} /{' '}
              {cleanResult.succeeded.length + cleanResult.skipped.length}
            </p>
            {cleanResult.skipped.length > 0 ? (
              <div className="clean-result__skipped">
                <h4>
                  {zhCN.appsPage.resultSkipped} {cleanResult.skipped.length}
                </h4>
                {cleanResult.skipped.map((item) => (
                  <div
                    key={`${item.path}-${item.reason}`}
                    className="clean-result__skip-row"
                  >
                    <span className="clean-modal__path">{item.path}</span>
                    <Badge tone="warning">{item.reason}</Badge>
                    <span className="settings-hint">{item.detail ?? ''}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <footer className="clean-modal__footer">
              <Button
                variant="primary"
                onClick={() => setCleanResult(null)}
              >
                {zhCN.appsPage.previewCancel}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {logOpen ? (
        <aside className="node-drawer clean-log-drawer">
          <header className="node-drawer__header">
            <div>
              <span className="eyebrow">{zhCN.appsPage.log}</span>
              <h3>{zhCN.appsPage.log}</h3>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLogOpen(false)}
            >
              {zhCN.appsPage.previewCancel}
            </Button>
          </header>
          {logEntries.length === 0 ? (
            <p className="unowned-empty">{zhCN.appsPage.logEmpty}</p>
          ) : (
            <div className="clean-log">
              {logEntries.map((entry) => (
                <div
                  key={`${entry.ts}-${entry.path}`}
                  className="clean-log__row"
                >
                  <span className="clean-modal__path">{entry.path}</span>
                  <span>{formatBytes(entry.sizeBytes)}</span>
                  <Badge
                    tone={
                      entry.result === 'skipped'
                        ? 'warning'
                        : entry.result === 'deleted'
                          ? 'danger'
                          : 'success'
                    }
                  >
                    {entry.result === 'trashed'
                      ? zhCN.appsPage.logResultTrashed
                      : entry.result === 'deleted'
                        ? zhCN.appsPage.logResultDeleted
                        : zhCN.appsPage.logResultSkipped}
                  </Badge>
                  <span className="settings-hint">{entry.detail ?? ''}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      ) : null}
    </section>
  )
}

function AppDetail({ detail }: { detail: SizeBreakdown }): React.JSX.Element {
  return (
    <div className="app-detail__groups">
      {(['disposableCache', 'essentialCache', 'body'] as const).map((category) => {
        const items = detail.items.filter((item) => item.category === category)
        if (items.length === 0) {
          return null
        }
        return (
          <section key={category}>
            <h4>
              {category === 'body'
                ? zhCN.appsPage.body
                : category === 'essentialCache'
                  ? zhCN.appsPage.essential
                  : zhCN.appsPage.disposable}
            </h4>
            {items.slice(0, 50).map((item) => (
              <div
                key={item.path}
                className="app-detail__item"
              >
                <span className="app-detail__path">{item.path}</span>
                <span>{formatBytes(item.sizeBytes)}</span>
                <Badge tone={riskTone(item.riskLevel)}>
                  {zhCN.filesPage.riskLabels[item.riskLevel]}
                </Badge>
                <span className="settings-hint">{sourceLabel(item.source)}</span>
                <span className="settings-hint">{item.reason}</span>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
