import type { ReactNode } from 'react'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'

export function PageHeader({ title, description, actions, backHref }: { title: string; description?: string; actions?: ReactNode; backHref?: string }) {
  return <header className="page-header">
    <div className="page-header-text">
      {backHref && <a aria-label="Back" className="page-header-back" href={backHref}><ArrowLeft size={18} weight="bold" /></a>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
}
