'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { AppShell, Button, Card } from '@workmesh/ui'
import { ApiError, publicMutation, publicRequest, saveCsrfToken } from '../lib/api'
import { LocaleToggle, useLocale } from '../lib/i18n'

type LoginResponse = { csrfToken: string }
type InstallStatus = { installed: boolean }

export default function LoginPage() {
  const { loginCopy: text } = useLocale()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    void publicRequest<InstallStatus>('/api/v1/install-status').then(status => {
      if (!status.installed) window.location.replace('/install')
    }).catch(reason => setError(reason instanceof Error ? reason.message : textRef.current.signInFailed))
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try {
      const result = await publicMutation<LoginResponse>('login', '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      saveCsrfToken(result.csrfToken)
      window.location.assign('/')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : text.signInFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return <AppShell productName="WorkMesh" navigation={[]} utilityNavigation={[]} headerActions={<LocaleToggle />}>
    <div className="auth-shell">
      <Card title={text.title} subtitle={text.subtitle} className="auth-card">
        <form onSubmit={submit} data-testid="login-form">
          <label>{text.email}<input name="email" type="email" placeholder={text.emailPlaceholder} required /></label>
          <label>{text.password}<input name="password" type="password" placeholder={text.passwordPlaceholder} required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <Button disabled={submitting} data-testid="login-submit" type="submit" variant="primary">{submitting ? text.signingIn : text.signIn}</Button>
        </form>
      </Card>
    </div>
  </AppShell>
}
