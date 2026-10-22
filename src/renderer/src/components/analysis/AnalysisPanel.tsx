import { zhCN } from '../../i18n/zh-CN'
import { useAnalysisStore } from '../../stores/useAnalysis'
import { Badge, Button, Card, ProgressBar } from '../ui'

export function AnalysisPanel(): React.JSX.Element {
  const active = useAnalysisStore((state) => state.active)
  const thinking = useAnalysisStore((state) => state.thinking)
  const progress = useAnalysisStore((state) => state.progress)
  const cancel = useAnalysisStore((state) => state.cancel)
  const latest = thinking.at(-1)

  return (
    <Card
      className="analysis-panel"
      heading={zhCN.filesPage.aiTitle}
      actions={
        <Badge tone={active ? 'accent' : latest?.status === 'failed' ? 'danger' : 'neutral'}>
          {active ? zhCN.filesPage.analyzing : zhCN.filesPage.aiIdle}
        </Badge>
      }
    >
      <div className="analysis-panel__body">
        <div className="analysis-panel__meta">
          <span>
            {zhCN.filesPage.aiBatch}{' '}
            {latest ? `${latest.batchIndex}/${latest.batchTotal}` : '—'}
          </span>
          <span>
            {zhCN.filesPage.aiFocus}：{latest?.focus ?? '—'}
          </span>
          <span>
            {zhCN.filesPage.aiTokens}：{latest?.tokensIn ?? 0}/{latest?.tokensOut ?? 0}
          </span>
        </div>
        <ProgressBar
          value={(progress?.percent ?? 0) * 100}
          showValue
          label={active ? zhCN.filesPage.analyzing : zhCN.filesPage.aiDone}
        />
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
