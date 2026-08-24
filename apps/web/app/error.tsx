'use client'

import { useEffect } from 'react'
import { AsyncStateSurface } from '@workmesh/ui'
import { useLocale } from './lib/i18n'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLocale()
  useEffect(() => {
    console.error('WorkMesh page error', error)
  }, [error])
  return (
    <main className="center">
      <AsyncStateSurface
        actionLabel={t('retry')}
        description={error.message || 'Something went wrong.'}
        onAction={reset}
        state="error"
        title={t('pageLoadError')}
      />
    </main>
  )
}
