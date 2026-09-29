'use client'

import { WrenchIcon } from '@phosphor-icons/react/dist/csr/Wrench'
import type { ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type ToolChipData = {
  /** The name the runner recorded, e.g. "create_work_item". */
  toolName: string
  /** How many times the tool was called in this turn. */
  callCount: number
  /** Sanitized shape only; never raw arguments. */
  inputSummary: string
}

export type ToolChipProps = {
  data: ToolChipData
  /** How the enclosing turn ended. A chip is only as final as its turn. */
  outcome?: 'done' | 'failed' | 'unknown'
  className?: string
  /** Appended after the name, e.g. a unit or a provider-reported figure. */
  stat?: ReactNode
  /** Wording for the call count when it is above one. */
  timesLabel?: string
}

/**
 * One tool's contribution to a turn: a glyph, the name, how many times it ran,
 * and how the turn ended. The prototype states this as a pill whose dot flips
 * to a check on completion - so the dot follows the turn, not the chip, and a
 * failed turn cannot present its tools as finished work.
 *
 * There is deliberately no per-tool icon taxonomy here. The ledger records a
 * name, not a category, and inventing a mapping would present a guess as a
 * fact.
 */
export function ToolChip({ className, data, outcome = 'unknown', stat, timesLabel = '×' }: ToolChipProps) {
  return <span className={classNames('wm-tool-chip', outcome === 'done' && 'is-done', outcome === 'failed' && 'is-failed', className)} title={data.inputSummary}>
    <WrenchIcon aria-hidden="true" className="wm-tool-chip-glyph" size={13} weight="bold" />
    <span className="wm-tool-chip-label">{data.toolName}</span>
    {data.callCount > 1 && <span className="wm-tool-chip-count">{timesLabel}{data.callCount}</span>}
    {stat !== undefined && stat !== null && <span className="wm-tool-chip-stat">{stat}</span>}
    {outcome !== 'unknown' && <span aria-hidden="true" className="wm-tool-chip-dot" data-outcome={outcome} />}
    {outcome !== 'unknown' && <span className="wm-visually-hidden">{outcome === 'done' ? 'completed' : 'did not complete'}</span>}
  </span>
}

export type ToolChipRowProps = {
  children: ReactNode
  className?: string
}

/** The prototype lays the chips out as one wrapping row per turn. */
export function ToolChipRow({ children, className }: ToolChipRowProps) {
  return <div className={classNames('wm-tool-chip-row', className)}>{children}</div>
}
