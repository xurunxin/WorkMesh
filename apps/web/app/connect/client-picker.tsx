'use client'

import { useId } from 'react'
import { BracketsCurlyIcon } from '@phosphor-icons/react/dist/csr/BracketsCurly'
import { PiIcon } from '@phosphor-icons/react/dist/csr/Pi'
import { PlugsConnectedIcon } from '@phosphor-icons/react/dist/csr/PlugsConnected'
import { TerminalWindowIcon } from '@phosphor-icons/react/dist/csr/TerminalWindow'
import { mcpClientFacts, type McpClientType } from '../lib/mcp-onboarding'

export type ClientPickerCopy = Readonly<{
  mcpClient: string
  clientDescription: (type: McpClientType) => string
  clientConfiguration: (label: string) => string
}>

type Props = {
  supportedClients: readonly McpClientType[]
  value: McpClientType
  onChange: (value: McpClientType) => void
  copy: ClientPickerCopy
}

function ClientPictogram({ type }: { type: McpClientType }) {
  const props = { 'aria-hidden': true, size: 22, weight: 'regular' as const }
  if (type === 'codex') return <TerminalWindowIcon {...props} />
  if (type === 'opencode') return <BracketsCurlyIcon {...props} />
  if (type === 'pi') return <PiIcon {...props} />
  return <PlugsConnectedIcon {...props} />
}

export function ClientPicker({ supportedClients, value, onChange, copy }: Props) {
  const legendId = useId()
  return <fieldset aria-labelledby={legendId} className="mcp-client-picker" role="radiogroup">
    <legend id={legendId}>{copy.mcpClient}</legend>
    <div className="mcp-client-card-list">
      {supportedClients.map(type => {
        const facts = mcpClientFacts(type)
        return <label className="mcp-client-card" data-client-type={type} data-selected={value === type ? 'true' : 'false'} key={type}>
          <input checked={value === type} name="mcp-client" onChange={event => { if (event.currentTarget.checked) onChange(type) }} type="radio" value={type} />
          <span className="mcp-client-card-icon"><ClientPictogram type={type} /></span>
          <span className="mcp-client-card-copy">
            <strong>{facts.label}</strong>
            <span>{copy.clientDescription(type)}</span>
            <small>{copy.clientConfiguration(facts.configLabel)}</small>
          </span>
        </label>
      })}
    </div>
  </fieldset>
}
