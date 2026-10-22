import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/cx'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  heading?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function Card({
  heading,
  description,
  actions,
  className,
  children,
  ...props
}: CardProps): React.JSX.Element {
  const hasHeader = Boolean(heading || description || actions)

  return (
    <section
      className={cx('ui-card', className)}
      {...props}
    >
      {hasHeader ? (
        <header className="ui-card__header">
          <div className="ui-card__heading-group">
            {heading ? <h3 className="ui-card__heading">{heading}</h3> : null}
            {description ? <p className="ui-card__description">{description}</p> : null}
          </div>
          {actions ? <div className="ui-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className="ui-card__body">{children}</div> : null}
    </section>
  )
}
