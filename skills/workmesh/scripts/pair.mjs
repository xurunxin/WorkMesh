#!/usr/bin/env node
import { createHash, randomUUID, verify as verifySignature } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const supportedClients = new Set(['codex', 'opencode', 'pi', 'generic_mcp'])
const tokenPrefix = 'wmi_'

export class PairingError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PairingError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new PairingError(code, message)
}

const sha256Hex = value => createHash('sha256').update(value).digest('hex')
const fingerprintPrefix = token => sha256Hex(token).slice(0, 12)

export function parsePairingArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--'))
      fail('PAIRING_ARGUMENT_INVALID', 'Every pairing option must use --name value syntax')
    args[key.slice(2)] = value
  }
  if (!supportedClients.has(args.client))
    fail('PAIRING_CLIENT_INVALID', '--client must be codex, opencode, pi, or generic_mcp')
  if (!args['agent-slug']) fail('PAIRING_AGENT_SLUG_REQUIRED', '--agent-slug is required')
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(args['agent-slug']))
    fail('PAIRING_AGENT_SLUG_INVALID', '--agent-slug must use the WorkMesh slug format')
  return args
}

export function resolvePairingEndpoints(rawUrl) {
  let connect
  try {
    connect = new URL(rawUrl ?? '')
  } catch {
    fail('PAIRING_URL_INVALID', 'Use an exact /connect#<pairing-code> URL')
  }
  const pairingCode = connect.hash.slice(1)
  if (!pairingCode.startsWith('wmp_') || connect.search || connect.pathname !== '/connect')
    fail('PAIRING_URL_INVALID', 'Use an exact /connect#<pairing-code> URL; query and path codes are forbidden')
  connect.hash = ''
  connect.pathname = '/api/v1/agent-connections/redeem'
  return { pairingCode, redeemUrl: connect.toString() }
}

async function readOptional(path, encoding) {
  try {
    return await readFile(path, encoding)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return undefined
    throw error
  }
}

export async function atomicWriteFile(path, data, mode = 0o600) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await open(temporaryPath, 'wx', mode)
    await handle.writeFile(data)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporaryPath, path)
    await chmod(path, mode)
  } catch (error) {
    if (handle) {
      try { await handle.close() } catch { /* best-effort cleanup */ }
    }
    try { await rm(temporaryPath, { force: true }) } catch { /* best-effort cleanup */ }
    throw error
  }
}

export async function loadOrCreateIdempotencyKey({
  output,
  redeemUrl,
  pairingCode,
  agentSlug,
  client,
  clientVersion,
  explicitKey,
}) {
  const scope = sha256Hex(JSON.stringify({
    redeemUrl,
    pairingCodeHash: sha256Hex(pairingCode),
    agentSlug,
    client,
    clientVersion,
  }))
  const statePath = resolve(output, `.pairing-${scope.slice(0, 16)}.json`)
  const existing = await readOptional(statePath, 'utf8')
  let existingState
  if (existing) {
    try { existingState = JSON.parse(existing) } catch { /* replace malformed local state */ }
  }
  const idempotencyKey = explicitKey
    ?? (existingState?.version === 1
      && existingState.scope === scope
      && typeof existingState.idempotency_key === 'string'
      && existingState.idempotency_key.length > 0
      && existingState.idempotency_key.length <= 255
      ? existingState.idempotency_key
      : randomUUID())
  if (!idempotencyKey || idempotencyKey.length > 255)
    fail('PAIRING_IDEMPOTENCY_KEY_INVALID', 'The Idempotency-Key must contain 1 to 255 characters')
  await atomicWriteFile(statePath, `${JSON.stringify({
    version: 1,
    scope,
    idempotency_key: idempotencyKey,
  })}\n`)
  return { idempotencyKey, statePath }
}

const requireObject = (value, code, message) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message)
  return value
}

const safeJson = async (response, code) => {
  try {
    return requireObject(await response.json(), code, 'WorkMesh returned a malformed JSON response')
  } catch (error) {
    if (error instanceof PairingError) throw error
    fail(code, 'WorkMesh returned a malformed JSON response')
  }
}

export async function verifyDownloadedSkill(skill, fetchImpl, publicKeyPath) {
  const bundle = requireObject(skill, 'PAIRING_SKILL_INVALID', 'Pairing response did not contain a Skill bundle')
  if (typeof bundle.download_url !== 'string'
    || typeof bundle.sha256 !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(bundle.sha256)
    || typeof bundle.signature !== 'string'
    || !bundle.signature.startsWith('ed25519:'))
    fail('PAIRING_SKILL_INVALID', 'Pairing response contained an invalid Skill bundle')
  const response = await fetchImpl(bundle.download_url, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: 'text/markdown' },
  })
  if (response.status !== 200 || response.redirected)
    fail('AGENT_SKILL_DOWNLOAD_FAILED', 'Pinned WorkMesh Skill download did not return an exact 200 response')
  const bytes = Buffer.from(await response.arrayBuffer())
  const actualDigest = `sha256:${sha256Hex(bytes)}`
  if (actualDigest !== bundle.sha256)
    fail('AGENT_SKILL_VERSION_MISMATCH', 'Pinned WorkMesh Skill bytes did not match the advertised SHA-256')
  const publicKey = await readFile(publicKeyPath, 'utf8')
  const signature = Buffer.from(bundle.signature.slice('ed25519:'.length), 'base64')
  if (!verifySignature(null, bytes, publicKey, signature))
    fail('AGENT_SKILL_SIGNATURE_INVALID', 'Pinned WorkMesh Skill signature verification failed')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('AGENT_SKILL_BYTES_INVALID', 'Pinned WorkMesh Skill was not valid UTF-8')
  }
  if (bytes.length === 0
    || text.charCodeAt(0) === 0xfeff
    || text.includes('\r')
    || /(?:^|[^A-Za-z0-9_])wm[pi]_[A-Za-z0-9_-]{16,}/.test(text))
    fail('AGENT_SKILL_BYTES_INVALID', 'Pinned WorkMesh Skill bytes were not canonical secret-safe LF UTF-8')
  return { bytes, sha256: actualDigest }
}

const parseMcpResponse = async response => {
  const body = await response.text()
  const serialized = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split(/\r?\n/).find(line => line.startsWith('data: '))?.slice(6)
    : body
  if (!serialized) fail('MCP_RESPONSE_INVALID', 'MCP response did not contain a JSON-RPC payload')
  try {
    return requireObject(JSON.parse(serialized), 'MCP_RESPONSE_INVALID', 'MCP response was not valid JSON')
  } catch (error) {
    if (error instanceof PairingError) throw error
    fail('MCP_RESPONSE_INVALID', 'MCP response was not valid JSON')
  }
}

async function mcpRequest({ fetchImpl, url, token, id, method, params, sessionId }) {
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-03-26',
      'x-workmesh-installation-token': token,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  if (response.status !== 200 || response.redirected)
    fail('MCP_LIVE_PROBE_FAILED', 'The exact MCP endpoint rejected the newly redeemed Installation Token')
  const payload = await parseMcpResponse(response)
  if (payload.error) fail('MCP_LIVE_PROBE_FAILED', 'MCP returned a JSON-RPC error for the newly redeemed Installation Token')
  return { payload, sessionId: response.headers.get('mcp-session-id') ?? sessionId }
}

async function mcpInitializedNotification({ fetchImpl, url, token, sessionId }) {
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-03-26',
      'x-workmesh-installation-token': token,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }),
  })
  if ((response.status !== 200 && response.status !== 202) || response.redirected)
    fail('MCP_LIVE_PROBE_FAILED', 'MCP rejected the initialized notification')
  return response.headers.get('mcp-session-id') ?? sessionId
}

const mcpToolData = payload => {
  const result = requireObject(payload.result, 'MCP_TOOL_FAILED', 'MCP tool response was missing its result')
  if (result.isError === true) fail('MCP_TOOL_FAILED', 'MCP verification tool rejected the newly redeemed Installation Token')
  const structured = requireObject(result.structuredContent, 'MCP_TOOL_FAILED', 'MCP tool response was missing structured content')
  return requireObject(structured.data, 'MCP_TOOL_FAILED', 'MCP tool response was missing structured data')
}

const sameSet = (left, right) => Array.isArray(left)
  && Array.isArray(right)
  && new Set(left).size === left.length
  && new Set(right).size === right.length
  && left.length === right.length
  && left.every(value => right.includes(value))

export function assertRedeemedIdentity(identity, redemption, expectedFingerprint) {
  const current = requireObject(identity, 'CONNECTION_IDENTITY_INVALID', 'MCP did not return a Connection identity')
  const connection = requireObject(current.connection, 'CONNECTION_IDENTITY_INVALID', 'MCP identity omitted the Connection')
  const session = requireObject(current.coordination_session, 'CONNECTION_IDENTITY_INVALID', 'MCP identity omitted the Coordination Session')
  const credential = requireObject(current.authenticated_credential, 'CONNECTION_IDENTITY_INVALID', 'MCP identity omitted the authenticated credential')
  const expectedConnection = requireObject(redemption.connection, 'PAIRING_RESPONSE_INVALID', 'Pairing response omitted the Connection')
  if (
    connection.id !== expectedConnection.id
    || connection.team_id !== redemption.team_id
    || connection.agent_actor_id !== expectedConnection.agent_actor_id
    || connection.principal_human_actor_id !== redemption.principal_human_actor_id
    || current.agent_actor_id !== expectedConnection.agent_actor_id
    || current.principal_human_actor_id !== redemption.principal_human_actor_id
    || current.team_id !== redemption.team_id
    || session.connection_id !== expectedConnection.id
    || session.team_id !== redemption.team_id
    || session.principal_human_actor_id !== redemption.principal_human_actor_id
    || !sameSet(current.granted_capabilities, expectedConnection.granted_capabilities)
    || !sameSet(connection.granted_capabilities, current.granted_capabilities)
    || !sameSet(session.granted_capabilities, current.granted_capabilities)
    || credential.fingerprint_prefix !== expectedFingerprint
    || credential.status !== 'active'
    || credential.overlap_until !== null
  ) fail('CONNECTION_IDENTITY_INCONSISTENT', 'MCP identity did not match the newly redeemed Connection credential')
  return current
}

const stableIdentityProjection = identity => ({
  connection_id: identity.connection.id,
  connection_team_id: identity.connection.team_id,
  connection_agent_actor_id: identity.connection.agent_actor_id,
  connection_principal_human_actor_id: identity.connection.principal_human_actor_id,
  agent_actor_id: identity.agent_actor_id,
  principal_human_actor_id: identity.principal_human_actor_id,
  team_id: identity.team_id,
  granted_capabilities: [...identity.granted_capabilities].sort(),
  coordination_session_id: identity.coordination_session.id,
  coordination_connection_id: identity.coordination_session.connection_id,
  coordination_team_id: identity.coordination_session.team_id,
  coordination_principal_human_actor_id:
    identity.coordination_session.principal_human_actor_id,
  coordination_capabilities: [...identity.coordination_session.granted_capabilities].sort(),
  authenticated_fingerprint_prefix: identity.authenticated_credential.fingerprint_prefix,
  authenticated_status: identity.authenticated_credential.status,
  authenticated_overlap_until: identity.authenticated_credential.overlap_until,
})

export async function verifyMcpIdentity(redemption, token, fetchImpl) {
  const mcp = requireObject(redemption.mcp, 'PAIRING_RESPONSE_INVALID', 'Pairing response omitted MCP configuration')
  if (typeof mcp.url !== 'string') fail('PAIRING_RESPONSE_INVALID', 'Pairing response omitted the MCP URL')
  let requestId = 1
  const initialized = await mcpRequest({
    fetchImpl,
    url: mcp.url,
    token,
    id: requestId++,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'workmesh-pair', version: '1.1.0' },
    },
  })
  if (initialized.payload.error)
    fail('MCP_LIVE_PROBE_FAILED', 'MCP initialize returned a JSON-RPC error')
  requireObject(
    initialized.payload.result,
    'MCP_LIVE_PROBE_FAILED',
    'MCP initialize did not return a successful result',
  )
  const initializedSessionId = await mcpInitializedNotification({
    fetchImpl,
    url: mcp.url,
    token,
    sessionId: initialized.sessionId,
  })
  const verified = await mcpRequest({
    fetchImpl,
    url: mcp.url,
    token,
    id: requestId++,
    method: 'tools/call',
    params: { name: 'verify_connection', arguments: {} },
    sessionId: initializedSessionId,
  })
  const context = await mcpRequest({
    fetchImpl,
    url: mcp.url,
    token,
    id: requestId++,
    method: 'tools/call',
    params: { name: 'get_workmesh_context', arguments: {} },
    sessionId: verified.sessionId,
  })
  const fingerprint = fingerprintPrefix(token)
  const verifiedData = mcpToolData(verified.payload)
  const contextData = mcpToolData(context.payload)
  const verifyIdentity = assertRedeemedIdentity(verifiedData.connectionIdentity, redemption, fingerprint)
  const contextIdentity = assertRedeemedIdentity(contextData.connectionIdentity, redemption, fingerprint)
  if (JSON.stringify(stableIdentityProjection(verifyIdentity))
    !== JSON.stringify(stableIdentityProjection(contextIdentity)))
    fail('CONNECTION_IDENTITY_INCONSISTENT', 'MCP verification tools returned different Connection identities')
  const skill = requireObject(verifiedData.skill, 'MCP_SKILL_INVALID', 'verify_connection omitted the pinned Skill')
  for (const field of ['name', 'version', 'sha256', 'signature'])
    if (skill[field] !== redemption.skill[field])
      fail('MCP_SKILL_INVALID', 'verify_connection did not return the redeemed pinned Skill')
  const manifestAgent = requireObject(verifiedData.manifest?.agent, 'MCP_MANIFEST_INVALID', 'verify_connection omitted the capability manifest')
  if (manifestAgent.actorId !== verifyIdentity.agent_actor_id
    || manifestAgent.sessionId !== verifyIdentity.coordination_session.id)
    fail('MCP_MANIFEST_INVALID', 'Capability manifest identity did not match the Connection identity')
  const contextAgent = requireObject(contextData.identity, 'MCP_CONTEXT_INVALID', 'get_workmesh_context omitted the Agent identity')
  if (contextAgent.actorId !== verifyIdentity.agent_actor_id
    || contextAgent.sessionId !== verifyIdentity.coordination_session.id)
    fail('MCP_CONTEXT_INVALID', 'WorkMesh context identity did not match the Connection identity')
  return verifyIdentity
}

const tokenFromEnv = text => typeof text === 'string'
  ? /^WORKMESH_INSTALLATION_TOKEN=(.+)$/m.exec(text)?.[1]?.trim()
  : undefined

export function staleClientDiagnostic(existingEnv, processEnv, newFingerprint) {
  const fingerprints = [tokenFromEnv(existingEnv), processEnv.WORKMESH_INSTALLATION_TOKEN]
    .filter(value => typeof value === 'string' && value.startsWith(tokenPrefix))
    .map(fingerprintPrefix)
    .filter(value => value !== newFingerprint)
  const staleFingerprintPrefixes = [...new Set(fingerprints)]
  return staleFingerprintPrefixes.length
    ? {
        reload_required: true,
        diagnostic: 'STALE_CLIENT_CONFIGURATION',
        stale_fingerprint_prefixes: staleFingerprintPrefixes,
      }
    : { reload_required: false }
}

export async function pairAgentConnection(args, dependencies = {}) {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch
  const processEnv = dependencies.processEnv ?? process.env
  const verifySkill = dependencies.verifyDownloadedSkill ?? verifyDownloadedSkill
  const verifyIdentity = dependencies.verifyMcpIdentity ?? verifyMcpIdentity
  const writeConfig = dependencies.atomicWriteFile ?? atomicWriteFile
  const { pairingCode, redeemUrl } = resolvePairingEndpoints(args.url)
  const output = resolve(args.output ?? '.workmesh')
  await mkdir(output, { recursive: true, mode: 0o700 })
  const { idempotencyKey, statePath } = await loadOrCreateIdempotencyKey({
    output,
    redeemUrl,
    pairingCode,
    agentSlug: args['agent-slug'],
    client: args.client,
    clientVersion: args['client-version'] ?? 'unknown',
    explicitKey: args['idempotency-key'],
  })
  const response = await fetchImpl(redeemUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({
      pairingCode,
      agentSlug: args['agent-slug'],
      client: { type: args.client, version: args['client-version'] ?? 'unknown' },
    }),
  })
  const payload = await safeJson(response, 'PAIRING_RESPONSE_INVALID')
  if (response.status !== 200 || response.redirected)
    fail('PAIRING_REDEEM_FAILED', `Pairing failed with WorkMesh error ${payload?.error?.code ?? response.status}`)
  if (typeof payload.installation_token !== 'string'
    || !payload.installation_token.startsWith(tokenPrefix))
    fail('PAIRING_RESPONSE_INVALID', 'Pairing response did not contain a wmi_ Installation Token')
  const token = payload.installation_token
  const fingerprint = fingerprintPrefix(token)
  if (payload.connection?.credential_fingerprint_prefix !== fingerprint)
    fail('PAIRING_FINGERPRINT_MISMATCH', 'Installation Token fingerprint did not match the Connection response')

  const publicKeyPath = resolve(
    args['public-key'] ?? fileURLToPath(new URL('../public-key.pem', import.meta.url)),
  )
  await verifySkill(payload.skill, fetchImpl, publicKeyPath)
  const identity = await verifyIdentity(payload, token, fetchImpl)

  const envPath = resolve(output, '.env')
  const existingEnv = await readOptional(envPath, 'utf8')
  const stale = staleClientDiagnostic(existingEnv, processEnv, fingerprint)
  const mcpUrl = new URL(payload.mcp.url)
  const clientPath = resolve(output, `${args.client}.json`)
  const existingClient = await readOptional(clientPath, 'utf8')
  const clientConfiguration = `${JSON.stringify({
      name: 'workmesh',
      transport: 'streamable_http',
      url: payload.mcp.url,
      headers: { 'X-WorkMesh-Installation-Token': '${WORKMESH_INSTALLATION_TOKEN}' },
      skill: {
        name: payload.skill.name,
        version: payload.skill.version,
        sha256: payload.skill.sha256,
        download_url: payload.skill.download_url,
      },
    }, null, 2)}\n`
  const environmentConfiguration = `WORKMESH_API_URL=${mcpUrl.origin}\nWORKMESH_INSTALLATION_TOKEN=${token}\nWORKMESH_MCP_MODE=read-write\n`
  try {
    // Keep the secret-bearing file last; if either replacement fails, restore
    // the complete prior configuration set before surfacing the failure.
    await writeConfig(clientPath, clientConfiguration)
    await writeConfig(envPath, environmentConfiguration)
  } catch (error) {
    try {
      if (existingEnv === undefined) await rm(envPath, { force: true })
      else await writeConfig(envPath, existingEnv)
      if (existingClient === undefined) await rm(clientPath, { force: true })
      else await writeConfig(clientPath, existingClient)
    } catch {
      fail(
        'PAIRING_CONFIG_ROLLBACK_FAILED',
        'Pairing configuration replacement failed and the prior local configuration could not be fully restored',
      )
    }
    throw error
  }
  await rm(statePath, { force: true })
  return {
    paired: true,
    connection_id: identity.connection.id,
    agent_actor_id: identity.agent_actor_id,
    principal_human_actor_id: identity.principal_human_actor_id,
    team_id: identity.team_id,
    coordination_session_id: identity.coordination_session.id,
    authenticated_credential: {
      fingerprint_prefix: identity.authenticated_credential.fingerprint_prefix,
      status: identity.authenticated_credential.status,
    },
    client: args.client,
    output,
    ...stale,
    next: stale.reload_required
      ? 'Reload or restart the configured MCP client, then call verify_connection and confirm the new fingerprint.'
      : 'Call verify_connection again from the configured MCP client before beginning work.',
  }
}

async function main() {
  const args = parsePairingArguments(process.argv.slice(2))
  const result = await pairAgentConnection(args)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const known = error instanceof PairingError
    process.stderr.write(`${JSON.stringify({
      paired: false,
      error: {
        code: known ? error.code : 'PAIRING_UNEXPECTED_FAILURE',
        message: known ? error.message : 'Pairing failed unexpectedly; inspect local diagnostics without exposing credentials.',
      },
    })}\n`)
    process.exitCode = 1
  })
}
