'use client'

import { SkeletonList } from './lib/skeleton-list'
import { useLocale } from './lib/i18n'

export default function Loading() {
  const { t } = useLocale()
  return (
    <main className="center">
      <SkeletonList columns={1} items={4} label={t('loading')} />
    </main>
  )
}
