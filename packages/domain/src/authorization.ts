import type {
  RoutePolicyActorKind,
  RoutePolicyManifestEntry,
} from '@workmesh/contracts'

export type AuthorizationStage =
  | 'identity'
  | 'session'
  | 'delegation'
  | 'capability'
  | 'resource_scope'
  | 'human_role'
  | 'approval'
  | 'lease'
  | 'revision'
  | 'idempotency'

export type RouteAuthorizationFacts = Readonly<{
  principalKind: RoutePolicyActorKind | null
  workspaceRole?: 'admin' | 'member'
  teamRole?: 'admin' | 'maintainer' | 'member'
  sessionBound?: boolean
  sessionActive?: boolean
  delegationActive?: boolean
  liveCapabilities?: readonly string[]
  resourceInScope?: boolean
  approvalValid?: boolean
  leaseValid?: boolean
  revisionPresent?: boolean
  idempotencyPresent?: boolean
}>

export type RouteAuthorizationDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{
      allowed: false
      code: string
      stage: AuthorizationStage
      reason: string
    }>

const deny = (
  code: string,
  stage: AuthorizationStage,
  reason: string,
): RouteAuthorizationDecision => ({ allowed: false, code, stage, reason })

export function evaluateRouteAuthorization(
  policy: RoutePolicyManifestEntry,
  facts: RouteAuthorizationFacts,
): RouteAuthorizationDecision {
  if (policy.authentication === 'public') return { allowed: true }
  if (!facts.principalKind || !policy.actorKinds.includes(facts.principalKind)) {
    return deny('UNAUTHENTICATED', 'identity', 'The route requires a matching authenticated principal')
  }

  if (facts.principalKind === 'human') {
    if (!facts.workspaceRole || !policy.human.workspaceRoles.includes(facts.workspaceRole)) {
      return deny('FORBIDDEN', 'human_role', 'The human principal lacks the required Workspace role')
    }
    if (
      policy.human.membership === 'resolved_team'
      && facts.workspaceRole !== 'admin'
      && (!facts.teamRole || !policy.human.teamRoles.includes(facts.teamRole))
    ) {
      return deny('FORBIDDEN', 'human_role', 'The human principal lacks the required Team role')
    }
  }

  if (facts.principalKind === 'agent') {
    if (policy.agent.sessionBinding !== 'none' && !facts.sessionBound) {
      return deny('SESSION_SCOPE_DENIED', 'session', 'The credential is not bound to the target session')
    }
    if (policy.agent.requireActiveSession && !facts.sessionActive) {
      return deny('SESSION_NOT_ACTIVE', 'session', 'The Agent Session is no longer active')
    }
    if (policy.agent.requireActiveDelegation && !facts.delegationActive) {
      return deny('DELEGATION_NOT_ACTIVE', 'delegation', 'The Delegation is no longer active')
    }
    if (policy.agent.requireLiveGrantIntersection) {
      const live = new Set(facts.liveCapabilities ?? [])
      if (policy.agent.capabilities.some(capability => !live.has(capability))) {
        return deny('CAPABILITY_DENIED', 'capability', 'The live capability intersection does not permit this operation')
      }
    }
    if (policy.agent.resourceScope === 'resolved_resource' && !facts.resourceInScope) {
      return deny('RESOURCE_SCOPE_DENIED', 'resource_scope', 'The resolved resource is outside the Delegation scope')
    }
  }

  if (policy.approval.required && !facts.approvalValid) {
    return deny('APPROVAL_REQUIRED', 'approval', 'A matching live Approval is required')
  }
  if (policy.lease.required && !facts.leaseValid) {
    return deny('LEASE_CONFLICT', 'lease', 'The required coordination Lease is not held')
  }
  if (policy.revision === 'if_match' && !facts.revisionPresent) {
    return deny('IF_MATCH_REQUIRED', 'revision', 'If-Match is required')
  }
  if (policy.idempotency === 'required' && !facts.idempotencyPresent) {
    return deny('IDEMPOTENCY_KEY_REQUIRED', 'idempotency', 'Idempotency-Key is required')
  }
  return { allowed: true }
}
