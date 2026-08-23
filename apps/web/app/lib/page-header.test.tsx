// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './page-header'

describe('PageHeader', () => {
  it('renders title, description, and actions', () => {
    render(<PageHeader title="Issues" description="All work" actions={<button>New</button>} />)
    expect(screen.getByRole('heading', { name: 'Issues' })).toBeInTheDocument()
    expect(screen.getByText('All work')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })
  it('renders a back link when backHref is provided', () => {
    render(<PageHeader backHref="/agents" backLabel="返回智能体注册表" title="Agent" />)
    expect(screen.getByRole('link', { name: '返回智能体注册表' })).toHaveAttribute('href', '/agents')
  })
})
