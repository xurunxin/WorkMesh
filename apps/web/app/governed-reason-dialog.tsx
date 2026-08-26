'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button, Dialog } from '@workmesh/ui'
import { useLocale } from './lib/i18n'

export function GovernedReasonDialog({ consequences, onClose, onSubmit, open, title }: {
  consequences: readonly string[]
  onClose: () => void
  onSubmit: (reason: string) => void | Promise<void>
  open: boolean
  title: string
}) {
  const { locale } = useLocale()
  const reasonRef = useRef<HTMLTextAreaElement | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const text = locale === 'zh-CN'
    ? { cancel: '取消', close: '关闭', consequences: '后果', reason: '原因', submit: '确认执行', submitting: '正在提交…' }
    : { cancel: 'Cancel', close: 'Close', consequences: 'Consequences', reason: 'Reason', submit: 'Confirm action', submitting: 'Submitting…' }
  useEffect(() => { if (!open) { setReason(''); setError(''); setBusy(false) } }, [open])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || !reason.trim()) return
    setBusy(true); setError('')
    try { await onSubmit(reason.trim()); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <Dialog closeLabel={text.close} initialFocusRef={reasonRef} onClose={onClose} open={open} title={title}>
    <form className="agent-control-form" onSubmit={event => void submit(event)}>
      <section aria-label={text.consequences} className="agent-control-preview"><h3>{text.consequences}</h3><ul>{consequences.map(item => <li key={item}>{item}</li>)}</ul></section>
      <label>{text.reason}<textarea onChange={event => setReason(event.currentTarget.value)} ref={reasonRef} required value={reason} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="agent-control-actions"><Button disabled={busy || !reason.trim()} type="submit" variant="danger">{busy ? text.submitting : text.submit}</Button><Button disabled={busy} onClick={onClose} type="button" variant="secondary">{text.cancel}</Button></div>
    </form>
  </Dialog>
}
