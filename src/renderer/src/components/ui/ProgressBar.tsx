import { cx } from '../../lib/cx'

export interface ProgressBarProps {
  value?: number
  max?: number
  label?: string
  indeterminate?: boolean
  showValue?: boolean
  className?: string
}

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  indeterminate = false,
  showValue = false,
  className
}: ProgressBarProps): React.JSX.Element {
  const safeMax = max > 0 ? max : 100
  const clampedValue = Math.min(Math.max(value, 0), safeMax)
  const percentage = Math.round((clampedValue / safeMax) * 100)

  return (
    <div className={cx('ui-progress', className)}>
      {label || showValue ? (
        <div className="ui-progress__meta">
          {label ? <span className="ui-progress__label">{label}</span> : null}
          {showValue && !indeterminate ? (
            <span className="ui-progress__value">{percentage}%</span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cx('ui-progress__track', indeterminate && 'is-indeterminate')}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={indeterminate ? undefined : clampedValue}
        aria-valuetext={indeterminate ? undefined : `${percentage}%`}
      >
        <span
          className="ui-progress__bar"
          style={indeterminate ? undefined : { width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
