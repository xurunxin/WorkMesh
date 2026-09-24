'use client'

import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { classNames } from '../internal/utils.js'
import { Select } from './select.js'

export type TabOption = { badge?: number | string; id: string; label: string }
export type TabItem = TabOption & { panel: ReactNode }
export type TabBarProps = {
  ariaLabel: string
  idPrefix?: string
  onValueChange: (value: string) => void
  tabs: readonly TabOption[]
  value: string
}
export type TabsProps = {
  ariaLabel: string
  compact?: boolean
  onValueChange: (value: string) => void
  tabs: TabItem[]
  value: string
}

export function TabBar({ ariaLabel, idPrefix, onValueChange, tabs, value }: TabBarProps) {
  const generatedId = useId()
  const baseId = idPrefix ?? generatedId
  const selected = tabs.find(tab => tab.id === value) ?? tabs[0]
  const move = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let targetIndex: number | null = null
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % tabs.length
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') targetIndex = 0
    if (event.key === 'End') targetIndex = tabs.length - 1
    if (targetIndex === null) return
    event.preventDefault()
    const target = tabs[targetIndex]
    if (!target) return
    onValueChange(target.id)
    document.getElementById(`${baseId}-tab-${target.id}`)?.focus()
  }
  return <div aria-label={ariaLabel} className="wm-tab-list" role="tablist">{tabs.map((tab, index) => <button
    aria-controls={idPrefix ? `${baseId}-panel-${tab.id}` : undefined}
    aria-selected={tab.id === selected?.id}
    className={classNames('wm-tab', tab.id === selected?.id && 'is-active')}
    id={`${baseId}-tab-${tab.id}`}
    key={tab.id}
    onClick={() => onValueChange(tab.id)}
    onKeyDown={event => move(event, index)}
    role="tab"
    tabIndex={tab.id === selected?.id ? 0 : -1}
    type="button"
  ><span>{tab.label}</span>{tab.badge !== undefined && <span className="wm-tab-badge">{tab.badge}</span>}</button>)}</div>
}

export function Tabs({ ariaLabel, compact = false, onValueChange, tabs, value }: TabsProps) {
  const baseId = useId()
  const selected = tabs.find(tab => tab.id === value) ?? tabs[0]
  const compactLabelId = `${baseId}-compact-label`
  // When compact, render a native <select> so the tab list collapses into
  // a single form control on narrow viewports. The select still drives the
  // same onValueChange handler so the active panel and any controlled
  // parent state stay in lock-step with the keyboard/button variant.
  if (compact) {
    return <div className="wm-tabs wm-tabs-compact">
      <label className="wm-tab-list-compact">
        <span className="wm-visually-hidden" id={compactLabelId}>{selected?.label ?? ariaLabel}</span>
        <Select aria-label={ariaLabel} className="wm-tab-select" value={selected?.id ?? ''} onChange={event => onValueChange(event.currentTarget.value)}>
          {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}{tab.badge !== undefined ? ` (${tab.badge})` : ''}</option>)}
        </Select>
      </label>
      {selected && <div aria-labelledby={compactLabelId} className="wm-tab-panel" id={`${baseId}-panel-${selected.id}`} role="tabpanel">{selected.panel}</div>}
    </div>
  }
  return <div className="wm-tabs">
    <TabBar ariaLabel={ariaLabel} idPrefix={baseId} onValueChange={onValueChange} tabs={tabs} value={selected?.id ?? ''} />
    {tabs.map(tab => {
      const active = tab.id === selected?.id
      return <div
        aria-labelledby={`${baseId}-tab-${tab.id}`}
        className="wm-tab-panel"
        hidden={!active}
        id={`${baseId}-panel-${tab.id}`}
        key={tab.id}
        role="tabpanel"
      >{active ? tab.panel : null}</div>
    })}
  </div>
}
