// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { humanAttentionItemSchema, type HumanAttentionItem } from "@workmesh/contracts";
import { AttentionCenter, describeBulkFailure } from "./attention-center";
import { LocaleProvider } from "./lib/i18n";
import { ApiError, apiMutation, apiRequest } from "./lib/api";

vi.mock("./lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/api")>();
  return { ...actual, apiMutation: vi.fn(), apiRequest: vi.fn() };
});
vi.mock("./lib/realtime", () => ({
  useRealtimeConnectionState: () => "connected",
  useRealtimeSubscription: vi.fn(),
}));
vi.mock("./lib/product-telemetry", () => ({
  productMetricError: () => "none",
  recordProductMetric: vi.fn(),
  startProductMetric: () => vi.fn(),
}));

const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const attention = (suffix: number): HumanAttentionItem => humanAttentionItemSchema.parse({
  projectionVersion: 1,
  id: `v1:approval:${uuid(suffix)}`,
  kind: "approval",
  status: "open",
  workspaceId: uuid(2),
  teamId: uuid(3),
  projectId: uuid(4),
  workItemId: uuid(5),
  sessionId: uuid(6),
  planVersionId: null,
  planStepId: null,
  title: `Publish release evidence ${suffix}`,
  summary: "The Agent needs authority to publish the verified release evidence.",
  summaryDerived: true,
  reasonCodes: ["approval.response_required"],
  severity: "low",
  urgency: "soon",
  requestedBy: { id: uuid(7), kind: "agent", displayName: "Release Agent" },
  responsibleHuman: { id: uuid(8), kind: "human", displayName: "Release Owner" },
  options: [
    { id: "approve", label: "Approve", command: "decideApproval", method: "POST", path: `/api/v1/approvals/${uuid(suffix)}/decide`, targetRevision: 4, requiredCapabilities: ["work:write"], requiredActorKinds: ["human"], requiresApproval: false },
    { id: "reject", label: "Reject", command: "decideApproval", method: "POST", path: `/api/v1/approvals/${uuid(suffix)}/decide`, targetRevision: 4, requiredCapabilities: ["work:write"], requiredActorKinds: ["human"], requiresApproval: false },
  ],
  recommendedOptionId: "approve",
  audience: { relationship: "assigned_to_me", canRespond: true },
  response: { workflow: "approval", requiresReason: false, requiresMessage: false, choices: [], expectedStatus: "decided" },
  bulk: { eligible: true, compatibilityKey: "approval:payload", prohibitedReason: null, revalidateIndividually: true },
  impactSummary: "Publishing remains blocked until a Human decides.",
  affectedResources: [{ type: "work_item", id: uuid(5) }],
  evidence: [],
  expiresAt: "2099-08-28T00:00:00.000Z",
  sourceRevision: 4,
  source: { type: "approval", id: uuid(suffix), status: "pending" },
  freshness: { state: "current", observedAt: "2026-08-28T00:00:00.000Z", sourceUpdatedAt: "2026-08-28T00:00:00.000Z" },
  correlationId: `bulk-${suffix}`,
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
});

const approval = (suffix: number, overrides: Record<string, unknown> = {}) => ({
  id: uuid(suffix),
  session_id: uuid(6),
  approval_type: "release",
  action_name: `Publish release evidence ${suffix}`,
  action_payload_sanitized: { target: `release-${suffix}` },
  action_payload_hash: `sha256:${"a".repeat(64)}`,
  risk_level: "low",
  rationale_summary: "Publish verified evidence.",
  required_approvals: 1,
  status: "pending",
  expires_at: "2099-08-28T00:00:00.000Z",
  consumed_at: null,
  revision: 4,
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
  decisions: [],
  quorum: { required: 1, approved: 0, rejected: 0, reached: false },
  viewer_actionability: { status: "actionable", allowed_decisions: ["approved", "rejected"] },
  ...overrides,
});

describe("Human Attention bulk approval recovery", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockImplementation(async (path: string) => {
      if (path.includes("/api/v1/approvals/")) return approval(path.includes(uuid(2)) ? 2 : 1);
      return { items: [attention(1), attention(2)], nextCursor: null };
    });
    vi.mocked(apiMutation).mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("classifies forbidden, conflict, server, and network failures with safe retry policy", () => {
    expect(describeBulkFailure(new ApiError(403, "Forbidden"))).toMatchObject({ kind: "forbidden", retryable: false, requiresReconfirmation: false });
    expect(describeBulkFailure(new ApiError(412, "Revision changed"))).toMatchObject({ kind: "conflict", retryable: false, requiresReconfirmation: true });
    expect(describeBulkFailure(new ApiError(503, "Unavailable"))).toMatchObject({ kind: "server", retryable: true, requiresReconfirmation: false });
    expect(describeBulkFailure(new TypeError("Failed to fetch"))).toMatchObject({ kind: "network", retryable: true, requiresReconfirmation: false });
  });

  it("uses stable default reason and retains a retryable error per item", async () => {
    let failed = true;
    vi.mocked(apiMutation).mockImplementation(async (_operation, path) => {
      if (path.includes(uuid(1)) && failed) {
        failed = false;
        throw new ApiError(503, "Service temporarily unavailable", "SERVICE_UNAVAILABLE");
      }
      return {};
    });
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: "member" }} /></LocaleProvider>);

    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    const reason = screen.getByRole("textbox", { name: /Bulk reason|批量理由/ });
    expect(reason).not.toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: /Bulk approve|批量批准/ }));

    await waitFor(() => expect(apiMutation).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(vi.mocked(apiMutation).mock.calls[0]?.[2]?.body))).toEqual({
      decision: "approved",
      reason: "Human approved without additional requirements",
    });
    const result = await screen.findByTestId(`attention-bulk-result-v1:approval:${uuid(1)}`);
    expect(result.textContent).toMatch(/Service temporarily unavailable|服务暂时不可用/);
    expect(within(result).getByRole("button", { name: /Retry this item|重试此项/ })).toBeVisible();

    fireEvent.click(within(result).getByRole("button", { name: /Retry this item|重试此项/ }));
    await waitFor(() => expect(apiMutation).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.textContent).toMatch(/Completed|已完成/));
  });

  it("does not expose retry for forbidden decisions and asks for reconfirmation after a conflict", async () => {
    vi.mocked(apiMutation).mockImplementation(async (_operation, path) => {
      if (path.includes(uuid(1))) throw new ApiError(403, "Authority revoked", "AUTHORITY_REVOKED");
      throw new ApiError(412, "Source revision changed", "STALE_REVISION");
    });
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: "member" }} /></LocaleProvider>);

    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: /Bulk approve|批量批准/ }));

    const forbidden = await screen.findByTestId(`attention-bulk-result-v1:approval:${uuid(1)}`);
    expect(within(forbidden).queryByRole("button", { name: /Retry this item|重试此项/ })).not.toBeInTheDocument();
    const conflict = await screen.findByTestId(`attention-bulk-result-v1:approval:${uuid(2)}`);
    expect(within(conflict).getByRole("button", { name: /Refresh and confirm|重新同步并确认/ })).toBeVisible();
    expect(within(conflict).queryByRole("button", { name: /Retry this item|重试此项/ })).not.toBeInTheDocument();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  });

  it("uses an authoritative Approval read instead of list absence to reconcile an uncertain commit", async () => {
    let committed = false;
    vi.mocked(apiMutation).mockImplementationOnce(async () => {
      committed = true;
      throw new TypeError("Connection reset after commit");
    });
    vi.mocked(apiRequest).mockImplementation(async (path: string) => {
      if (path.includes("/api/v1/approvals/")) return approval(1, {
        status: "approved",
        revision: 5,
        decisions: [{
          actor_id: uuid(8), decision: "approved", reason: "Human approved without additional requirements", source: "human",
          policy_workspace_id: null, policy_revision: null, decided_at: "2026-08-28T00:01:00.000Z",
        }],
        quorum: { required: 1, approved: 1, rejected: 0, reached: true },
        viewer_actionability: { status: "blocked", reason: "already_decided" },
      });
      return { items: committed ? [] : [attention(1)], nextCursor: null };
    });
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: "member" }} /></LocaleProvider>);

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /Bulk approve|批量批准/ }));

    const result = await screen.findByTestId(`attention-bulk-result-v1:approval:${uuid(1)}`);
    await waitFor(() => expect(result.textContent).toMatch(/no longer needs action|不再需要处理/));
    expect(within(result).queryByRole("button", { name: /Retry this item|重试此项/ })).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(`/api/v1/approvals/${uuid(1)}`);
  });

  it("does not report another Human's concurrent terminal decision as this viewer's success", async () => {
    vi.mocked(apiMutation).mockRejectedValueOnce(new TypeError("Connection reset while another Human decided"));
    vi.mocked(apiRequest).mockImplementation(async (path: string) => {
      if (path.includes("/api/v1/approvals/")) return approval(1, {
        status: "approved",
        revision: 5,
        decisions: [{
          actor_id: uuid(9), decision: "approved", reason: "Approved by another Human", source: "human",
          policy_workspace_id: null, policy_revision: null, decided_at: "2026-08-28T00:01:00.000Z",
        }],
        quorum: { required: 1, approved: 1, rejected: 0, reached: true },
        viewer_actionability: { status: "blocked", reason: "already_decided" },
      });
      return { items: [attention(1)], nextCursor: null };
    });
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: "member" }} /></LocaleProvider>);

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Bulk approve|批量批准/ }));

    const result = await screen.findByTestId(`attention-bulk-result-v1:approval:${uuid(1)}`);
    await waitFor(() => expect(result.textContent).toMatch(/not recorded|未找到你刚提交/));
    expect(result.textContent).not.toMatch(/no longer needs action|不再需要处理/);
    expect(within(result).queryByRole("button", { name: /Retry this item|重试此项/ })).not.toBeInTheDocument();
  });
});
