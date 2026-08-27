import { describe, expect, it } from "vitest";
import {
  humanAttentionItemSchema,
  type HumanAttentionItem,
} from "@workmesh/contracts";
import {
  approvalFromAttentionItem,
  attentionResourceHref,
  describeAttentionMutation,
} from "./attention-center";

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const item = (
  kind: HumanAttentionItem["kind"],
  command: string,
  optionId: string,
): HumanAttentionItem =>
  humanAttentionItemSchema.parse({
    projectionVersion: 1,
    id: `v1:${kind === "completion_review" ? "completion_suggestion" : kind}:${uuid(1)}`,
    kind,
    status: "open",
    workspaceId: uuid(2),
    teamId: uuid(3),
    projectId: uuid(4),
    workItemId: uuid(5),
    sessionId: uuid(6),
    planVersionId: null,
    planStepId: null,
    title: "Attention",
    summary: "Source summary",
    summaryDerived: true,
    reasonCodes: [`${kind}.open`],
    severity: "low",
    urgency: "soon",
    requestedBy: { id: uuid(7), kind: "agent", displayName: "Agent" },
    responsibleHuman: { id: uuid(8), kind: "human", displayName: "Human" },
    options: [
      {
        id: optionId,
        label: optionId,
        command,
        method: "POST",
        path: `/api/v1/source/${uuid(1)}`,
        targetRevision: 4,
        requiredCapabilities: ["work:write"],
        requiredActorKinds: ["human"],
        requiresApproval: false,
      },
    ],
    recommendedOptionId: optionId,
    audience: { relationship: "assigned_to_me", canRespond: true },
    response: {
      workflow: kind,
      requiresReason: kind !== "clarification",
      requiresMessage: kind === "clarification",
      choices:
        kind === "decision" ? [{ id: "option-a", label: "Option A" }] : [],
      expectedStatus:
        kind === "approval" || kind === "decision" ? "decided" : "verified",
    },
    bulk: {
      eligible: kind === "approval",
      compatibilityKey: kind === "approval" ? "approval:hash" : null,
      prohibitedReason: kind === "approval" ? null : "bulk.kind_not_supported",
      revalidateIndividually: true,
    },
    impactSummary: "Impact",
    affectedResources: [{ type: "work_item", id: uuid(5) }],
    evidence: [],
    expiresAt: null,
    sourceRevision: 4,
    source: { type: kind, id: uuid(1), status: "pending" },
    freshness: {
      state: "current",
      observedAt: "2026-08-26T00:00:00.000Z",
      sourceUpdatedAt: "2026-08-26T00:00:00.000Z",
    },
    correlationId: "correlation",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  });

describe("Attention Center governed response adapter", () => {
  it("maps each typed workflow to its existing authoritative command body and revision", () => {
    const approval = describeAttentionMutation(
      item("approval", "decideApproval", "approve"),
      {
        optionId: "approve",
        reason: "Evidence matches.",
        message: "",
        choice: "",
      },
    );
    expect(JSON.parse(String(approval.init.body))).toEqual({
      decision: "approved",
      reason: "Evidence matches.",
    });
    expect(new Headers(approval.init.headers).get("If-Match")).toBe(
      '"revision-4"',
    );

    const decision = describeAttentionMutation(
      item("decision", "finalizeDecision", "finalize"),
      {
        optionId: "finalize",
        reason: "Best trade-off.",
        message: "",
        choice: "option-a",
      },
    );
    expect(JSON.parse(String(decision.init.body))).toEqual({
      selectedOption: "option-a",
      reason: "Best trade-off.",
    });

    const clarification = describeAttentionMutation(
      item("clarification", "replyInboxItem", "answer"),
      {
        optionId: "answer",
        reason: "",
        message: "Use the current release branch.",
        choice: "",
      },
    );
    expect(JSON.parse(String(clarification.init.body))).toMatchObject({
      body: "Use the current release branch.",
      payload: { sourceRevision: 4 },
    });
  });

  it("supplies stable approval audit reasons and emits resource deep links without UUID copying", () => {
    const rejection = describeAttentionMutation(item("approval", "decideApproval", "reject"), {
      optionId: "reject",
      reason: "",
      message: "",
      choice: "",
    });
    expect(JSON.parse(String(rejection.init.body))).toEqual({
      decision: "rejected",
      reason: "Human rejected without additional feedback",
    });
    const work = item("recovery", "retryAgentSession", "retry");
    expect(attentionResourceHref(work, "work_item", uuid(5))).toBe(
      `/?workItemId=${uuid(5)}`,
    );
    expect(attentionResourceHref(work, "session", uuid(6))).toBe(
      `/agent-sessions/${uuid(6)}`,
    );
  });

  it("adapts actionable and invalid Approval attention items to the shared decision model", () => {
    const actionable = item("approval", "decideApproval", "approve");
    expect(approvalFromAttentionItem(actionable)).toMatchObject({
      id: uuid(1),
      status: "pending",
      viewer_actionability: { status: "actionable", allowed_decisions: ["approved", "rejected"] },
    });

    const blocked = humanAttentionItemSchema.parse({
      ...actionable,
      status: "failed",
      reasonCodes: ["approval.authority_revoked"],
      options: [],
      recommendedOptionId: null,
      audience: { ...actionable.audience, canRespond: false },
      bulk: { ...actionable.bulk, eligible: false, compatibilityKey: null, prohibitedReason: "bulk.approval_not_actionable" },
    });
    expect(approvalFromAttentionItem(blocked)?.viewer_actionability).toEqual({ status: "blocked", reason: "authority_revoked" });
  });
});
