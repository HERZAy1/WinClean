import type { ReactNode } from 'react'
import { Card } from './ui'

interface PagePlaceholderProps {
  eyebrow: string
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  icon: ReactNode
}

export function PagePlaceholder({
  eyebrow,
  title,
  description,
  emptyTitle,
  emptyDescription,
  icon
}: PagePlaceholderProps): React.JSX.Element {
  return (
    <section className="page">
      <header className="page__header">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="page__title">{title}</h2>
        <p className="page__description">{description}</p>
      </header>

      <Card className="empty-state">
        <div className="empty-state__icon">{icon}</div>
        <div className="empty-state__copy">
          <h3 className="empty-state__title">{emptyTitle}</h3>
          <p className="empty-state__description">{emptyDescription}</p>
        </div>
      </Card>
    </section>
  )
}
