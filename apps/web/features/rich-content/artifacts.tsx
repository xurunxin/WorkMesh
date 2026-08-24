'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiMutation, apiRequest, json } from '../../app/lib/api'
import { createHash } from './hash'

type Artifact = {
  id: string
  upload_intent_id: string | null
  title: string
  mime_type: string | null
  size_bytes: number | null
  checksum: string | null
  created_at: string
  producer_display_name: string
  producer_kind: string
}
type UploadStatus = {
  id: string
  status: 'pending' | 'uploaded' | 'verified' | 'rejected' | 'expired' | 'canceled'
  artifactId: string | null
  lastErrorCode: string | null
}
type Intent = { id: string; uploadUrl: string; requiredHeaders: Record<string, string> }
export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'verifying' | 'failed'
type ActiveUploadPhase = Exclude<UploadPhase, 'idle' | 'failed'>

export type WorkItemArtifactsCopy = {
  ariaLabel: string
  title: string
  provenance: string
  attachFile: string
  inputLabel: string
  cancel: string
  retryUpload: string
  cancelUpload: string
  formatBytes: (bytes: number) => string
  empty: string
  fileFallback: string
  verificationTimedOut: string
  loadErrorFallback: string
  objectUploadFailed: (status: number) => string
  uploadStatusError: (status: UploadStatus['status']) => string
  uploadErrorFallback: string
  cancelErrorFallback: string
  phases: Record<ActiveUploadPhase, string>
  phaseAnnouncement: (phase: string) => string
}

export const uploadRecoveryActions = (
  phase: UploadPhase,
  hasFile: boolean,
  hasIntent: boolean,
): { retry: boolean; cancel: boolean } => ({
  retry: phase === 'failed' && hasFile,
  cancel: phase === 'failed' && (hasFile || hasIntent),
})

const poll = async (id: string, copy: WorkItemArtifactsCopy): Promise<UploadStatus> => {
  for (let count = 0; count < 40; count += 1) {
    const current = await apiRequest<UploadStatus>(`/api/v1/artifact-upload-intents/${id}`)
    if (!['pending', 'uploaded'].includes(current.status)) return current
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(copy.verificationTimedOut)
}

export function WorkItemArtifacts({ copy, workItemId }: { copy: WorkItemArtifactsCopy; workItemId: string }) {
  const [items, setItems] = useState<Artifact[]>([])
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [error, setError] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const refresh = useCallback(async () => {
    setItems(await apiRequest<Artifact[]>(`/api/v1/work-items/${workItemId}/artifacts`))
  }, [workItemId])
  useEffect(() => {
    void refresh().catch(reason => setError(reason instanceof Error ? reason.message : copy.loadErrorFallback))
  }, [copy.loadErrorFallback, refresh])

  const upload = async (file: File, existingIntent: Intent | null = null) => {
    let currentIntent = existingIntent
    try {
      setError('')
      setPendingFile(file)
      if (!currentIntent) {
        setPhase('preparing')
        const checksum = `sha256:${await createHash(file)}`
        const body = {
          workItemId,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          checksum,
        }
        currentIntent = await apiMutation<Intent>(
          `artifact-upload-request:${workItemId}:${checksum}`,
          '/api/v1/artifact-upload-intents',
          { method: 'POST', headers: json(body), body: JSON.stringify(body) },
        )
        setIntent(currentIntent)
      }
      setPhase('uploading')
      const put = await fetch(currentIntent.uploadUrl, {
        method: 'PUT', headers: currentIntent.requiredHeaders, body: file,
      })
      if (!put.ok) throw new Error(copy.objectUploadFailed(put.status))
      setPhase('verifying')
      await apiMutation(
        `artifact-upload-finalize:${currentIntent.id}`,
        `/api/v1/artifact-upload-intents/${currentIntent.id}/finalize`,
        { method: 'POST', headers: json({}), body: '{}' },
      )
      const status = await poll(currentIntent.id, copy)
      if (status.status !== 'verified') {
        setIntent(null)
        throw new Error(status.lastErrorCode ?? copy.uploadStatusError(status.status))
      }
      await refresh()
      setIntent(null)
      setPendingFile(null)
      setPhase('idle')
    } catch (reason) {
      setPhase('failed')
      setError(reason instanceof Error ? reason.message : copy.uploadErrorFallback)
    }
  }

  const cancel = async () => {
    try {
      setError('')
      if (intent) {
        await apiMutation(
          `artifact-upload-cancel:${intent.id}`,
          `/api/v1/artifact-upload-intents/${intent.id}/cancel`,
          { method: 'POST', headers: json({}), body: '{}' },
        )
      }
      setIntent(null)
      setPendingFile(null)
      setPhase('idle')
    } catch (reason) {
      setPhase('failed')
      setError(reason instanceof Error ? reason.message : copy.cancelErrorFallback)
    }
  }
  const download = async (id: string) => {
    const result = await apiRequest<{ downloadUrl: string }>(`/api/v1/artifact-upload-intents/${id}/download`)
    window.open(result.downloadUrl, '_blank', 'noopener')
  }
  const recovery = uploadRecoveryActions(phase, pendingFile !== null, intent !== null)

  return <section className="work-item-artifacts" aria-label={copy.ariaLabel}>
    <header><div><h3>{copy.title}</h3><p>{copy.provenance}</p></div>
      <label className="attachment-picker">{copy.attachFile}<input aria-label={copy.inputLabel} disabled={phase !== 'idle'} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void upload(file); event.currentTarget.value = '' }} type="file" /></label>
    </header>
    {phase !== 'idle' && phase !== 'failed' && <div aria-live="polite">{copy.phaseAnnouncement(copy.phases[phase])} {intent && <button onClick={() => void cancel()} type="button">{copy.cancel}</button>}</div>}
    {error && <div className="attachment-error" role="alert"><span>{error}</span>{recovery.retry && <button onClick={() => pendingFile && void upload(pendingFile, intent)} type="button">{copy.retryUpload}</button>}{recovery.cancel && <button onClick={() => void cancel()} type="button">{copy.cancelUpload}</button>}</div>}
    <ul>{items.map(item => <li key={item.id}>{item.upload_intent_id
      ? <button onClick={() => void download(item.upload_intent_id!)} type="button"><strong>{item.title}</strong><span>{item.mime_type ?? copy.fileFallback} · {copy.formatBytes(item.size_bytes ?? 0)}</span><small>{item.producer_display_name} · {item.producer_kind}</small></button>
      : <div><strong>{item.title}</strong><span>{item.mime_type ?? copy.fileFallback} · {copy.formatBytes(item.size_bytes ?? 0)}</span><small>{item.producer_display_name} · {item.producer_kind}</small></div>}</li>)}</ul>
    {items.length === 0 && <p className="empty">{copy.empty}</p>}
  </section>
}
