import { zhCN } from '../../i18n/zh-CN'
import { formatBytes } from '../../lib/format'

export interface SegmentPercentages {
  body: number
  essential: number
  disposable: number
}

export function segmentPercentages(
  bodyBytes: number,
  essentialBytes: number,
  disposableBytes: number
): SegmentPercentages {
  const total = bodyBytes + essentialBytes + disposableBytes
  if (total <= 0) {
    return { body: 0, essential: 0, disposable: 0 }
  }
  return {
    body: (bodyBytes / total) * 100,
    essential: (essentialBytes / total) * 100,
    disposable: (disposableBytes / total) * 100
  }
}

interface StackedBarProps {
  bodyBytes: number
  essentialBytes: number
  disposableBytes: number
}

export function StackedBar({
  bodyBytes,
  essentialBytes,
  disposableBytes
}: StackedBarProps): React.JSX.Element {
  const percentages = segmentPercentages(bodyBytes, essentialBytes, disposableBytes)

  return (
    <div className="stacked-bar-wrap">
      <div
        className="stacked-bar"
        role="img"
        aria-label={`${zhCN.appsPage.body} ${formatBytes(bodyBytes)}，${zhCN.appsPage.essential} ${formatBytes(
          essentialBytes
        )}，${zhCN.appsPage.disposable} ${formatBytes(disposableBytes)}`}
      >
        <span
          className="stacked-bar__body"
          style={{ width: `${percentages.body}%` }}
        />
        <span
          className="stacked-bar__essential"
          style={{ width: `${percentages.essential}%` }}
        />
        <span
          className="stacked-bar__disposable"
          style={{ width: `${percentages.disposable}%` }}
        />
      </div>
      <div className="stacked-bar__legend">
        <span>
          <i className="legend-dot legend-dot--body" />
          {zhCN.appsPage.body} {formatBytes(bodyBytes)}
        </span>
        <span>
          <i className="legend-dot legend-dot--essential" />
          {zhCN.appsPage.essential} {formatBytes(essentialBytes)}
        </span>
        <span>
          <i className="legend-dot legend-dot--disposable" />
          {zhCN.appsPage.disposable} {formatBytes(disposableBytes)}
        </span>
      </div>
    </div>
  )
}
