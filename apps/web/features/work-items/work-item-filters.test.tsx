// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkItemFilters } from '@workmesh/ui'

// Testing Library's automatic cleanup only fires when the test environment
// is `jsdom` and the project has been initialized for it; in this monorepo
// the suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated.
afterEach(() => { cleanup() })

describe('WorkItemFilters compact mode', () => {
  it('marks only its visible Search input as the page hotkey filter', () => {
    render(<WorkItemFilters value={{}} onChange={() => {}} />)
    expect(screen.getByLabelText(/search/i)).toHaveAttribute('data-hotkey-filter', 'true')
    expect(document.querySelectorAll('[data-hotkey-filter="true"]')).toHaveLength(1)
  })

  it('keeps only search and filter actions visible when compact is true', () => {
    render(<WorkItemFilters compact projects={[{ id: 'project-1', label: 'Project' }]} statuses={[{ id: 'status-1', label: 'Ready' }]} value={{}} onChange={() => {}} />)
    expect(screen.queryByLabelText(/^Status$/i)).toBeNull()
    expect(screen.queryByLabelText(/^Priority$/i)).toBeNull()
    expect(screen.queryByLabelText(/responsible human/i)).toBeNull()
    expect(screen.queryByLabelText(/^Project$/i)).toBeNull()
    expect(screen.queryByLabelText(/milestone/i)).toBeNull()
    expect(screen.queryByLabelText(/label/i)).toBeNull()
  })

  it('shows Milestone and Label when compact is not set', () => {
    render(<WorkItemFilters value={{}} onChange={() => {}} />)
    expect(screen.getByLabelText(/milestone/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/label/i)).toBeInTheDocument()
  })

  it('omits the More filters toggle when compact is not set', () => {
    render(<WorkItemFilters value={{}} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /more filters/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fewer filters/i })).toBeNull()
  })

  it('renders the More filters toggle when compact is true', () => {
    render(<WorkItemFilters compact value={{}} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /more filters/i })).toBeInTheDocument()
  })

  it('expands the advanced fields when the More filters button is pressed', () => {
    render(<WorkItemFilters compact projects={[{ id: 'project-1', label: 'Project' }]} statuses={[{ id: 'status-1', label: 'Ready' }]} value={{}} onChange={() => {}} />)
    expect(screen.queryByLabelText(/milestone/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    expect(screen.getByLabelText(/^Status$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Project$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/milestone/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/label/i)).toBeInTheDocument()
  })

  it('collapses the advanced fields again via the Fewer filters button', () => {
    render(<WorkItemFilters compact value={{}} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    expect(screen.getByLabelText(/milestone/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /fewer filters/i }))
    expect(screen.queryByLabelText(/milestone/i)).toBeNull()
  })

  it('still propagates filter changes while the advanced fields are collapsed', () => {
    const onChange = vi.fn()
    render(<WorkItemFilters compact onChange={onChange} value={{}} />)
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'WM-7' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'WM-7' }))
  })

  it('notifies onCompactChange when the toggle is pressed in compact mode', () => {
    const onCompactChange = vi.fn()
    render(<WorkItemFilters compact onChange={() => {}} onCompactChange={onCompactChange} value={{}} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    expect(onCompactChange).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: /fewer filters/i }))
    expect(onCompactChange).toHaveBeenLastCalledWith(true)
  })
})
