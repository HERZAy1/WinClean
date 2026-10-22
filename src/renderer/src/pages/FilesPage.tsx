import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppTreeRoot } from '../../../shared/types'
import { AnalysisPanel } from '../components/analysis/AnalysisPanel'
import { TreeView } from '../components/tree/TreeView'
import type { DiskNodeData } from '../components/tree/tree-model'
import { UnownedPanel } from '../components/unowned/UnownedPanel'
import { Badge, Button, Card } from '../components/ui'
import { zhCN } from '../i18n/zh-CN'
import { formatBytes } from '../lib/format'
import { useAnalysisStore } from '../stores/useAnalysis'
import { useScanStore } from '../stores/useScan'

type Tab = 'tree' | 'unowned'

export function FilesPage(): React.JSX.Element {
  const [scanId, setScanId] = useState<number | null>(null)
  const [roots, setRoots] = useState<AppTreeRoot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('tree')
  const [selected, setSelected] = useState<DiskNodeData | null>(null)
  const analysisActive = useAnalysisStore((state) => state.active)
  const analysisError = useAnalysisStore((state) => state.error)
  const startAnalysis = useAnalysisStore((state) => state.start)
  const scanProgress = useScanStore((state) => state.progress)
  const wasAnalysisActive = useRef(false)

  const loadRoots = useCallback(async (id: number) => {
    setLoading(true)
    setError(null)
    const result = await window.api.tree.getRoots({ scanId: id })
    if (result.ok) {
      setRoots(result.data)
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
      void loadRoots(scanId)
    }
  }, [loadRoots, scanId])

  useEffect(() => {
    if (scanProgress?.stage === 'done') {
      void loadLatest()
    }
  }, [loadLatest, scanProgress?.stage])

  useEffect(() => {
    if (wasAnalysisActive.current && !analysisActive && scanId) {
      void loadRoots(scanId)
    }
    wasAnalysisActive.current = analysisActive
  }, [analysisActive, loadRoots, scanId])

  async function handleAnalyze(): Promise<void> {
    if (!scanId) {
      return
    }
    setError(null)
    const result = await startAnalysis(scanId)
    if (!result.ok) {
      setError(result.error.message)
    }
  }

  async function handleReveal(path: string): Promise<void> {
    const result = await window.api.shell.showItemInFolder({ path })
    if (!result.ok) {
      setError(result.error.message)
    }
  }

  const activeError = error ?? analysisError

  return (
    <section className="page files-page">
      <header className="page__header files-page__header">
        <div>
          <span className="eyebrow">{zhCN.pages.files.eyebrow}</span>
          <h2 className="page__title">{zhCN.pages.files.title}</h2>
          <p className="page__description">{zhCN.pages.files.description}</p>
        </div>
        <div className="files-page__actions">
          <Button
            size="sm"
            variant="secondary"
            disabled={!scanId || loading}
            onClick={() => (scanId ? void loadRoots(scanId) : undefined)}
          >
            {zhCN.filesPage.refresh}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!scanId || analysisActive}
            title={!scanId ? zhCN.filesPage.noScan : undefined}
            onClick={() => void handleAnalyze()}
          >
            {analysisActive ? zhCN.filesPage.analyzing : zhCN.filesPage.startAnalysis}
          </Button>
        </div>
      </header>

      {activeError ? <div className="settings-banner settings-banner--error">{activeError}</div> : null}

      {!scanId ? (
        <Card className="empty-state">
          <div className="empty-state__icon">◎</div>
          <div className="empty-state__copy">
            <h3 className="empty-state__title">{zhCN.pages.files.emptyTitle}</h3>
            <p className="empty-state__description">{zhCN.filesPage.noScan}</p>
          </div>
        </Card>
      ) : (
        <>
          <AnalysisPanel />

          <div className="page-tabs">
            <button
              type="button"
              className={`page-tab${tab === 'tree' ? ' is-active' : ''}`}
              aria-selected={tab === 'tree'}
              onClick={() => setTab('tree')}
            >
              {zhCN.filesPage.tabsTree}
            </button>
            <button
              type="button"
              className={`page-tab${tab === 'unowned' ? ' is-active' : ''}`}
              aria-selected={tab === 'unowned'}
              onClick={() => setTab('unowned')}
            >
              {zhCN.filesPage.tabsUnowned}
            </button>
          </div>

          {loading ? (
            <p className="unowned-empty">{zhCN.drives.loading}</p>
          ) : tab === 'tree' ? (
            <TreeView
              scanId={scanId}
              roots={roots}
              onSelect={setSelected}
            />
          ) : (
            <UnownedPanel scanId={scanId} />
          )}
        </>
      )}

      {selected ? (
        <aside className="node-drawer">
          <header className="node-drawer__header">
            <div>
              <span className="eyebrow">{zhCN.filesPage.detailTitle}</span>
              <h3>{selected.label}</h3>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(null)}
            >
              {zhCN.filesPage.close}
            </Button>
          </header>
          <dl className="node-drawer__list">
            <dt>{zhCN.filesPage.detailSize}</dt>
            <dd>{formatBytes(selected.sizeBytes)}</dd>
            {selected.path ? (
              <>
                <dt>{zhCN.filesPage.detailPath}</dt>
                <dd className="node-drawer__path">{selected.path}</dd>
              </>
            ) : null}
            {selected.confidence !== undefined ? (
              <>
                <dt>{zhCN.filesPage.detailConfidence}</dt>
                <dd>
                  <Badge tone="accent">{Math.round(selected.confidence * 100)}%</Badge>
                </dd>
              </>
            ) : null}
            {selected.reason ? (
              <>
                <dt>{zhCN.filesPage.detailReason}</dt>
                <dd>{selected.reason}</dd>
              </>
            ) : null}
            {selected.kind === 'registry' ? (
              <>
                <dt>{zhCN.filesPage.detailRegistry}</dt>
                <dd>{selected.label}</dd>
              </>
            ) : null}
          </dl>
          {selected.path ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleReveal(selected.path ?? '')}
            >
              {zhCN.filesPage.openInExplorer}
            </Button>
          ) : null}
        </aside>
      ) : null}
    </section>
  )
}
