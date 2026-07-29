import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { ApiActor } from './types.js'
import { assertAgentWrite } from './guard.js'

type MutationSession = Parameters<typeof assertAgentWrite>[0]['session']

const actor: ApiActor = {
  id: 'agent-actor',
  workspaceId: 'workspace',
  displayName: 'Agent',
  workspaceRole: 'member',
  csrfToken: '',
  kind: 'agent',
  agentSessionId: 'session',
}

const session: MutationSession = {
  id: 'session',
  actor_id: actor.id,
  delegation_id: 'delegation',
  state: 'executing' as const,
  revision: 1,
  stop_acknowledged_at: null,
  permissions_snapshot: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
  capability_scope: {
    teamIds: ['team'],
    workItemIds: ['work-item'],
    projectIds: ['project'],
  },
  delegation_status: 'active',
  team_id: 'team',
  work_item_id: null,
  work_item_exists: false,
  work_item_project_id: null,
  project_id: 'project',
  project_exists: true,
  current_plan_version_id: null,
  agent_id: 'agent',
  agent_active: true,
  definition_capabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
  team_capabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
}

const authorize = (facts: MutationSession): void => assertAgentWrite({
  actor,
  session: facts,
  sessionId: facts.id,
  capability: 'work:write',
  operation: 'activity',
  idempotencyKey: 'idempotency-key',
})

describe('shared Agent mutation resource liveness', () => {
  it('rejects a project-only Session whose Project is deleted', () => {
    expect(() => authorize({ ...session, project_exists: false })).toThrow(
      expect.objectContaining({ code: 'RESOURCE_SCOPE_DENIED' }),
    )
  })

  it('keeps a live Work Item independent of its parent Project liveness', () => {
    expect(() => authorize({
      ...session,
      work_item_id: 'work-item',
      work_item_exists: true,
      project_id: null,
      project_exists: false,
    })).not.toThrow()
  })

  it('rejects a Work Item Session whose own Work Item is deleted', () => {
    expect(() => authorize({
      ...session,
      work_item_id: 'work-item',
      work_item_exists: false,
      project_id: null,
      project_exists: false,
    })).toThrow(expect.objectContaining({ code: 'RESOURCE_SCOPE_DENIED' }))
  })

  it('routes ordinary Agent commands through the shared liveness guard', async () => {
    const source = await readFile(new URL('./commands.ts', import.meta.url), 'utf8')
    for (const name of [
      'acknowledge',
      'heartbeat',
      'appendActivity',
      'transitionState',
      'publishPlan',
      'finishSession',
      'stopAck',
      'publishArtifact',
      'requestApproval',
      'consumeApproval',
    ]) {
      const start = source.indexOf(`export async function ${name}`)
      const next = source.indexOf('\nexport async function ', start + 1)
      const command = source.slice(start, next === -1 ? source.length : next)
      expect(start, `${name} must remain exported`).toBeGreaterThanOrEqual(0)
      expect(command, `${name} must load shared mutation facts`).toContain(
        'loadAgentSessionForMutation',
      )
      expect(command, `${name} must enforce the shared mutation guard`).toContain(
        'assertAgentWrite',
      )
    }
  })

  it('locks the Session scope anchor before checking the exact Decision subject', async () => {
    const source = await readFile(new URL('../collaboration/routes.ts', import.meta.url), 'utf8')
    const start = source.indexOf('async function createDecision')
    const end = source.indexOf('\nasync function acquireLease', start)
    const command = source.slice(start, end)
    const sharedGuard = command.indexOf('authorizeCommandInTx')
    const exactSubjectGuard = command.indexOf('assertDecisionSubjectInSessionScope')

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(command).toContain("operation:'decision'")
    expect(command).not.toContain('resourceId:')
    expect(sharedGuard).toBeGreaterThanOrEqual(0)
    expect(exactSubjectGuard).toBeGreaterThan(sharedGuard)
  })

  it('locks the credential and live Session resources in the shared order', async () => {
    const source = await readFile(new URL('./guard.ts', import.meta.url), 'utf8')
    const start = source.indexOf('export async function loadAgentSessionForMutation')
    const command = source.slice(start)
    const sessionLocator = command.indexOf('FROM agent_sessions')
    const authorityPlan = command.indexOf('await lockAgentAuthorityPlan')
    const definitionRead = command.indexOf('FROM agent_definitions', authorityPlan)
    const teamGrantRead = command.indexOf('FROM agent_team_access', definitionRead)
    const delegationRead = command.indexOf('FROM delegations', teamGrantRead)
    const sessionRead = command.indexOf('FROM agent_sessions', delegationRead)
    const sessionTokenRead = command.indexOf('FROM agent_session_tokens', sessionRead)
    const installationTokenRead = command.indexOf(
      'FROM agent_installation_tokens',
      sessionTokenRead,
    )
    const workItemRead = command.indexOf('FROM work_items', installationTokenRead)
    const projectRead = command.indexOf('FROM projects', workItemRead)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(authorityPlan).toBeGreaterThan(sessionLocator)
    expect(definitionRead).toBeGreaterThan(authorityPlan)
    expect(teamGrantRead).toBeGreaterThan(definitionRead)
    expect(delegationRead).toBeGreaterThan(teamGrantRead)
    expect(sessionRead).toBeGreaterThan(delegationRead)
    expect(sessionTokenRead).toBeGreaterThan(sessionRead)
    expect(installationTokenRead).toBeGreaterThan(sessionTokenRead)
    expect(workItemRead).toBeGreaterThan(installationTokenRead)
    expect(projectRead).toBeGreaterThan(workItemRead)
    expect(command).not.toContain('SELECT live_project.id')
  })
})
