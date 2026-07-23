'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, publicRequest, saveCsrfToken } from '../lib/api'

type LoginResponse = { csrfToken: string }
type InstallStatus = { installed: boolean }

export default function LoginPage() {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void publicRequest<InstallStatus>('/api/v1/install-status').then(status => {
      if (!status.installed) window.location.replace('/install')
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to check installation status.'))
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try {
      const result = await publicRequest<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      saveCsrfToken(result.csrfToken)
      window.location.assign('/')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Sign in failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth"><form onSubmit={submit} data-testid="login-form">
    <h1>Sign in</h1>
    <label>Email<input name="email" type="email" placeholder="Email" required /></label>
    <label>Password<input name="password" type="password" placeholder="Password" required /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={submitting} data-testid="login-submit">{submitting ? 'Signing in…' : 'Sign in'}</button>
  </form></main>
}
