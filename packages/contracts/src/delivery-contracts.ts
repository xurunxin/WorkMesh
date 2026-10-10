import { z } from 'zod'

export const providerActionQuerySchema = z.object({}).strict()
export const providerActionErrorCodeSchema = z.enum([
  'PROVIDER_ACTION_FAILED', 'PROVIDER_ACTION_AUTHORITY_REVOKED', 'PROVIDER_HEAD_SHA_MISMATCH',
  'MERGE_APPROVAL_MISMATCH', 'MERGE_APPROVAL_EXPIRED', 'MERGE_CHECKS_BLOCKED',
  'PROVIDER_CAPABILITY_UNSUPPORTED', 'PROVIDER_ACTION_CLAIM_LOST',
  'PROVIDER_ACTION_OUTCOME_UNKNOWN', 'RESULT_UNAVAILABLE',
])
const id = z.string().uuid()
const sha = z.string().min(1).max(200)
const branch = z.string().min(1).max(500)
// Existing delivery responses retain extension fields and their original envelopes.
export const repositoryResponseSchema=z.object({id,full_name:z.string(),default_branch:branch}).passthrough()
export const repositoryContextResponseSchema=z.object({id,repository_id:id,base_branch:branch,base_sha:sha,
  allowed_paths:z.array(z.string()),permissions:z.array(z.string()),guidance:z.array(z.object({
    path:z.string(),blobSha:sha,contentHash:z.string(),content:z.string(),
  }).passthrough())}).passthrough()
export const deliveryArtifactResponseSchema=z.object({id,type:z.string(),title:z.string(),checksum:z.string().nullable(),source_tool:z.string().nullable()}).passthrough()
export const artifactUploadResponseSchema=z.object({id,uploadUrl:z.string().url(),expiresAt:z.string().datetime({offset:true}),
  requiredChecksum:z.string().regex(/^sha256:[a-f0-9]{64}$/),requiredHeaders:z.record(z.string())}).passthrough()
export const artifactUploadCancelResponseSchema=z.object({id,status:z.literal('canceled')}).passthrough()
export const artifactDownloadResponseSchema=z.object({downloadUrl:z.string().url()}).passthrough()
const deliveryFact=z.object({}).passthrough()
export const projectDeliveryResponseSchema=z.object({
  milestones:z.array(deliveryFact),updates:z.array(deliveryFact),artifacts:z.array(deliveryFact),dependencies:z.array(deliveryFact),
  completionSuggestions:z.array(deliveryFact),providerPullRequests:z.array(z.object({id,headSha:sha,checks:z.array(deliveryFact)}).passthrough()),
  providerReviews:z.array(deliveryFact),workMeshStructuredReviews:z.array(z.object({pullRequestId:id,headSha:sha,
    findings:z.array(deliveryFact),authority:z.literal('workmesh_structured_review')}).passthrough()),mergeApprovals:z.array(deliveryFact),
}).passthrough()
export type RepositoryResponse=z.infer<typeof repositoryResponseSchema>
export type RepositoryContextResponse=z.infer<typeof repositoryContextResponseSchema>
export type DeliveryArtifactResponse=z.infer<typeof deliveryArtifactResponseSchema>
export type ProjectDeliveryResponse=z.infer<typeof projectDeliveryResponseSchema>
export type ArtifactUploadResponse=z.infer<typeof artifactUploadResponseSchema>
const common = {
  id, provider: z.enum(['fake', 'github', 'gitea']), connectionId: id, repositoryId: id,
  requesterActorId: id, sessionId: id.nullable(), workItemId: id.nullable(), projectId: id.nullable(),
  planStepId: id.nullable(), expectedHeadSha: sha.nullable(), approvalId: id.nullable(),
  status: z.enum(['pending', 'claimed', 'completed', 'failed', 'dead']),
  effect: z.enum(['committed', 'checkpointed', 'unknown']),
  artifactIds: z.array(id).max(100).refine(ids => new Set(ids).size === ids.length, 'Duplicate ID'),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  error: z.object({ code: providerActionErrorCodeSchema }).strict().nullable(),
  recovery: z.object({ kind: z.enum(['none', 'poll_same_action', 'human_reconcile']),
    scheduled: z.boolean(), nextQueryAt: z.string().datetime({ offset: true }).nullable() }).strict(),
}
export const providerActionProjectionSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('create_branch'),
    target: z.object({ branchName: branch, baseSha: sha }).strict(),
    result: z.object({ branchName: branch, headSha: sha }).strict().nullable() }).strict(),
  z.object({ ...common, kind: z.literal('create_commit'),
    target: z.object({ branchName: branch, expectedHeadSha: sha }).strict(),
    result: z.object({ providerCommitId: sha, sha, branchName: branch }).strict().nullable() }).strict(),
  z.object({ ...common, kind: z.literal('open_pull_request'),
    target: z.object({ baseBranch: branch, headBranch: branch }).strict(),
    result: z.object({ providerPullRequestId: branch, number: z.number().int().positive(), projectionId: id.nullable(),
      baseSha: sha, headSha: sha, state: z.enum(['open', 'closed', 'merged']) }).strict().nullable() }).strict(),
  z.object({ ...common, kind: z.literal('merge_pull_request'),
    target: z.object({ providerPullRequestId: branch, headSha: sha, method: z.enum(['merge', 'squash', 'rebase']) }).strict(),
    result: z.object({ merged: z.literal(true), mergeSha: sha }).strict().nullable() }).strict(),
  z.object({ ...common, kind: z.literal('retry_ci_check'),
    target: z.object({ providerPullRequestId: branch, headSha: sha, checkRunId: branch }).strict(),
    result: z.object({ requested: z.literal(true), checkRunId: branch }).strict().nullable() }).strict(),
  z.object({ ...common, kind: z.literal('resolve_repository_context'),
    target: z.object({ resourceKind: z.enum(['project', 'work_item', 'session']), resourceId: id }).strict(),
    result: z.object({ contextId: id }).strict().nullable() }).strict(),
]).superRefine((value, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
  if ((value.effect === 'unknown') !== (value.result === null)) reject('Effect and result must agree')
  if (value.effect === 'committed' && value.status !== 'completed') reject('Local completion is required')
  if (value.effect === 'checkpointed' && value.status === 'completed') reject('Checkpoint is not local completion')
  if (value.kind !== 'resolve_repository_context' && (!value.sessionId || !value.workItemId)) reject('Exact E binding is required')
  if (value.kind === 'open_pull_request' && value.effect === 'committed' && !value.result?.projectionId) reject('Exact local PR reference is required')
  if (value.recovery.kind !== 'poll_same_action' && (value.recovery.scheduled || value.recovery.nextQueryAt)) reject('No scheduled recovery')
  if (value.recovery.kind === 'poll_same_action' && !value.recovery.nextQueryAt) reject('Next query boundary is required')
  if (value.error?.code === 'PROVIDER_ACTION_OUTCOME_UNKNOWN' &&
      (value.status !== 'dead' || value.effect !== 'unknown' || value.recovery.kind !== 'human_reconcile')) reject('Unproven recovery must stop sending')
})
export type ProviderActionProjection = z.infer<typeof providerActionProjectionSchema>

const checkpointSchemas = {
  create_branch: z.object({ name: branch, headSha: sha }),
  create_commit: z.object({ id: sha, sha, branch, uri: z.string().max(2000) }),
  open_pull_request: z.object({ id: branch, number: z.number().int().positive(), uri: z.string().max(2000),
    baseBranch: branch, headBranch: branch, baseSha: sha, headSha: sha,
    state: z.enum(['open', 'closed', 'merged']), draft: z.boolean() }),
  merge_pull_request: z.object({ merged: z.literal(true), mergeSha: sha }),
  retry_ci_check: z.object({ requested: z.literal(true), checkRunId: branch }),
  resolve_repository_context: z.object({ contextId: id.optional(), guidance: z.array(z.object({
    path: z.string().min(1), blobSha: sha, contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/), content: z.string(),
  })) }),
}
/** Validate durable provider results before recovery or safe projection. */
export function parseProviderActionCheckpoint(action: {
  kind: keyof typeof checkpointSchemas; provider: string; payload: Record<string, unknown>; result: unknown;
}): Record<string, unknown> | null {
  const parsed = checkpointSchemas[action.kind].safeParse(action.result)
  if (!parsed.success) return null
  const result = parsed.data as Record<string, unknown>
  const payload = action.payload
  if (action.kind === 'create_branch' && (result.name !== payload.name || result.headSha !== payload.baseSha)) return null
  if (action.kind === 'create_commit' && result.branch !== payload.branch) return null
  if (action.kind === 'open_pull_request' && (result.baseBranch !== payload.baseBranch || result.headBranch !== payload.headBranch)) return null
  if (action.kind === 'retry_ci_check' && (action.provider === 'gitea' || result.checkRunId !== payload.checkRunId)) return null
  if (action.kind === 'create_commit' && action.provider === 'gitea' && (!Array.isArray(payload.files) || payload.files.length !== 1)) return null
  return result
}
