import type {
  HumanAttentionKind,
  HumanAttentionStatus,
} from "@workmesh/contracts";

export type AttentionView = "active" | "history";
export type AttentionAudience =
  "assigned_to_me" | "visible_to_me" | "workspace_administration";
export type AttentionRouteState = Readonly<{
  view: AttentionView;
  kind?: HumanAttentionKind;
  status?: HumanAttentionStatus;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  urgency?: "normal" | "soon" | "immediate";
  audience?: AttentionAudience;
  requestedByActorId?: string;
  responsibleHumanActorId?: string;
  workItemId?: string;
  sessionId?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  cursor?: string;
  selectedId?: string;
}>;

const kinds = new Set<HumanAttentionKind>([
  "decision",
  "approval",
  "clarification",
  "conflict",
  "recovery",
  "completion_review",
]);
const statuses = new Set<HumanAttentionStatus>([
  "open",
  "seen",
  "decided",
  "applying",
  "verified",
  "failed",
  "expired",
  "superseded",
]);
const severities = new Set<NonNullable<AttentionRouteState["severity"]>>([
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);
const urgencies = new Set<NonNullable<AttentionRouteState["urgency"]>>([
  "normal",
  "soon",
  "immediate",
]);
const audiences = new Set<AttentionAudience>([
  "assigned_to_me",
  "visible_to_me",
  "workspace_administration",
]);
const value = <T extends string>(
  params: URLSearchParams,
  key: string,
  values: Set<T>,
): T | undefined => {
  const candidate = params.get(key);
  return candidate && values.has(candidate as T) ? (candidate as T) : undefined;
};
const text = (params: URLSearchParams, key: string): string | undefined =>
  params.get(key) || undefined;

export function readAttentionRoute(search: string): AttentionRouteState {
  const params = new URLSearchParams(search);
  return {
    view: params.get("attentionView") === "history" ? "history" : "active",
    kind: value(params, "attentionKind", kinds),
    status: value(params, "attentionStatus", statuses),
    severity: value(params, "attentionSeverity", severities),
    urgency: value(params, "attentionUrgency", urgencies),
    audience: value(params, "attentionAudience", audiences),
    requestedByActorId: text(params, "attentionRequestedBy"),
    responsibleHumanActorId: text(params, "attentionResponsible"),
    workItemId: text(params, "attentionWorkItem"),
    sessionId: text(params, "attentionSession"),
    updatedAfter: text(params, "attentionAfter"),
    updatedBefore: text(params, "attentionBefore"),
    cursor: text(params, "attentionCursor"),
    selectedId: text(params, "attentionSelected"),
  };
}

const keys: Readonly<
  Record<Exclude<keyof AttentionRouteState, "view">, string>
> = {
  kind: "attentionKind",
  status: "attentionStatus",
  severity: "attentionSeverity",
  urgency: "attentionUrgency",
  audience: "attentionAudience",
  requestedByActorId: "attentionRequestedBy",
  responsibleHumanActorId: "attentionResponsible",
  workItemId: "attentionWorkItem",
  sessionId: "attentionSession",
  updatedAfter: "attentionAfter",
  updatedBefore: "attentionBefore",
  cursor: "attentionCursor",
  selectedId: "attentionSelected",
};

export function attentionHref(
  current: string,
  state: AttentionRouteState,
): string {
  const url = new URL(current, "http://workmesh.local");
  if (state.view === "history")
    url.searchParams.set("attentionView", "history");
  else url.searchParams.delete("attentionView");
  for (const [field, key] of Object.entries(keys) as Array<
    [Exclude<keyof AttentionRouteState, "view">, string]
  >) {
    const next = state[field];
    if (next) url.searchParams.set(key, next);
    else url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function attentionListPath(
  state: AttentionRouteState,
  projectId?: string,
): string {
  const params = new URLSearchParams({ view: state.view, limit: "40" });
  const map: Array<[string, string | undefined]> = [
    ["kind", state.kind],
    ["status", state.status],
    ["severity", state.severity],
    ["urgency", state.urgency],
    ["audience", state.audience],
    ["requestedByActorId", state.requestedByActorId],
    ["responsibleHumanActorId", state.responsibleHumanActorId],
    ["workItemId", state.workItemId],
    ["sessionId", state.sessionId],
    ["updatedAfter", state.updatedAfter],
    ["updatedBefore", state.updatedBefore],
    ["cursor", state.cursor],
    ["projectId", projectId],
  ];
  for (const [key, next] of map) if (next) params.set(key, next);
  return `/api/v1/human-attention?${params.toString()}`;
}
