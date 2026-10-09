import { z } from 'zod'
import { agentDiscoveryBindings, agentDiscoveryRules } from './agent-discovery-rules.js'

export type DiscoveryPredicate = Readonly<{ fact: string; allowed: readonly (string | boolean)[]; reason: string }>
export type DiscoveryRule = Readonly<{
  operationId: string
  predicates: readonly DiscoveryPredicate[]
  capabilities: readonly string[]
  feature: string | null
  write: boolean
  variants: readonly Readonly<{ variant: string; capabilitiesAll?: readonly string[]; [key: string]: unknown }>[]
}>
export type DiscoveryBindingRule = Readonly<{
  bindingId: string; operationIds: readonly string[]; execution: string
  mode: readonly string[]; coordination: boolean; identityBinding: string
  targetParameter: string | null
  variant: string | null
  identityVariants: readonly Readonly<{
    variant: string; credentialMode: readonly string[]; targetParameter: string | null
    installationBridgeRequired: boolean
  }>[]
}>

export const discoveryEligibilitySchema = z.object({
  status: z.enum(['eligible', 'blocked', 'requires_target_check']),
  reasons: z.array(z.string().min(1)),
  pendingChecks: z.array(z.string().min(1)),
}).strict()
export type DiscoveryEligibility = z.infer<typeof discoveryEligibilitySchema>
export const discoveryIdentitySchema = z.object({
  actorId: z.string().uuid(), sessionId: z.string().uuid(),
  credentialMode: z.enum(['agent_session', 'coordination_connection']),
  sessionKind: z.enum(['execution', 'coordination']),
  delegationRole: z.enum(['executor', 'reviewer', 'researcher', 'coordinator', 'triager']),
  delegationScopeType: z.enum(['work_item', 'plan_step', 'project', 'automation', 'team']),
}).strict()
export type DiscoveryIdentity = z.infer<typeof discoveryIdentitySchema>
export const qualifiedDiscoverySchema = z.object({
  request: z.literal('qualified'),
  identity: discoveryIdentitySchema,
  operations: z.array(z.object({
    operationId: z.string().min(1), variant: z.string().nullable(),
    requirements: z.object({
      capabilities: z.array(z.string()), predicates: z.array(z.object({
        fact: z.string(), allowed: z.array(z.union([z.string(), z.boolean()])), reason: z.string(),
      }).strict()),
    }).strict(),
    eligibility: discoveryEligibilitySchema,
  }).strict()),
}).strict()
export type QualifiedDiscovery = z.infer<typeof qualifiedDiscoverySchema>
export type DiscoveryFacts = Readonly<{
  identity: DiscoveryIdentity; state: string; capabilities: readonly string[]
  features: Readonly<Record<string, boolean>>; workItemId: string | null; projectId: string | null
}>

const queryDifferences = new Set(['getInitiativeRollup', 'getAutomationRun', 'getUsageSummary', 'streamA2ATaskEvents'])
const humanDomainOperations = new Set(['cancelHandoff', 'completeHandoff', 'createComment', 'updateComment'])
export const eligibility = (status: DiscoveryEligibility['status'], reasons: string[] = [], pendingChecks: string[] = []): DiscoveryEligibility =>
  ({ status, reasons, pendingChecks })

/** 只判断已知身份；缺少目标事实保留前提，绝不推定授权成功。 */
export function deriveOperationEligibility(facts: DiscoveryFacts): QualifiedDiscovery {
  const operations: QualifiedDiscovery['operations'] = []
  for (const rule of agentDiscoveryRules) {
    for (const variant of [null, ...rule.variants.map(item => item.variant)]) {
      const roleVariant = facts.identity.delegationRole === 'reviewer'
        ? rule.variants.find(item => item.variant === 'reviewer') : undefined
      const capabilities = [...new Set([...rule.capabilities,
        ...((rule.variants.find(item => item.variant === variant) ?? roleVariant)?.capabilitiesAll ?? [])])]
      const known: Record<string, string | boolean | undefined> = {
        credentialMode: facts.identity.credentialMode, sessionKind: facts.identity.sessionKind,
        role: facts.identity.delegationRole, state: facts.state,
        delegationScopeType: facts.identity.delegationScopeType,
        liveAuthority: true, capabilitiesAllPresent: capabilities.every(item => facts.capabilities.includes(item)),
        ...(rule.feature ? { featureEnabled: facts.features[rule.feature] === true } : {}),
      }
      if (!facts.workItemId && !facts.projectId) known.documentOwnerBinding = 'none'
      // 批准条件只适用于 awaiting_approval，其他状态不制造审批前提。
      if (facts.state !== 'awaiting_approval') known.planApprovalBound = true
      const reasons: string[] = [], pending: string[] = []
      if (humanDomainOperations.has(rule.operationId)) reasons.push('ROLE_REQUIRED')
      if (queryDifferences.has(rule.operationId)) reasons.push('DOMAIN_QUERY_NOT_AGENT_ALIGNED')
      for (const predicate of rule.predicates) {
        const value = known[predicate.fact]
        if (value === undefined) pending.push(predicate.fact)
        else if (!predicate.allowed.includes(value)) reasons.push(predicate.reason)
      }
      operations.push({ operationId: rule.operationId, variant,
        requirements: { capabilities, predicates: rule.predicates.map(item => ({ ...item, allowed: [...item.allowed] })) },
        eligibility: reasons.length ? eligibility('blocked', [...new Set(reasons)])
          : pending.length ? eligibility('requires_target_check', ['TARGET_CHECK_REQUIRED'], pending)
            : eligibility('eligible'),
      })
    }
  }
  return qualifiedDiscoverySchema.parse({ request: 'qualified', identity: facts.identity, operations })
}

export type AdapterDiscoveryIdentity =
  | { kind: 'exact_session'; qualification: QualifiedDiscovery }
  | { kind: 'installation_target'; session: null; delegation: null; manifest: null; qualification: null }
export type AdapterBindingDiscovery = {
  bindingId: string; operationIds: string[]; registered: boolean; deploymentSupported: boolean
  discoverable: boolean; identityVariant: string; eligibility: DiscoveryEligibility
}
export type AdapterDiscovery = {
  mode: 'read-only' | 'read-write'; bindings: AdapterBindingDiscovery[]; allowedOperations: string[]
}
export type AdapterDiscoveryInputs = {
  registeredBindings: readonly string[]; mode: 'read-only' | 'read-write'
  coordination: boolean; installationBridge: boolean; transport: 'http' | 'stdio' | 'embedded' | 'runner'
  targetQualification?: QualifiedDiscovery
}

/** API没有部署配置；此投影由adapter用真实注册表生成，每请求重新计算。 */
export function projectAdapterDiscovery(identity: AdapterDiscoveryIdentity, inputs: AdapterDiscoveryInputs): AdapterDiscovery {
  const bindings = agentDiscoveryBindings.map(rule => {
    const registered = inputs.registeredBindings.includes(rule.bindingId)
    const base = { bindingId: rule.bindingId, operationIds: [...rule.operationIds], registered,
      deploymentSupported: registered, discoverable: false, identityVariant: 'current_session' }
    const blocked = (reason: string): AdapterBindingDiscovery => ({ ...base, eligibility: eligibility('blocked', [reason]) })
    if (!registered) return blocked('ADAPTER_NOT_IMPLEMENTED')
    if (!rule.mode.includes(inputs.mode)) return blocked('READ_ONLY')
    if (rule.coordination && !inputs.coordination) return blocked('ADAPTER_NOT_IMPLEMENTED')
    if (rule.execution === 'adapter_internal') return { ...base, discoverable: true, eligibility: eligibility('eligible') }
    const credentialMode = identity.kind === 'exact_session' ? identity.qualification.identity.credentialMode : 'installation_target'
    const variant = rule.identityVariants.find(item => item.credentialMode.includes(credentialMode))
    if (!variant) return blocked('CREDENTIAL_MODE_MISMATCH')
    base.identityVariant = variant.variant
    if (variant.installationBridgeRequired && !inputs.installationBridge) return blocked('ADAPTER_NOT_IMPLEMENTED')
    if (identity.kind === 'installation_target') {
      return { ...base, discoverable: true, eligibility: eligibility('requires_target_check', ['TARGET_CHECK_REQUIRED'], ['exact_installation_target']) }
    }
    if (variant.variant === 'target_execution' && !inputs.targetQualification) {
      return { ...base, discoverable: true, eligibility: eligibility('requires_target_check', ['TARGET_CHECK_REQUIRED'], ['targetSessionId', 'targetQualification']) }
    }
    const qualification = variant.variant === 'target_execution' ? inputs.targetQualification! : identity.qualification
    const checks = rule.operationIds.map(operationId => qualification.operations.find(item => item.operationId === operationId && item.variant === rule.variant)?.eligibility
      ?? eligibility('blocked', ['ADAPTER_NOT_IMPLEMENTED']))
    const reasons = checks.filter(check => check.status === 'blocked').flatMap(check => check.reasons)
    const pending = checks.flatMap(check => check.pendingChecks)
    if (reasons.length) return { ...base, eligibility: eligibility('blocked', [...new Set(reasons)]) }
    return { ...base, discoverable: true, eligibility: pending.length
      ? eligibility('requires_target_check', ['TARGET_CHECK_REQUIRED'], [...new Set(pending)]) : eligibility('eligible') }
  })
  return { mode: inputs.mode, bindings, allowedOperations: [...new Set(bindings
    .filter(binding => binding.discoverable && binding.eligibility.status === 'eligible' && binding.identityVariant !== 'target_execution')
    .flatMap(binding => binding.operationIds))].sort() }
}

export { agentDiscoveryRules, agentDiscoveryBindings }
