'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, publicMutation, publicRequest, saveCsrfToken } from '../lib/api'

type InstallResponse = { csrfToken: string }
type InstallStatus = { installed: boolean }

export default function InstallPage() {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void publicRequest<InstallStatus>('/api/v1/install-status').then(status => {
      if (status.installed) window.location.replace('/login')
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to check installation status.'))
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
      setError(reason instanceof ApiError ? reason.message : 'Installation failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth"><form onSubmit={submit} data-testid="install-form">
    <h1>Install WorkMesh</h1>
    <label>Bootstrap token<input name="bootstrapToken" type="password" autoComplete="off" placeholder="Deployment bootstrap token" /></label>
    <p className="muted">Required unless the API is in explicit loopback-only development bootstrap mode. The token is sent once and is not stored by this page.</p>
    <label>Workspace<input name="workspace" placeholder="Workspace" required /></label>
    <label>Workspace slug<input name="slug" placeholder="workspace-slug" pattern="[a-z0-9-]+" required /></label>
    <label>Your name<input name="name" placeholder="Your name" required /></label>
    <label>Email<input name="email" type="email" placeholder="Email" required /></label>
    <label>Password<input name="password" type="password" minLength={12} placeholder="At least 12 characters" required /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={submitting} data-testid="install-submit">{submitting ? 'Installing…' : 'Install'}</button>
  </form></main>
}
