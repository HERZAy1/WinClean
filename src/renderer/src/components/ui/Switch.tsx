import { useId } from 'react'
import { cx } from '../../lib/cx'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  className?: string
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className
}: SwitchProps): React.JSX.Element {
  const generatedId = useId()
  const labelId = `${generatedId}-label`
  const descriptionId = description ? `${generatedId}-description` : undefined

  return (
    <div className={cx('ui-switch-field', className)}>
      <div className="ui-switch-field__copy">
        <span
          id={labelId}
          className="ui-switch-field__label"
        >
          {label}
        </span>
        {description ? (
          <span
            id={descriptionId}
            className="ui-switch-field__description"
          >
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        className="ui-switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className="ui-switch__thumb" />
      </button>
    </div>
  )
}
