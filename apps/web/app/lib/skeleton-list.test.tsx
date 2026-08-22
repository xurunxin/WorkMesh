// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SkeletonList } from './skeleton-list'

describe('SkeletonList', () => {
  it('renders the default 6 rows', () => {
    const { container } = render(<SkeletonList />)
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(6)
  })
  it('respects row and column counts', () => {
    const { container } = render(<SkeletonList rows={3} columns={2} />)
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(6)
  })
})
