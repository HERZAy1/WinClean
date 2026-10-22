import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { FileNode, UnownedExplain } from '../../../../shared/types'
import { zhCN } from '../../i18n/zh-CN'
import { formatBytes } from '../../lib/format'
import { Badge, Button, Select } from '../ui'

type UnownedRow = FileNode & { explain?: UnownedExplain }

interface UnownedPanelProps {
  scanId: number
  virtualize?: boolean
}

function kindLabel(kind: UnownedExplain['kind']): string {
  return zhCN.filesPage.kindLabels[kind]
}

function riskTone(risk: UnownedExplain['riskLevel']): 'success' | 'warning' | 'danger' {
  if (risk === 'low') {
    return 'success'
  }
  if (risk === 'medium') {
    return 'warning'
  }
  return 'danger'
}

export function UnownedPanel({ scanId, virtualize = true }: UnownedPanelProps): React.JSX.Element {
  const [items, setItems] = useState<UnownedRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState('all')
  const [sortDesc, setSortDesc] = useState(true)
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void window.api.unowned
      .list({ scanId, offset: 0, limit: 500 })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.ok) {
          setItems(result.data.items)
          setTotal(result.data.total)
        } else {
          setError(result.error.message)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(zhCN.drives.loadFailed)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [scanId])

  const filtered = useMemo(() => {
    const rows = items.filter((item) => kind === 'all' || item.explain?.kind === kind)
    return rows.sort((a, b) => (sortDesc ? b.sizeBytes - a.sizeBytes : a.sizeBytes - b.sizeBytes))
  }, [items, kind, sortDesc])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 8
  })

  async function analyze(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return
    }
    setAnalyzing((current) => new Set([...current, ...paths]))
    setError(null)
    const result = await window.api.unowned.explain({ paths })
    setAnalyzing((current) => {
      const next = new Set(current)
      for (const path of paths) {
        next.delete(path)
      }
      return next
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const byPath = new Map(result.data.map((explain) => [explain.path, explain]))
    setItems((current) =>
      current.map((item) => (byPath.has(item.path) ? { ...item, explain: byPath.get(item.path) } : item))
    )
  }

  function renderRow(item: UnownedRow): React.JSX.Element {
    return (
      <div
        key={item.path}
        className="unowned-row"
      >
        <span className="unowned-row__path" title={item.path}>
          {item.path}
        </span>
        <span className="unowned-row__size">{formatBytes(item.sizeBytes)}</span>
        <span className="unowned-row__summary">{item.explain?.summary ?? '—'}</span>
        <span>
          {item.explain ? (
            <Badge tone="accent">{kindLabel(item.explain.kind)}</Badge>
          ) : (
            <span className="unowned-row__muted">—</span>
          )}
        </span>
        <span>
          {item.explain ? (
            <Badge tone={riskTone(item.explain.riskLevel)}>
              {zhCN.filesPage.riskLabels[item.explain.riskLevel]}
            </Badge>
          ) : (
            <span className="unowned-row__muted">—</span>
          )}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={analyzing.has(item.path)}
          onClick={() => void analyze([item.path])}
        >
          {analyzing.has(item.path) ? zhCN.filesPage.analyzingRow : zhCN.filesPage.analyze}
        </Button>
      </div>
    )
  }

  return (
    <div className="unowned-panel">
      <div className="unowned-toolbar">
        <div className="unowned-toolbar__filters">
          <Select
            label={zhCN.filesPage.filterKind}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">{zhCN.filesPage.allKinds}</option>
            {Object.entries(zhCN.filesPage.kindLabels).map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSortDesc((value) => !value)}
          >
            {sortDesc ? zhCN.filesPage.sortSizeDesc : zhCN.filesPage.sortSizeAsc}
          </Button>
        </div>
        <div className="unowned-toolbar__actions">
          <span className="unowned-total">
            {zhCN.filesPage.totalItems.replace('{total}', String(total))}
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={analyzing.size > 0 || filtered.length === 0}
            onClick={() => void analyze(filtered.map((item) => item.path))}
          >
            {zhCN.filesPage.analyzePage}
          </Button>
        </div>
      </div>

      {error ? <div className="unowned-error">{error}</div> : null}
      {loading ? <p className="unowned-empty">{zhCN.drives.loading}</p> : null}
      {!loading && filtered.length === 0 ? (
        <p className="unowned-empty">{zhCN.filesPage.noUnowned}</p>
      ) : null}

      {filtered.length > 0 ? (
        <div className="unowned-table">
          <div className="unowned-header">
            <span>{zhCN.filesPage.path}</span>
            <span>{zhCN.filesPage.size}</span>
            <span>{zhCN.filesPage.summary}</span>
            <span>{zhCN.filesPage.kind}</span>
            <span>{zhCN.filesPage.risk}</span>
            <span />
          </div>
          {virtualize ? (
            <div
              ref={scrollRef}
              className="unowned-scroll"
            >
              <div
                className="unowned-virtual"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const item = filtered[virtualRow.index]
                  return (
                    <div
                      key={item.path}
                      className="unowned-virtual__item"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {renderRow(item)}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="unowned-scroll unowned-scroll--static">
              {filtered.map((item) => renderRow(item))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
