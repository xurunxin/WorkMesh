'use client'

import Link from 'next/link'
import { useLocale } from './lib/i18n'

export default function NotFound() {
  const { t } = useLocale()
  return (
    <main className="center">
      <div>
        <h1>{t('notFoundTitle')}</h1>
        <p>{t('notFoundDescription')}</p>
        <Link href="/">{t('backToHome')}</Link>
      </div>
    </main>
  )
}
