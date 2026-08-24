// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SkeletonList } from './skeleton-list'

describe('SkeletonList', () => {
  it('owns one localized busy status while every requested cell is decorative', () => {
    const { container } = render(<SkeletonList columns={3} items={5} label="Loading Agents" />)
    const owner = screen.getByRole('status', { name: 'Loading Agents' })
    const cells = container.querySelectorAll('.skeleton-list-cell')

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(owner).toHaveAttribute('aria-busy', 'true')
    expect(owner).toHaveStyle({ '--columns': '3' })
    expect(cells).toHaveLength(5)
    for (const cell of cells) {
      expect(cell).toHaveAttribute('aria-hidden', 'true')
      expect(cell).toHaveAttribute('role', 'presentation')
      expect(cell).not.toHaveAttribute('aria-busy')
      expect(cell).not.toHaveAttribute('aria-label')
    }
    expect(within(owner).queryAllByRole('status')).toHaveLength(0)
    expect(owner.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0)
  })
})
