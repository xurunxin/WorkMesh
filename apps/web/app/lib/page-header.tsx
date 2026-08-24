import type { ReactNode } from 'react'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
} & (
  | { backHref: string; backLabel: string }
  | { backHref?: undefined; backLabel?: undefined }
)

export function PageHeader({ title, description, actions, backHref, backLabel }: PageHeaderProps) {
  return <header className="page-header">
    <div className="page-header-text">
      {backHref && <a aria-label={backLabel} className="page-header-back" href={backHref}><ArrowLeft size={18} weight="bold" /></a>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
}
