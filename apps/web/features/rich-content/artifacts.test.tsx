// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiMutation, apiRequest } from '../../app/lib/api'
import { WorkItemArtifacts, type WorkItemArtifactsCopy } from './artifacts'

vi.mock('../../app/lib/api', () => ({
  apiMutation: vi.fn(),
  apiRequest: vi.fn(),
  json: (value: unknown) => ({ 'Content-Type': 'application/json', value }),
}))

vi.mock('./hash', () => ({ createHash: vi.fn(async () => 'fixture-hash') }))

const copy: WorkItemArtifactsCopy = {
  ariaLabel: '附件区域',
  title: '附件',
  provenance: '文件不可变，并保留人类或智能体来源。',
  attachFile: '添加文件',
  inputLabel: '选择要添加的文件',
  cancel: '取消',
  retryUpload: '重试上传',
  cancelUpload: '取消上传',
  formatBytes: bytes => `${bytes} 字节`,
  empty: '暂无附件。',
  fileFallback: '文件',
  verificationTimedOut: '上传验证超时',
  loadErrorFallback: '无法加载附件',
  objectUploadFailed: status => `对象上传失败（${status}）`,
  uploadStatusError: status => `上传状态：${status}`,
  uploadErrorFallback: '上传失败',
  cancelErrorFallback: '无法取消上传',
  phases: {
    preparing: '准备中',
    uploading: '上传中',
    verifying: '验证中',
  },
  phaseAnnouncement: phase => `${phase}附件…`,
}

const mockApiRequest = vi.mocked(apiRequest)
const mockApiMutation = vi.mocked(apiMutation)

describe('WorkItemArtifacts localized copy', () => {
  beforeEach(() => {
    mockApiRequest.mockResolvedValue([])
    mockApiMutation.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders its complete empty-state and input labels from copy', async () => {
    render(<WorkItemArtifacts copy={copy} workItemId="work-1" />)

    expect(screen.getByRole('region', { name: copy.ariaLabel })).toBeVisible()
    expect(screen.getByRole('heading', { name: copy.title })).toBeVisible()
    expect(screen.getByText(copy.provenance)).toBeVisible()
    expect(screen.getByLabelText(copy.inputLabel)).toHaveAttribute('type', 'file')
    expect(await screen.findByText(copy.empty)).toBeVisible()
  })

  it('localizes fallback metadata and byte formatting', async () => {
    mockApiRequest.mockResolvedValueOnce([{
      id: 'artifact-1',
      upload_intent_id: null,
      title: 'run.log',
      mime_type: null,
      size_bytes: 12,
      checksum: null,
      created_at: '2026-08-23T00:00:00.000Z',
      producer_display_name: 'Agent One',
      producer_kind: 'agent',
    }])

    render(<WorkItemArtifacts copy={copy} workItemId="work-1" />)

    expect(await screen.findByText(`${copy.fileFallback} · ${copy.formatBytes(12)}`)).toBeVisible()
  })

  it('localizes upload progress, failure, and recovery actions', async () => {
    let resolvePut: ((value: { ok: boolean; status: number }) => void) | undefined
    const put = new Promise<{ ok: boolean; status: number }>(resolve => { resolvePut = resolve })
    vi.stubGlobal('fetch', vi.fn(() => put))
    mockApiMutation.mockResolvedValueOnce({
      id: 'intent-1',
      uploadUrl: 'https://uploads.example.test/object',
      requiredHeaders: {},
    })

    render(<WorkItemArtifacts copy={copy} workItemId="work-1" />)
    fireEvent.change(screen.getByLabelText(copy.inputLabel), {
      target: { files: [new File(['body'], 'note.txt', { type: 'text/plain' })] },
    })

    expect(await screen.findByText(copy.phaseAnnouncement(copy.phases.uploading))).toBeVisible()
    resolvePut?.({ ok: false, status: 503 })

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.objectUploadFailed(503))
    expect(screen.getByRole('button', { name: copy.retryUpload })).toBeVisible()
    expect(screen.getByRole('button', { name: copy.cancelUpload })).toBeVisible()
    await waitFor(() => expect(mockApiMutation).toHaveBeenCalledTimes(1))
  })
})
