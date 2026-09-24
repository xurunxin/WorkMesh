'use client'

import { useState } from 'react'
import { Button, ComponentCatalog } from '@workmesh/ui'
import { useWorkMeshDocumentTitle } from '../lib/document-title'

type CatalogTheme = 'light' | 'dark'
type CatalogDensity = 'cozy' | 'compact'

/** Visual fixture surface for the shared component library. Theme and
 *  density are scoped via data attributes so light/dark and compact
 *  comparisons can be captured at an identical viewport. */
export default function UiCatalogPage() {
  const [theme, setTheme] = useState<CatalogTheme>('dark')
  const [density, setDensity] = useState<CatalogDensity>('cozy')
  useWorkMeshDocumentTitle('Component catalog')

  return <div style={{ minHeight: '100vh' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.75rem 1.25rem', borderBottom: '1px solid var(--wm-border)' }}>
      <Button aria-pressed={theme === 'light'} size="sm" variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}>Light</Button>
      <Button aria-pressed={theme === 'dark'} size="sm" variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}>Dark</Button>
      <Button aria-pressed={density === 'compact'} size="sm" variant={density === 'compact' ? 'primary' : 'secondary'} onClick={() => setDensity(density === 'compact' ? 'cozy' : 'compact')}>Compact density</Button>
    </div>
    <div data-wm-density={density === 'compact' ? 'compact' : undefined} data-wm-theme={theme}>
      <ComponentCatalog intro={`Shared control fixtures rendered in ${theme} theme, ${density} density. Compare against the design/prototype reference at the same viewport.`} />
    </div>
  </div>
}
