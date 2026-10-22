import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, children, ...props },
  ref
) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const hintId = hint ? `${selectId}-hint` : undefined
  const errorId = error ? `${selectId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx('ui-field', className)}>
      <label
        className="ui-field__label"
        htmlFor={selectId}
      >
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={cx('ui-select', error && 'has-error')}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      >
        {children}
      </select>
      {hint ? (
        <span
          id={hintId}
          className="ui-field__hint"
        >
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={errorId}
          className="ui-field__error"
        >
          {error}
        </span>
      ) : null}
    </div>
  )
})
