'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { type AgentConnection, confirmAgentConnectionRotation, createAgentConnection, formatTime, getAgentConnection, revokeAgentConnection, rotateAgentConnection } from './lib/agents'

type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
type Props = { admin: boolean; teams: Team[]; humans: Human[]; currentHumanId: string; onError: (message: string) => void }
const capabilities = ['work:read', 'work:write', 'comment:write', 'message:write', 'plan:write']

export function AgentConnectionsPanel({ admin, teams, humans, currentHumanId, onError }: Props) {
  const [connection, setConnection] = useState<AgentConnection | null>(null)
  const [connectUrl, setConnectUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const sentence = useMemo(() => connectUrl ? `连接此 WorkMesh：打开 ${connectUrl}，按返回指令安装 MCP 与 WorkMesh Skill，并调用 verify_connection。` : '', [connectUrl])
  useEffect(() => { const id = sessionStorage.getItem('workmesh.last-agent-connection-id'); if (id) void getAgentConnection(id).then(setConnection).catch(() => sessionStorage.removeItem('workmesh.last-agent-connection-id')) }, [])
  const run = async (operation: () => Promise<void>) => { try { setBusy(true); onError(''); await operation() } catch (reason) { onError(reason instanceof Error ? reason.message : 'Agent Connection operation failed.') } finally { setBusy(false) } }
  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const values = new FormData(event.currentTarget)
    void run(async () => {
      const grantAgentDelegate = values.get('agentDelegate') === 'on'
      const requestedCapabilities = [...capabilities, ...(grantAgentDelegate ? ['agent:delegate'] : [])]
      const result = await createAgentConnection({ name: String(values.get('name')), agentSlug: String(values.get('slug')), clientType: String(values.get('client')) as AgentConnection['client_type'], teamId: String(values.get('team')), principalHumanActorId: String(values.get('principal')), requestedCapabilities, grantAgentDelegate, notes: String(values.get('notes') || '') || undefined })
      setConnection(result.connection); setConnectUrl(result.connect_url); sessionStorage.setItem('workmesh.last-agent-connection-id', result.connection.id)
    })
  }
  return <section aria-label="Agent Connections"><header><div><h2>Agent Connections</h2><p>Create a scoped, revocable MCP identity. Pairing URLs are shown only in this browser session.</p></div></header>
    {!admin ? <p className="empty">Workspace Admin access is required.</p> : <form onSubmit={create} className="agent-connection-form"><label>Client<select name="client" defaultValue="codex"><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="pi">pi</option><option value="generic_mcp">Generic MCP</option></select></label><label>Agent name<input name="name" required maxLength={120} placeholder="Planning coordinator" /></label><label>Agent slug<input name="slug" required pattern="[a-z0-9][a-z0-9-]{0,79}" placeholder="planning-coordinator" /></label><label>Team<select name="team" required>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select></label><label>Principal Human<select name="principal" defaultValue={currentHumanId}>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}{human.email ? ` · ${human.email}` : ''}</option>)}</select></label><label><input type="checkbox" name="agentDelegate" /> Allow this coordinator to start approved Agents</label><label>Notes<textarea name="notes" maxLength={2000} /></label><button disabled={busy || teams.length === 0}>Generate connection sentence</button></form>}
    {sentence && <article className="connection-instruction"><strong>One-time instruction</strong><p>{sentence}</p><button type="button" onClick={() => void navigator.clipboard.writeText(sentence)}>Copy instruction</button><small>Expires in ten minutes. The pairing code remains in the URL fragment and is never sent during page navigation.</small></article>}
    {connection && <article className="connection-summary"><header><div><h3>{connection.name}</h3><small>{connection.client_type} · {connection.agent_slug}</small></div><span className={connection.status === 'active' ? 'registry-active' : 'registry-inactive'}>{connection.status}</span></header><dl><div><dt>Team</dt><dd>{teams.find(team => team.id === connection.team_id)?.name ?? connection.team_id}</dd></div><div><dt>Principal</dt><dd>{humans.find(human => human.id === connection.principal_human_actor_id)?.display_name ?? connection.principal_human_actor_id}</dd></div><div><dt>Capabilities</dt><dd>{connection.granted_capabilities.join(', ')}</dd></div><div><dt>Credential</dt><dd>{connection.credential_fingerprint_prefix ?? 'Not redeemed'}</dd></div><div><dt>Skill</dt><dd>{connection.skill_version ?? 'pending'} · {connection.skill_sha256?.slice(0, 24) ?? 'pending'}</dd></div><div><dt>Last used</dt><dd>{formatTime(connection.last_used_at)}</dd></div></dl><div className="session-actions">{connection.status === 'active' && <button disabled={busy} onClick={() => void run(async () => { const result = await rotateAgentConnection(connection); setConnection(result.connection); setConnectUrl(result.connect_url) })}>Rotate credential</button>}{connection.status === 'rotating' && <button disabled={busy} onClick={() => void run(async () => setConnection(await confirmAgentConnectionRotation(connection)))}>Confirm rotation</button>}{connection.status !== 'revoked' && <button className="danger" disabled={busy} onClick={() => void run(async () => { await revokeAgentConnection(connection); setConnection({ ...connection, status: 'revoked', revoked_at: new Date().toISOString(), revision: connection.revision + 1 }); setConnectUrl('') })}>Revoke connection</button>}</div></article>}
  </section>
}
