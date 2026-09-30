'use client'

import { useLocale } from '../../app/lib/i18n'
import { RunSection } from './run-digest-list'

/**
 * The Session list as a destination. The composed landing screen answers
 * "is anything running"; this answers "what exactly is running, and what can I
 * do about it" - so it pages rather than truncating, and every row carries the
 * governed controls.
 *
 * The prototype states the same rows in a single column under a plain page
 * head, which is exactly this: no new surface, the summary promoted.
 */
export default function SessionScreen({ locale }: Readonly<{ locale: 'en' | 'zh-CN' }>) {
  const { t } = useLocale()
  return <section className="content">
    <RunSection locale={locale ?? 'en'} title={t('sessions')} />
  </section>
}
