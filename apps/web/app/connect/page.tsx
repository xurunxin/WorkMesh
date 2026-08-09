'use client'

import { useEffect, useState } from 'react'
import { apiBase } from '../lib/api'

type Discovery = { protocolVersion: 'v1'; mcpUrl: string; supportedClients: string[]; skill: { name: 'workmesh'; version: string; sha256: string; signature: string } }

export default function ConnectPage() {
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [fragmentPresent, setFragmentPresent] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setFragmentPresent(window.location.hash.length > 1)
    void fetch(`${apiBase}/.well-known/workmesh-agent`, { headers: { accept: 'application/json' } })
      .then(async response => { if (!response.ok) throw new Error(`Discovery failed (${response.status})`); setDiscovery(await response.json() as Discovery) })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Discovery failed.'))
  }, [])
  return <main className="center"><section className="connection-instruction"><h1>Connect an Agent to WorkMesh</h1>{error && <p className="error">{error}</p>}{!fragmentPresent ? <p className="error">This link has no pairing fragment. Ask a Workspace Admin to generate a new Agent Connection.</p> : <><p>The one-time pairing code is present only in this page fragment. It has not been sent to WorkMesh.</p>{discovery && <dl><div><dt>Protocol</dt><dd>{discovery.protocolVersion}</dd></div><div><dt>MCP</dt><dd>{discovery.mcpUrl}</dd></div><div><dt>Clients</dt><dd>{discovery.supportedClients.join(', ')}</dd></div><div><dt>Skill</dt><dd>{discovery.skill.name} {discovery.skill.version}</dd></div><div><dt>SHA-256</dt><dd>{discovery.skill.sha256}</dd></div></dl>}<p>Give this exact URL to the Agent. The Agent must load the pinned WorkMesh Skill, redeem within ten minutes, store the returned token in its secret store, and call <code>verify_connection</code>.</p><button type="button" onClick={() => void navigator.clipboard.writeText(window.location.href)}>Copy secure connect URL</button></>}</section></main>
}
