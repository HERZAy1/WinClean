import { zhCN } from '../../i18n/zh-CN'
import { useAnalysisStore, type AnalysisStatus } from '../../stores/useAnalysis'
import { Badge, Button, Card, ProgressBar } from '../ui'

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_TONE: Record<AnalysisStatus, BadgeTone> = {
  idle: 'neutral',
  running: 'accent',
  done: 'success',
  partial: 'warning',
  failed: 'danger',
  cancelled: 'neutral'
}

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  idle: zhCN.filesPage.aiStatusIdle,
  running: zhCN.filesPage.analyzing,
  done: zhCN.filesPage.aiStatusDone,
  partial: zhCN.filesPage.aiStatusPartial,
  failed: zhCN.filesPage.aiStatusFailed,
  cancelled: zhCN.filesPage.aiStatusCancelled
}

export function AnalysisPanel(): React.JSX.Element {
  const status = useAnalysisStore((state) => state.status)
  const active = useAnalysisStore((state) => state.active)
  const thinking = useAnalysisStore((state) => state.thinking)
  const progress = useAnalysisStore((state) => state.progress)
  const completedBatches = useAnalysisStore((state) => state.completedBatches)
  const failedBatches = useAnalysisStore((state) => state.failedBatches)
  const batchTotal = useAnalysisStore((state) => state.batchTotal)
  const tokensIn = useAnalysisStore((state) => state.tokensIn)
  const tokensOut = useAnalysisStore((state) => state.tokensOut)
  const lastError = useAnalysisStore((state) => state.lastError)
  const cancel = useAnalysisStore((state) => state.cancel)
  const latest = thinking.at(-1)

  const batchText =
    status === 'running' && latest
      ? `${zhCN.filesPage.aiBatch} ${latest.batchIndex}/${latest.batchTotal}`
      : batchTotal > 0
        ? `${zhCN.filesPage.aiBatchTotal} ${batchTotal} · ${zhCN.filesPage.aiBatchSuccess} ${completedBatches} · ${zhCN.filesPage.aiBatchFailed} ${failedBatches}`
        : '—'

  return (
    <Card
      className="analysis-panel"
      heading={zhCN.filesPage.aiTitle}
      actions={<Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>}
    >
      <div className="analysis-panel__body">
        <div className="analysis-panel__meta">
          <span>{batchText}</span>
          <span>
            {zhCN.filesPage.aiFocus}：{latest?.focus ?? '—'}
          </span>
          <span>
            {zhCN.filesPage.aiTokens}：{tokensIn}/{tokensOut}
          </span>
        </div>
        <ProgressBar
          value={(progress?.percent ?? 0) * 100}
          showValue
          label={STATUS_LABEL[status]}
        />
        {lastError ? (
          <p className="analysis-panel__error">
            {zhCN.filesPage.aiLastError}：{lastError}
          </p>
        ) : null}
        {latest?.streamedText ? (
          <pre className="analysis-panel__stream">{latest.streamedText}</pre>
        ) : null}
        {active ? (
          <div className="analysis-panel__actions">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void cancel()}
            >
              {zhCN.filesPage.cancelAnalysis}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
