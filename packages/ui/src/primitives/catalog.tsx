'use client'

import { useState, type ReactNode } from 'react'
import { Badge } from './badge.js'
import { Button } from './button.js'
import { Checkbox, CheckboxGroup } from './checkbox.js'
import { Combobox } from './combobox.js'
import { CommandPalette } from './command-palette.js'
import { DataTable, type DataTableSort } from './data-table.js'
import { IconButton } from './icon-button.js'
import { Input } from './input.js'
import { Menu } from './menu.js'
import { Dialog, Sheet } from './overlay-surfaces.js'
import { Pagination } from './pagination.js'
import { Select } from './select.js'
import { Skeleton } from './skeleton.js'
import { Switch } from './switch.js'
import { EmptyState, ErrorState, ForbiddenState, AsyncStateSurface } from './states.js'
import { TabBar } from './tabs.js'
import { Tooltip } from './tooltip.js'
import { Toast } from './toast.js'
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'

const CATALOG_COMBOBOX_OPTIONS = [
  { id: 'agent-claude', label: 'Claude Agent' },
  { id: 'agent-pi', label: 'Pi Runner' },
  { id: 'agent-codex', label: 'Codex Agent' },
]

const CATALOG_ROWS = [
  { id: 'WM-101', priority: 'high', status: 'In review', title: 'Freeze runner contracts' },
  { id: 'WM-102', priority: 'low', status: 'Backlog', title: 'Audit secret redaction paths' },
  { id: 'WM-103', priority: 'medium', status: 'Executing', title: 'Wire durable event cursors' },
]

function CatalogSection({ children, density = false, title }: { children: ReactNode; density?: boolean; title: string }) {
  return <section data-density={density ? 'true' : undefined} style={{ display: 'grid', gap: '.75rem', padding: '1rem', border: '1px solid var(--wm-border)', borderRadius: 'var(--wm-radius-lg)' }}>
    <h2 style={{ margin: 0, fontSize: 'var(--wm-text-md)' }}>{title}</h2>
    {children}
  </section>
}

function CatalogRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem' }}>{children}</div>
}

function CatalogStateSurface({ state, title }: { state: Parameters<typeof AsyncStateSurface>[0]['state']; title: string }) {
  return <AsyncStateSurface state={state} title={title} description="Shared async surface fixture with an optional recovery action." actionLabel="Retry" onAction={() => undefined} />
}

export type ComponentCatalogProps = {
  heading?: string
  intro?: string
}

/** Visual fixture catalog: every shared control across states, sizes, and
 *  densities. Mount inside a themed scope (html[data-wm-theme]) for
 *  light/dark comparison. API-free — local state only. */
export function ComponentCatalog({ heading = 'Component catalog', intro = 'Fixtures for the shared control library. Toggle data-wm-theme and data-wm-density on an ancestor scope to compare themes and densities.' }: ComponentCatalogProps = {}) {
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(true)
  const [groupValues, setGroupValues] = useState<string[]>(['labels'])
  const [comboboxValue, setComboboxValue] = useState('agent-pi')
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [tab, setTab] = useState('overview')
  const [sort, setSort] = useState<DataTableSort | null>(null)
  const [selectedRows, setSelectedRows] = useState<string[]>(['WM-102'])
  const [page, setPage] = useState(5)

  return <div className="wm-theme" style={{ display: 'grid', gap: '1rem', padding: '1.25rem', color: 'var(--wm-text)', background: 'var(--wm-canvas)' }}>
    <header style={{ display: 'grid', gap: '.25rem' }}>
      <h1 style={{ margin: 0, fontSize: 'var(--wm-text-lg)' }}>{heading}</h1>
      <p style={{ margin: 0, color: 'var(--wm-text-muted)' }}>{intro}</p>
    </header>

    <CatalogSection title="Buttons">
      <CatalogRow>
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Disabled</Button>
        <Button busy={busy} onClick={() => { setBusy(true); window.setTimeout(() => setBusy(false), 1200) }}>{busy ? 'Working…' : 'Run with busy'}</Button>
        <Button icon={<PlusIcon aria-hidden size={16} />}>Icon start</Button>
        <Button icon={<TrashIcon aria-hidden size={16} />} iconPosition="end">Icon end</Button>
      </CatalogRow>
      <CatalogRow>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Button title="This label intentionally overflows the button max width to exercise truncation behaviour on long copy">Long-copy label that must truncate inside the pill instead of blowing out the toolbar</Button>
      </CatalogRow>
    </CatalogSection>

    <CatalogSection title="Icon buttons">
      <CatalogRow>
        <IconButton icon={<PlusIcon aria-hidden size={16} />} label="Add item" />
        <IconButton icon={<GearIcon aria-hidden size={16} />} label="Settings" />
        <IconButton disabled icon={<TrashIcon aria-hidden size={16} />} label="Delete item" />
        <IconButton icon={<MagnifyingGlassIcon aria-hidden size={14} />} label="Search" size="sm" />
      </CatalogRow>
    </CatalogSection>

    <CatalogSection title="Inputs and selects">
      <CatalogRow>
        <Input aria-label="Project name" placeholder="Default input" style={{ maxWidth: '16rem' }} />
        <Input aria-label="Invalid input" defaultValue="not-an-email" invalid style={{ maxWidth: '16rem' }} />
        <Input aria-label="Disabled input" disabled placeholder="Disabled" style={{ maxWidth: '16rem' }} />
        <Select aria-label="Density" style={{ maxWidth: '12rem' }}>
          <option>Comfortable</option>
          <option>Compact</option>
        </Select>
      </CatalogRow>
    </CatalogSection>

    <CatalogSection title="Switch and checkboxes">
      <CatalogRow>
        <Switch checked={checked} label="Notifications" onCheckedChange={setChecked} />
        <Switch checked={false} disabled label="Disabled off switch" onCheckedChange={() => undefined} />
        <Switch checked disabled label="Disabled on switch" onCheckedChange={() => undefined} />
      </CatalogRow>
      <CheckboxGroup
        label="Work item labels"
        onValuesChange={setGroupValues}
        options={[
          { label: 'Labels', value: 'labels' },
          { label: 'Estimate', value: 'estimate' },
          { label: 'Blocked reason (disabled)', disabled: true, value: 'blocked' },
        ]}
        values={groupValues}
      />
      <CatalogRow>
        <Checkbox checked onCheckedChange={() => undefined} aria-label="Checked checkbox" />
        <Checkbox checked="indeterminate" onCheckedChange={() => undefined} aria-label="Indeterminate checkbox" />
        <Checkbox checked={false} onCheckedChange={() => undefined} aria-label="Unchecked checkbox" />
        <Checkbox checked={false} disabled onCheckedChange={() => undefined} aria-label="Disabled checkbox" />
      </CatalogRow>
    </CatalogSection>

    <CatalogSection title="Menu, tooltip, combobox">
      <CatalogRow>
        <Menu
          entries={[
            { id: 'open', label: 'Open item' },
            { id: 'duplicate', label: 'Duplicate' },
            'separator',
            { id: 'archive', label: 'Archive', tone: 'danger' },
            { id: 'locked', label: 'Locked action', disabled: true },
          ]}
          label="Item actions"
          onOpenChange={setMenuOpen}
          onSelection={() => undefined}
          open={menuOpen}
          selectedId="duplicate"
          trigger={<Button aria-haspopup="menu">Actions ▾</Button>}
        />
        <Tooltip content="Runs the selected work item">
          <Button>Hover for tooltip</Button>
        </Tooltip>
        <Combobox
          ariaLabel="Assign agent"
          emptyText="No agents match"
          onValueChange={setComboboxValue}
          options={CATALOG_COMBOBOX_OPTIONS}
          value={comboboxValue}
        />
      </CatalogRow>
    </CatalogSection>

    <CatalogSection title="Tabs and badges">
      <TabBar ariaLabel="Catalog views" idPrefix="catalog-tabs" onValueChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { badge: 3, id: 'attention', label: 'Attention' }, { id: 'archive', label: 'Archive' }]} value={tab} />
      <CatalogRow>
        <Badge tone="neutral">Neutral</Badge>
        <Badge tone="info">Info</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="danger">Danger</Badge>
        <Badge title="A very long badge label that must stay on one line inside the pill">Long badge label exercising single-line pill behaviour</Badge>
      </CatalogRow>
    </CatalogSection>

    <CatalogSection title="Overlays and toasts">
      <CatalogRow>
        <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
        <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
        <Button onClick={() => setPaletteOpen(true)}>Open command palette</Button>
        <Button onClick={() => setToastOpen(true)}>Show toast</Button>
      </CatalogRow>
      <Dialog description="Shared dialog fixture with focus trap and Escape handling." onClose={() => setDialogOpen(false)} open={dialogOpen} title="Example dialog">
        <p style={{ margin: 0 }}>Dialog body fixture.</p>
      </Dialog>
      <Sheet description="Shared sheet fixture." onClose={() => setSheetOpen(false)} open={sheetOpen} title="Example sheet">
        <p style={{ margin: 0 }}>Sheet body fixture.</p>
      </Sheet>
      <CommandPalette
        commands={[
          { id: 'new-item', label: 'New work item', hint: 'N', onSelect: () => undefined },
          { id: 'open-project', label: 'Open project', keywords: 'project navigate', onSelect: () => undefined },
          { id: 'stop-session', label: 'Stop agent session', keywords: 'halt terminate', onSelect: () => undefined },
        ]}
        onOpenChange={setPaletteOpen}
        open={paletteOpen}
      />
      {toastOpen && <Toast dismissLabel="Dismiss the example toast" message="Toast fixture message." onDismiss={() => setToastOpen(false)} open title="Example toast" tone="success" toastId="catalog-toast" />}
    </CatalogSection>

    <CatalogSection title="Async states and skeleton">
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <CatalogStateSurface state="empty" title="Nothing here yet" />
        <CatalogStateSurface state="error" title="Request failed" />
        <CatalogStateSurface state="forbidden" title="No permission" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}><AsyncStateSurface state="loading" title="Loading items" description="Fetching the latest records." /><Skeleton label="Loading rows" /></div>
        <EmptyState title="Empty fixture" description="No records match the current filters." />
        <ErrorState title="Error fixture" description="The request failed and can be retried." />
        <ForbiddenState title="Forbidden fixture" description="You lack permission for this resource." />
      </div>
    </CatalogSection>

    <CatalogSection title="Data table and pagination">
      <div className="wm-data-table-frame">
        <DataTable
          columns={[
            { id: 'title', sortValue: row => row.title, title: 'Title' },
            { id: 'status', title: 'Status' },
            { align: 'numeric', id: 'priority', sortValue: row => row.priority, title: 'Priority' },
          ]}
          emptyLabel="No rows"
          getRowId={row => row.id}
          onSortChange={setSort}
          onToggleAllRows={selected => setSelectedRows(selected ? CATALOG_ROWS.map(row => row.id) : [])}
          onToggleRow={rowId => setSelectedRows(current => current.includes(rowId) ? current.filter(id => id !== rowId) : [...current, rowId])}
          renderCell={(row, column) => column.id === 'title' ? row.title : column.id === 'status' ? row.status : row.priority}
          rows={CATALOG_ROWS}
          selectedRowIds={selectedRows}
          sort={sort}
        />
      </div>
      <Pagination ariaLabel="Catalog pagination" onPageChange={setPage} page={page} pageCount={20} />
    </CatalogSection>

    <CatalogSection density title="Compact density sample (data-wm-density='compact' scope)">
      <div data-wm-density="compact" style={{ display: 'grid', gap: '.5rem' }}>
        <CatalogRow>
          <Button size="sm">Compact action</Button>
          <Input aria-label="Compact input" placeholder="Compact input" style={{ maxWidth: '14rem' }} />
          <Pagination ariaLabel="Compact pagination" onPageChange={() => undefined} page={1} pageCount={3} />
        </CatalogRow>
      </div>
    </CatalogSection>
  </div>
}
