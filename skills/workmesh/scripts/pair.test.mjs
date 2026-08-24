import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PairingError,
  atomicWriteFile,
  assertRedeemedIdentity,
  loadOrCreateIdempotencyKey,
  pairAgentConnection,
  resolvePairingEndpoints,
  staleClientDiagnostic,
  verifyDownloadedSkill,
  verifyMcpIdentity,
} from './pair.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path =>
    rm(path, { recursive: true, force: true })))
})

describe('WorkMesh pairing helper', () => {
  it('keeps the pairing code in the URL fragment and derives the exact redeem route', () => {
    const endpoints = resolvePairingEndpoints('https://workmesh.example/connect#wmp_fixture')
    assert.equal(endpoints.pairingCode, 'wmp_fixture')
    assert.equal(endpoints.redeemUrl, 'https://workmesh.example/api/v1/agent-connections/redeem')
    assert.throws(
      () => resolvePairingEndpoints('https://workmesh.example/connect?wmp_fixture'),
      error => error instanceof PairingError && error.code === 'PAIRING_URL_INVALID',
    )
  })

  it('persists only a scoped non-secret Idempotency-Key and reuses it after response loss', async () => {
    const output = await mkdtemp(resolve(tmpdir(), 'workmesh-pairing-'))
    temporaryDirectories.push(output)
    const input = {
      output,
      redeemUrl: 'https://workmesh.example/api/v1/agent-connections/redeem',
      pairingCode: 'wmp_fixture',
      agentSlug: 'codex-fixture',
      client: 'codex',
      clientVersion: '1.0.0',
    }
    const first = await loadOrCreateIdempotencyKey(input)
    const replay = await loadOrCreateIdempotencyKey(input)
    assert.equal(replay.idempotencyKey, first.idempotencyKey)
    const state = await readFile(first.statePath, 'utf8')
    assert.doesNotMatch(state, /wmp_fixture/)
    assert.doesNotMatch(state, /installation_token/i)
    const upgraded = await loadOrCreateIdempotencyKey({
      ...input,
      clientVersion: '1.0.1',
    })
    assert.notEqual(upgraded.statePath, first.statePath)
    assert.notEqual(upgraded.idempotencyKey, first.idempotencyKey)
  })

  it('accepts only the identity for the exact authenticated credential fingerprint', () => {
    const token = 'wmi_fixture'
    const fingerprint = createHash('sha256').update(token).digest('hex').slice(0, 12)
    const redemption = {
      connection: {
        id: '00000000-0000-4000-8000-000000000001',
        agent_actor_id: '00000000-0000-4000-8000-000000000002',
        principal_human_actor_id: '00000000-0000-4000-8000-000000000003',
        team_id: '00000000-0000-4000-8000-000000000004',
        granted_capabilities: ['work:read'],
      },
      principal_human_actor_id: '00000000-0000-4000-8000-000000000003',
      team_id: '00000000-0000-4000-8000-000000000004',
    }
    const identity = {
      connection: redemption.connection,
      coordination_session: {
        id: '00000000-0000-4000-8000-000000000005',
        connection_id: redemption.connection.id,
        team_id: redemption.team_id,
        principal_human_actor_id: redemption.principal_human_actor_id,
        granted_capabilities: ['work:read'],
      },
      agent_actor_id: redemption.connection.agent_actor_id,
      principal_human_actor_id: redemption.principal_human_actor_id,
      team_id: redemption.team_id,
      granted_capabilities: ['work:read'],
      authenticated_credential: {
        fingerprint_prefix: fingerprint,
        status: 'active',
        overlap_until: null,
      },
    }
    assert.equal(assertRedeemedIdentity(identity, redemption, fingerprint), identity)
    assert.throws(
      () => assertRedeemedIdentity(identity, redemption, 'ffffffffffff'),
      error => error instanceof PairingError && error.code === 'CONNECTION_IDENTITY_INCONSISTENT',
    )
  })

  it('reports stale local or process credentials using fingerprints only', () => {
    const next = createHash('sha256').update('wmi_next').digest('hex').slice(0, 12)
    const diagnostic = staleClientDiagnostic(
      'WORKMESH_INSTALLATION_TOKEN=wmi_previous\n',
      { WORKMESH_INSTALLATION_TOKEN: 'wmi_previous_process' },
      next,
    )
    assert.equal(diagnostic.reload_required, true)
    assert.equal(diagnostic.diagnostic, 'STALE_CLIENT_CONFIGURATION')
    assert.equal(JSON.stringify(diagnostic).includes('wmi_previous'), false)
  })

  it('sends initialized and compares only stable identity fields across live MCP probes', async () => {
    const token = 'wmi_fixture'
    const fingerprint = createHash('sha256').update(token).digest('hex').slice(0, 12)
    const connection = {
      id: '00000000-0000-4000-8000-000000000011',
      team_id: '00000000-0000-4000-8000-000000000012',
      agent_actor_id: '00000000-0000-4000-8000-000000000013',
      principal_human_actor_id: '00000000-0000-4000-8000-000000000014',
      granted_capabilities: ['work:read'],
    }
    const redemption = {
      connection,
      team_id: connection.team_id,
      principal_human_actor_id: connection.principal_human_actor_id,
      mcp: { url: 'https://workmesh.example/mcp' },
      skill: {
        name: 'workmesh',
        version: '1.1.0',
        sha256: `sha256:${'a'.repeat(64)}`,
        signature: 'ed25519:fixture',
      },
    }
    const identity = lastUsedAt => ({
      connection: { ...connection, last_used_at: lastUsedAt },
      coordination_session: {
        id: '00000000-0000-4000-8000-000000000015',
        connection_id: connection.id,
        team_id: connection.team_id,
        principal_human_actor_id: connection.principal_human_actor_id,
        granted_capabilities: ['work:read'],
        refreshed_at: lastUsedAt,
      },
      agent_actor_id: connection.agent_actor_id,
      principal_human_actor_id: connection.principal_human_actor_id,
      team_id: connection.team_id,
      granted_capabilities: ['work:read'],
      authenticated_credential: {
        fingerprint_prefix: fingerprint,
        status: 'active',
        overlap_until: null,
      },
    })
    const methods = []
    const fetchImpl = async (_url, init) => {
      const request = JSON.parse(init.body)
      methods.push(request.method)
      if (request.method === 'initialize')
        return Response.json({ jsonrpc: '2.0', id: request.id, result: {} }, {
          headers: { 'mcp-session-id': 'fixture-session' },
        })
      if (request.method === 'notifications/initialized') {
        assert.equal(request.id, undefined)
        assert.equal(init.headers['mcp-session-id'], 'fixture-session')
        return new Response(null, { status: 202 })
      }
      const connectionIdentity = identity(
        request.params.name === 'verify_connection'
          ? '2026-08-22T00:00:00.000Z'
          : '2026-08-22T00:00:01.000Z',
      )
      const data = request.params.name === 'verify_connection'
        ? {
            connectionIdentity,
            manifest: {
              agent: {
                actorId: connection.agent_actor_id,
                sessionId: connectionIdentity.coordination_session.id,
              },
            },
            skill: redemption.skill,
          }
        : {
            connectionIdentity,
            identity: {
              actorId: connection.agent_actor_id,
              sessionId: connectionIdentity.coordination_session.id,
            },
          }
      return Response.json({
        jsonrpc: '2.0',
        id: request.id,
        result: { isError: false, structuredContent: { data } },
      })
    }
    const verified = await verifyMcpIdentity(redemption, token, fetchImpl)
    assert.equal(verified.connection.id, connection.id)
    assert.deepEqual(methods, [
      'initialize',
      'notifications/initialized',
      'tools/call',
      'tools/call',
    ])
  })

  it('stops before initialized notification when initialize returns a JSON-RPC error', async () => {
    const methods = []
    await assert.rejects(verifyMcpIdentity({
      mcp: { url: 'https://workmesh.example/mcp' },
    }, 'wmi_fixture', async (_url, init) => {
      const request = JSON.parse(init.body)
      methods.push(request.method)
      return Response.json({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32_000, message: 'initialize rejected' },
      })
    }), error => error instanceof PairingError
      && error.code === 'MCP_LIVE_PROBE_FAILED')
    assert.deepEqual(methods, ['initialize'])
  })

  it('keeps final configuration absent when verification fails after redemption', async () => {
    const output = await mkdtemp(resolve(tmpdir(), 'workmesh-pairing-failure-'))
    temporaryDirectories.push(output)
    const token = 'wmi_verification_failure_fixture'
    const fingerprint = createHash('sha256').update(token).digest('hex').slice(0, 12)
    let requests = 0
    const fetchImpl = async () => {
      requests += 1
      if (requests === 1)
        return Response.json({
          installation_token: token,
          connection: {
            id: '00000000-0000-4000-8000-000000000021',
            agent_actor_id: '00000000-0000-4000-8000-000000000022',
            principal_human_actor_id: '00000000-0000-4000-8000-000000000023',
            team_id: '00000000-0000-4000-8000-000000000024',
            granted_capabilities: ['work:read'],
            credential_fingerprint_prefix: fingerprint,
          },
          principal_human_actor_id: '00000000-0000-4000-8000-000000000023',
          team_id: '00000000-0000-4000-8000-000000000024',
          skill: {
            name: 'workmesh',
            version: '1.1.0',
            download_url: 'https://workmesh.example/skills/workmesh-1.1.0.md',
            sha256: `sha256:${'0'.repeat(64)}`,
            signature: 'ed25519:fixture',
          },
          mcp: { url: 'https://workmesh.example/mcp' },
        })
      return new Response('different skill bytes', { status: 200 })
    }
    let serializedError = ''
    await assert.rejects(
      pairAgentConnection({
        url: 'https://workmesh.example/connect#wmp_failure_fixture',
        client: 'codex',
        'agent-slug': 'failure-fixture',
        'client-version': '1.0.0',
        output,
      }, { fetch: fetchImpl, processEnv: {} }),
      error => {
        serializedError = JSON.stringify({ code: error.code, message: error.message })
        return error instanceof PairingError
          && error.code === 'AGENT_SKILL_VERSION_MISMATCH'
      },
    )
    await assert.rejects(readFile(resolve(output, 'codex.json')), { code: 'ENOENT' })
    await assert.rejects(readFile(resolve(output, '.env')), { code: 'ENOENT' })
    const files = await readdir(output)
    assert.equal(files.some(file => file.startsWith('.pairing-')), true)
    const retainedState = (await Promise.all(files.map(file =>
      readFile(resolve(output, file), 'utf8')))).join('\n')
    assert.doesNotMatch(retainedState, /wmi_verification_failure_fixture/)
    assert.doesNotMatch(serializedError, /wmi_verification_failure_fixture/)
  })

  it('restores the prior configuration set when the secret-file replacement fails', async () => {
    const output = await mkdtemp(resolve(tmpdir(), 'workmesh-pairing-rollback-'))
    temporaryDirectories.push(output)
    const oldClient = '{"old":true}\n'
    const oldEnvironment = 'WORKMESH_INSTALLATION_TOKEN=wmi_old_fixture\n'
    await atomicWriteFile(resolve(output, 'codex.json'), oldClient)
    await atomicWriteFile(resolve(output, '.env'), oldEnvironment)
    const token = 'wmi_new_fixture'
    const fingerprint = createHash('sha256').update(token).digest('hex').slice(0, 12)
    const connection = {
      id: '00000000-0000-4000-8000-000000000031',
      team_id: '00000000-0000-4000-8000-000000000032',
      agent_actor_id: '00000000-0000-4000-8000-000000000033',
      principal_human_actor_id: '00000000-0000-4000-8000-000000000034',
      granted_capabilities: ['work:read'],
      credential_fingerprint_prefix: fingerprint,
    }
    const redemption = {
      installation_token: token,
      connection,
      team_id: connection.team_id,
      principal_human_actor_id: connection.principal_human_actor_id,
      skill: {
        name: 'workmesh',
        version: '1.1.0',
        download_url: 'https://workmesh.example/skills/workmesh-1.1.0.md',
        sha256: `sha256:${'a'.repeat(64)}`,
        signature: 'ed25519:fixture',
      },
      mcp: { url: 'https://workmesh.example/mcp' },
    }
    const identity = {
      connection,
      coordination_session: {
        id: '00000000-0000-4000-8000-000000000035',
      },
      agent_actor_id: connection.agent_actor_id,
      principal_human_actor_id: connection.principal_human_actor_id,
      team_id: connection.team_id,
      authenticated_credential: { fingerprint_prefix: fingerprint, status: 'active' },
    }
    let writeCount = 0
    await assert.rejects(pairAgentConnection({
      url: 'https://workmesh.example/connect#wmp_rollback_fixture',
      client: 'codex',
      'agent-slug': 'rollback-fixture',
      'client-version': '1.0.0',
      output,
    }, {
      fetch: async () => Response.json(redemption),
      processEnv: {},
      verifyDownloadedSkill: async () => undefined,
      verifyMcpIdentity: async () => identity,
      atomicWriteFile: async (...writeArguments) => {
        writeCount += 1
        await atomicWriteFile(...writeArguments)
        if (writeCount === 2) throw new Error('simulated environment replacement failure')
      },
    }), /simulated environment replacement failure/)
    assert.equal(await readFile(resolve(output, 'codex.json'), 'utf8'), oldClient)
    assert.equal(await readFile(resolve(output, '.env'), 'utf8'), oldEnvironment)
    assert.equal(writeCount, 4)
  })

  it('verifies the repository Skill using the exact raw bytes, hash, and signature', async () => {
    const root = resolve(import.meta.dirname, '../../..')
    const [bytes, manifestSource] = await Promise.all([
      readFile(resolve(root, 'apps/web/public/skills/workmesh-1.1.0.md')),
      readFile(resolve(root, 'packages/contracts/src/workmesh-skill-manifest.ts'), 'utf8'),
    ])
    const manifest = /sha256: '([^']+)',\s+signature: '([^']+)'/s.exec(manifestSource)
    assert.ok(manifest)
    const result = await verifyDownloadedSkill({
      download_url: 'https://workmesh.example/skills/workmesh-1.1.0.md',
      sha256: manifest[1],
      signature: manifest[2],
    }, async () => new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'text/markdown' },
    }), resolve(root, 'skills/workmesh/public-key.pem'))
    assert.equal(result.sha256, manifest[1])
  })
})
