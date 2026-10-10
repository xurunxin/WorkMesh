// Proposed：规划DTO，尚未产品实施。
import { z } from "zod"

export const providerActionQueryProposalSchema = z.object({}).strict()
export const reviewRepositoryIdsProposalSchema = z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate ID")
export const providerActionProjectionProposalSchema = z.discriminatedUnion("kind", [
z.object({
  "id": z.string().uuid(),
  "provider": z.enum(["fake", "github", "gitea"]),
  "connectionId": z.string().uuid(),
  "repositoryId": z.string().uuid(),
  "requesterActorId": z.string().uuid(),
  "sessionId": z.string().uuid().nullable(),
  "workItemId": z.string().uuid().nullable(),
  "projectId": z.string().uuid().nullable(),
  "planStepId": z.string().uuid().nullable(),
  "expectedHeadSha": z.string().min(1).max(200).nullable(),
  "approvalId": z.string().uuid().nullable(),
  "status": z.enum(["pending", "claimed", "completed", "failed", "dead"]),
  "effect": z.enum(["committed", "checkpointed", "unknown"]),
  "artifactIds": z.array(z.string().uuid()).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate ID"),
  "createdAt": z.string().datetime({ offset: true }),
  "updatedAt": z.string().datetime({ offset: true }),
  "completedAt": z.string().datetime({ offset: true }).nullable(),
  "error": z.object({
  "code": z.enum(["PROVIDER_ACTION_FAILED", "PROVIDER_ACTION_AUTHORITY_REVOKED", "PROVIDER_HEAD_SHA_MISMATCH", "MERGE_APPROVAL_MISMATCH", "MERGE_APPROVAL_EXPIRED", "MERGE_CHECKS_BLOCKED", "PROVIDER_CAPABILITY_UNSUPPORTED", "PROVIDER_ACTION_CLAIM_LOST", "RESULT_UNAVAILABLE"]),
}).strict().nullable(),
  "recovery": z.object({
  "kind": z.enum(["none", "poll_same_action", "human_reconcile"]),
  "scheduled": z.boolean(),
  "nextQueryAt": z.string().datetime({ offset: true }).nullable(),
}).strict(),
  "kind": z.literal("create_branch"),
  "target": z.object({
  "branchName": z.string().min(1).max(500),
  "baseSha": z.string().min(1).max(200),
}).strict(),
  "result": z.object({
  "branchName": z.string().min(1).max(500),
  "headSha": z.string().min(1).max(200),
}).strict().nullable(),
}).strict(),
z.object({
  "id": z.string().uuid(),
  "provider": z.enum(["fake", "github", "gitea"]),
  "connectionId": z.string().uuid(),
  "repositoryId": z.string().uuid(),
  "requesterActorId": z.string().uuid(),
  "sessionId": z.string().uuid().nullable(),
  "workItemId": z.string().uuid().nullable(),
  "projectId": z.string().uuid().nullable(),
  "planStepId": z.string().uuid().nullable(),
  "expectedHeadSha": z.string().min(1).max(200).nullable(),
  "approvalId": z.string().uuid().nullable(),
  "status": z.enum(["pending", "claimed", "completed", "failed", "dead"]),
  "effect": z.enum(["committed", "checkpointed", "unknown"]),
  "artifactIds": z.array(z.string().uuid()).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate ID"),
  "createdAt": z.string().datetime({ offset: true }),
  "updatedAt": z.string().datetime({ offset: true }),
  "completedAt": z.string().datetime({ offset: true }).nullable(),
  "error": z.object({
  "code": z.enum(["PROVIDER_ACTION_FAILED", "PROVIDER_ACTION_AUTHORITY_REVOKED", "PROVIDER_HEAD_SHA_MISMATCH", "MERGE_APPROVAL_MISMATCH", "MERGE_APPROVAL_EXPIRED", "MERGE_CHECKS_BLOCKED", "PROVIDER_CAPABILITY_UNSUPPORTED", "PROVIDER_ACTION_CLAIM_LOST", "RESULT_UNAVAILABLE"]),
}).strict().nullable(),
  "recovery": z.object({
  "kind": z.enum(["none", "poll_same_action", "human_reconcile"]),
  "scheduled": z.boolean(),
  "nextQueryAt": z.string().datetime({ offset: true }).nullable(),
}).strict(),
  "kind": z.literal("create_commit"),
  "target": z.object({
  "branchName": z.string().min(1).max(500),
  "expectedHeadSha": z.string().min(1).max(200),
}).strict(),
  "result": z.object({
  "providerCommitId": z.string().min(1).max(200),
  "sha": z.string().min(1).max(200),
  "branchName": z.string().min(1).max(500),
}).strict().nullable(),
}).strict(),
z.object({
  "id": z.string().uuid(),
  "provider": z.enum(["fake", "github", "gitea"]),
  "connectionId": z.string().uuid(),
  "repositoryId": z.string().uuid(),
  "requesterActorId": z.string().uuid(),
  "sessionId": z.string().uuid().nullable(),
  "workItemId": z.string().uuid().nullable(),
  "projectId": z.string().uuid().nullable(),
  "planStepId": z.string().uuid().nullable(),
  "expectedHeadSha": z.string().min(1).max(200).nullable(),
  "approvalId": z.string().uuid().nullable(),
  "status": z.enum(["pending", "claimed", "completed", "failed", "dead"]),
  "effect": z.enum(["committed", "checkpointed", "unknown"]),
  "artifactIds": z.array(z.string().uuid()).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate ID"),
  "createdAt": z.string().datetime({ offset: true }),
  "updatedAt": z.string().datetime({ offset: true }),
  "completedAt": z.string().datetime({ offset: true }).nullable(),
  "error": z.object({
  "code": z.enum(["PROVIDER_ACTION_FAILED", "PROVIDER_ACTION_AUTHORITY_REVOKED", "PROVIDER_HEAD_SHA_MISMATCH", "MERGE_APPROVAL_MISMATCH", "MERGE_APPROVAL_EXPIRED", "MERGE_CHECKS_BLOCKED", "PROVIDER_CAPABILITY_UNSUPPORTED", "PROVIDER_ACTION_CLAIM_LOST", "RESULT_UNAVAILABLE"]),
}).strict().nullable(),
  "recovery": z.object({
  "kind": z.enum(["none", "poll_same_action", "human_reconcile"]),
  "scheduled": z.boolean(),
  "nextQueryAt": z.string().datetime({ offset: true }).nullable(),
}).strict(),
  "kind": z.literal("open_pull_request"),
  "target": z.object({
  "baseBranch": z.string().min(1).max(500),
  "headBranch": z.string().min(1).max(500),
}).strict(),
  "result": z.object({
  "providerPullRequestId": z.string().min(1).max(500),
  "number": z.number().int().min(1),
  "projectionId": z.string().uuid().nullable(),
  "baseSha": z.string().min(1).max(200),
  "headSha": z.string().min(1).max(200),
  "state": z.enum(["open", "closed", "merged"]),
}).strict().nullable(),
}).strict(),
z.object({
  "id": z.string().uuid(),
  "provider": z.enum(["fake", "github", "gitea"]),
  "connectionId": z.string().uuid(),
  "repositoryId": z.string().uuid(),
  "requesterActorId": z.string().uuid(),
  "sessionId": z.string().uuid().nullable(),
  "workItemId": z.string().uuid().nullable(),
  "projectId": z.string().uuid().nullable(),
  "planStepId": z.string().uuid().nullable(),
  "expectedHeadSha": z.string().min(1).max(200).nullable(),
  "approvalId": z.string().uuid().nullable(),
  "status": z.enum(["pending", "claimed", "completed", "failed", "dead"]),
  "effect": z.enum(["committed", "checkpointed", "unknown"]),
  "artifactIds": z.array(z.string().uuid()).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate ID"),
  "createdAt": z.string().datetime({ offset: true }),
  "updatedAt": z.string().datetime({ offset: true }),
  "completedAt": z.string().datetime({ offset: true }).nullable(),
  "error": z.object({
  "code": z.enum(["PROVIDER_ACTION_FAILED", "PROVIDER_ACTION_AUTHORITY_REVOKED", "PROVIDER_HEAD_SHA_MISMATCH", "MERGE_APPROVAL_MISMATCH", "MERGE_APPROVAL_EXPIRED", "MERGE_CHECKS_BLOCKED", "PROVIDER_CAPABILITY_UNSUPPORTED", "PROVIDER_ACTION_CLAIM_LOST", "RESULT_UNAVAILABLE"]),
}).strict().nullable(),
  "recovery": z.object({
  "kind": z.enum(["none", "poll_same_action", "human_reconcile"]),
  "scheduled": z.boolean(),
  "nextQueryAt": z.string().datetime({ offset: true }).nullable(),
}).strict(),
  "kind": z.literal("merge_pull_request"),
  "target": z.object({
  "providerPullRequestId": z.string().min(1).max(500),
  "headSha": z.string().min(1).max(200),
  "method": z.enum(["merge", "squash", "rebase"]),
}).strict(),
  "result": z.object({
  "merged": z.literal(true),
  "mergeSha": z.string().min(1).max(200),
}).strict().nullable(),
}).strict(),
z.object({
  "id": z.string().uuid(),
  "provider": z.enum(["fake", "github", "gitea"]),
  "connectionId": z.string().uuid(),
  "repositoryId": z.string().uuid(),
  "requesterActorId": z.string().uuid(),
  "sessionId": z.string().uuid().nullable(),
  "workItemId": z.string().uuid().nullable(),
  "projectId": z.string().uuid().nullable(),
  "planStepId": z.string().uuid().nullable(),
  "expectedHeadSha": z.string().min(1).max(200).nullable(),
  "approvalId": z.string().uuid().nullable(),
  "status": z.enum(["pending", "claimed", "completed", "failed", "dead"]),
  "effect": z.enum(["committed", "checkpointed", "unknown"]),
  "artifactIds": z.array(z.string().uuid()).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate ID"),
  "createdAt": z.string().datetime({ offset: true }),
  "updatedAt": z.string().datetime({ offset: true }),
  "completedAt": z.string().datetime({ offset: true }).nullable(),
  "error": z.object({
  "code": z.enum(["PROVIDER_ACTION_FAILED", "PROVIDER_ACTION_AUTHORITY_REVOKED", "PROVIDER_HEAD_SHA_MISMATCH", "MERGE_APPROVAL_MISMATCH", "MERGE_APPROVAL_EXPIRED", "MERGE_CHECKS_BLOCKED", "PROVIDER_CAPABILITY_UNSUPPORTED", "PROVIDER_ACTION_CLAIM_LOST", "RESULT_UNAVAILABLE"]),
}).strict().nullable(),
  "recovery": z.object({
  "kind": z.enum(["none", "poll_same_action", "human_reconcile"]),
  "scheduled": z.boolean(),
  "nextQueryAt": z.string().datetime({ offset: true }).nullable(),
}).strict(),
  "kind": z.literal("retry_ci_check"),
  "target": z.object({
  "providerPullRequestId": z.string().min(1).max(500),
  "headSha": z.string().min(1).max(200),
  "checkRunId": z.string().min(1).max(500),
}).strict(),
  "result": z.object({
  "requested": z.literal(true),
  "checkRunId": z.string().min(1).max(500),
}).strict().nullable(),
}).strict(),
z.object({
  "id": z.string().uuid(),
  "provider": z.enum(["fake", "github", "gitea"]),
  "connectionId": z.string().uuid(),
  "repositoryId": z.string().uuid(),
  "requesterActorId": z.string().uuid(),
  "sessionId": z.string().uuid().nullable(),
  "workItemId": z.string().uuid().nullable(),
  "projectId": z.string().uuid().nullable(),
  "planStepId": z.string().uuid().nullable(),
  "expectedHeadSha": z.string().min(1).max(200).nullable(),
  "approvalId": z.string().uuid().nullable(),
  "status": z.enum(["pending", "claimed", "completed", "failed", "dead"]),
  "effect": z.enum(["committed", "checkpointed", "unknown"]),
  "artifactIds": z.array(z.string().uuid()).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate ID"),
  "createdAt": z.string().datetime({ offset: true }),
  "updatedAt": z.string().datetime({ offset: true }),
  "completedAt": z.string().datetime({ offset: true }).nullable(),
  "error": z.object({
  "code": z.enum(["PROVIDER_ACTION_FAILED", "PROVIDER_ACTION_AUTHORITY_REVOKED", "PROVIDER_HEAD_SHA_MISMATCH", "MERGE_APPROVAL_MISMATCH", "MERGE_APPROVAL_EXPIRED", "MERGE_CHECKS_BLOCKED", "PROVIDER_CAPABILITY_UNSUPPORTED", "PROVIDER_ACTION_CLAIM_LOST", "RESULT_UNAVAILABLE"]),
}).strict().nullable(),
  "recovery": z.object({
  "kind": z.enum(["none", "poll_same_action", "human_reconcile"]),
  "scheduled": z.boolean(),
  "nextQueryAt": z.string().datetime({ offset: true }).nullable(),
}).strict(),
  "kind": z.literal("resolve_repository_context"),
  "target": z.object({
  "resourceKind": z.enum(["project", "work_item", "session"]),
  "resourceId": z.string().uuid(),
}).strict(),
  "result": z.object({
  "contextId": z.string().uuid(),
}).strict().nullable(),
}).strict()
]).superRefine((value, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
  if (value.effect === "unknown" && value.result !== null) reject("Unknown result must be null")
  if (value.effect !== "unknown" && value.result === null) reject("Confirmed result is required")
  if (value.effect === "committed" && value.status !== "completed") reject("Local completion is required")
  if (value.effect === "checkpointed" && value.status === "completed") reject("Checkpoint is not local completion")
  if (value.kind !== "resolve_repository_context" && (!value.sessionId || !value.workItemId)) reject("Exact E binding is required")
  if (value.kind === "open_pull_request" && value.effect === "committed" && !value.result?.projectionId) reject("Exact local PR reference is required")
  if (value.recovery.kind === "none" && (value.recovery.scheduled || value.recovery.nextQueryAt)) reject("No scheduled recovery")
  if (value.recovery.kind === "poll_same_action" && !value.recovery.nextQueryAt) reject("Next query boundary is required")
  if (value.recovery.kind === "human_reconcile" && (value.recovery.scheduled || value.recovery.nextQueryAt)) reject("Human reconciliation is read only")
})
export type ProviderActionProjectionProposal = z.infer<typeof providerActionProjectionProposalSchema>
// 产品阶段扩展现reviewDelegationInputSchema；不新增普通child仓库权限，也不改其余旧字段/default。
export const reviewDelegationRepositoryPatchProposalSchema = z.object({ repositoryIds: reviewRepositoryIdsProposalSchema.optional() })
