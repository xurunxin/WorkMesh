// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidenceDrawer, type EvidenceDrawerItem } from './evidence-drawer'

const item: EvidenceDrawerItem = {
  id: 'artifact-1', type: 'commit', title: 'Acceptance commit', status: 'validated', validationState: 'verified',
  uri: 'https://example.test/artifact', checksum: 'sha256:abc', sourceTool: 'git', createdAt: '2026-08-27T08:00:00.000Z',
  producer: { id: 'agent-1', label: 'Delivery Agent', kind: 'agent' }, principalHuman: { id: 'human-1', label: 'Roadmap Human' },
  sessionId: 'session-1', workItem: { id: 'work-1', label: 'Ship evidence', projectId: 'project-1' },
  plan: { versionId: 'plan-1', stepId: 'step-1', stepLabel: 'Validate' }, action: { id: 'group-1', label: 'Committed exact head', correlationId: 'corr-1' },
  validation: { id: 'check-1', label: 'CI passed', exactHeadSha: 'abc123', currentHeadSha: 'def456' },
  repository: { repository: 'xurunxin/WorkMesh', branch: 'feature', commit: 'abc123', pullRequest: 'https://github.com/xurunxin/WorkMesh/pull/1' },
  freshness: 'current', summary: 'Sanitized acceptance evidence.',
}

afterEach(cleanup)

describe('EvidenceDrawer', () => {
  it('renders rich provenance, canonical relationships, exact-head drift, and technical IDs', () => {
    const close = vi.fn()
    render(<EvidenceDrawer item={item} onClose={close} />)
    expect(screen.getByRole('dialog', { name: 'Acceptance commit' })).toBeVisible()
    expect(screen.getByText('Delivery Agent · agent')).toBeVisible()
    expect(screen.getByText(/Head drift invalidates/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Producing Run' })).toHaveAttribute('href', '/agent-sessions/session-1')
    expect(screen.getByRole('link', { name: 'Validate' })).toHaveAttribute('href', '/agent-sessions/session-1?stepId=step-1&planId=plan-1')
    expect(screen.getByRole('link', { name: 'Open external evidence' })).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByText('Technical Details'))
    expect(screen.getByText('artifact-1')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close evidence' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('shows unsafe external URIs as unavailable and keeps unknown fields explicit', () => {
    render(<EvidenceDrawer item={{ id: 'artifact-2', type: 'file', uri: 'https://secret@example.test/file' }} onClose={() => undefined} />)
    expect(screen.getByText('External URI is not safe to open.')).toBeVisible()
    expect(screen.getAllByText(/Unknown/).length).toBeGreaterThan(2)
  })
})
