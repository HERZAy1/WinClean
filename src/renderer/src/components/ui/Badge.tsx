import type { HTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx('ui-badge', `ui-badge--${tone}`, className)}
      {...props}
    >
      {children}
    </span>
  )
}
