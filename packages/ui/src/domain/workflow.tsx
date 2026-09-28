'use client'

import type { CSSProperties, FormEventHandler, ReactNode, Ref } from 'react'
import { classNames } from '../internal/utils.js'

export type WorkflowStateData = {
  category: string
  color: string
  id: string
  name: string
  /** Carried so an optimistic edit can state which revision it is based on. */
  revision: number
}

export type ColorPreset = {
  id: string
  label: ReactNode
  value: string
}

export type ColorPickerProps = {
  /** The custom color currently typed, shown beside the swatch. */
  customColor: string
  customLabel: string
  /**
   * Ref for the native custom control. The screen focuses it when the mode
   * flips to "custom", so the control itself has to expose the node.
   */
  customColorRef?: Ref<HTMLInputElement>
  /** Identifies the radio group. */
  name: string
  onCustomColorChange: (value: string) => void
  onModeChange: (mode: string) => void
  presets: readonly ColorPreset[]
  /** Which preset is active, or "custom". */
  value: string
  colorValueLabel: string
  customInputLabel: string
  legend: string
  className?: string
}

export type WorkflowStateListProps = {
  /** Rendered instead of the list when there is nothing to show. */
  empty?: ReactNode
  states: readonly WorkflowStateData[]
  className?: string
  /** Returns the editor for the state being edited, or null to render the row. */
  renderEditor: (state: WorkflowStateData) => ReactNode
  editingId: string | null
  renderRow: (state: WorkflowStateData) => ReactNode
}

/**
 * The workflow state machine is a domain concept, not a screen: a Team owns
 * these states, they gate every transition, and the same set is read wherever a
 * state is chosen. The row, its editor and its colour picker are declared once
 * so a second surface cannot grow a different reading of the same states.
 */
export function WorkflowStateList({ className, editingId, empty, renderEditor, renderRow, states }: WorkflowStateListProps) {
  if (states.length === 0) return <>{empty}</>
  return <div className={classNames('wm-workflow-state-list', className)}>
    {states.map(state => <article
      className={classNames('wm-workflow-state', state.id === editingId && 'is-editing')}
      key={state.id}
      style={{ '--wm-status-color': state.color } as CSSProperties}
    >{state.id === editingId ? renderEditor(state) : renderRow(state)}</article>)}
  </div>
}

/** A state row reads as: colour, name, category - then its own action. */
export function WorkflowStateIdentity({ categoryLabel, state }: { categoryLabel: ReactNode; state: WorkflowStateData }) {
  return <div className="wm-workflow-state-identity">
    <span aria-hidden="true" className="wm-status-dot" style={{ backgroundColor: state.color }} />
    <span><strong>{state.name}</strong><small>{categoryLabel ?? state.category}</small></span>
  </div>
}

export function ColorPicker({
  className, colorValueLabel, customColor, customColorRef, customInputLabel, customLabel, legend, name, onCustomColorChange, onModeChange, presets, value,
}: ColorPickerProps) {
  return <fieldset className={classNames('wm-color-fieldset', className)}>
    <legend>{legend}</legend>
    <div className="wm-color-presets">
      {presets.map(preset => <label className="wm-color-option" key={preset.id}>
        <input checked={value === preset.id} name={name} onChange={() => onModeChange(preset.id)} type="radio" value={preset.id} />
        <span aria-hidden="true" className="wm-color-swatch" style={{ backgroundColor: preset.value }} />
        <span>{preset.label}</span>
      </label>)}
      <label className="wm-color-option">
        <input checked={value === 'custom'} name={name} onChange={() => onModeChange('custom')} type="radio" value="custom" />
        <span aria-hidden="true" className="wm-color-swatch" style={{ backgroundColor: customColor }} />
        <span>{customLabel}</span>
      </label>
    </div>
    {value === 'custom' && <div className="wm-color-custom">
      <label>{customInputLabel}<input aria-label={customInputLabel} onChange={event => onCustomColorChange(event.currentTarget.value)} ref={customColorRef} type="color" value={customColor} /></label>
      <output aria-label={colorValueLabel}>{customColor}</output>
    </div>}
  </fieldset>
}

export type WorkflowStateEditorProps = {
  actions: ReactNode
  children: ReactNode
  className?: string
  /** A revision conflict the server reported; rendered above the actions. */
  conflict?: ReactNode
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function WorkflowStateEditor({ actions, children, className, conflict, onSubmit }: WorkflowStateEditorProps) {
  return <form className={classNames('wm-workflow-state-editor', className)} onSubmit={onSubmit}>
    {children}
    {conflict}
    <div className="wm-workflow-state-editor-actions">{actions}</div>
  </form>
}
