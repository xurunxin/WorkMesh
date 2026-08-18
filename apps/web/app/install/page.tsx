'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { AppShell, Button, Card } from '@workmesh/ui'
import { ApiError, publicMutation, publicRequest, saveCsrfToken } from '../lib/api'
import { LocaleToggle, useLocale } from '../lib/i18n'

type InstallResponse = { csrfToken: string }
type InstallStatus = { installed: boolean }

export default function InstallPage() {
  const { installCopy: text } = useLocale()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    void publicRequest<InstallStatus>('/api/v1/install-status').then(status => {
      if (status.installed) window.location.replace('/login')
    }).catch(reason => setError(reason instanceof Error ? reason.message : textRef.current.installFailed))
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try {
      const bootstrapToken = form.get('bootstrapToken')
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (typeof bootstrapToken === 'string' && bootstrapToken.length > 0)
        headers.set('X-WorkMesh-Bootstrap-Token', bootstrapToken)
      const result = await publicMutation<InstallResponse>('install-workspace', '/api/v1/auth/install', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: form.get('workspace'),
          slug: form.get('slug'),
          adminName: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      })
      saveCsrfToken(result.csrfToken)
      window.location.assign('/')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : text.installFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return <AppShell productName="WorkMesh" navigation={[]} utilityNavigation={[]} headerActions={<LocaleToggle />}>
    <div className="auth-shell">
      <Card title={text.title} subtitle={text.subtitle} className="auth-card">
        <form onSubmit={submit} data-testid="install-form">
          <label>{text.bootstrapToken}<input name="bootstrapToken" type="password" autoComplete="off" placeholder={text.bootstrapTokenPlaceholder} /></label>
          <p className="muted">{text.bootstrapHelp}</p>
          <label>{text.workspace}<input name="workspace" placeholder={text.workspacePlaceholder} required /></label>
          <label>{text.slug}<input name="slug" placeholder={text.slugPlaceholder} pattern="[a-z0-9-]+" required /></label>
          <label>{text.yourName}<input name="name" placeholder={text.yourNamePlaceholder} required /></label>
          <label>{text.email}<input name="email" type="email" placeholder={text.emailPlaceholder} required /></label>
          <label>{text.password}<input name="password" type="password" minLength={12} placeholder={text.passwordPlaceholder} required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <Button disabled={submitting} data-testid="install-submit" type="submit" variant="primary">{submitting ? text.installing : text.install}</Button>
        </form>
      </Card>
    </div>
  </AppShell>
}
