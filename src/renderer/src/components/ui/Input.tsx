import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, ...props },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx('ui-field', className)}>
      <label
        className="ui-field__label"
        htmlFor={inputId}
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={cx('ui-input', error && 'has-error')}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      />
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
