"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActionPreview,
  HumanAttentionItem,
  ListResponse,
} from "@workmesh/contracts";
import {
  ActorAttribution,
  AttentionKindBadge,
  AttentionListItem,
  Button,
  FreshnessBadge,
  LifecycleBadge,
  RiskBadge,
  UrgencyBadge,
  WorkSurfacePagination,
} from "@workmesh/ui";
import { EvidenceDrawer, useEvidenceDrawer, type EvidenceDrawerItem } from "./evidence-drawer";
import { ApiError, apiMutation, apiRequest, json } from "./lib/api";
import {
  classifyApprovalDecisionFailure,
  decideApproval,
  defaultApprovalDecisionReason,
  type Approval,
  type ApprovalDecision,
} from "./lib/agents";
import { productMetricError, recordProductMetric, startProductMetric } from "./lib/product-telemetry";
import { useLocale } from "./lib/i18n";
import {
  ApprovalDecisionControls,
  type ApprovalDecisionUiState,
} from "./agents/approval-decision-controls";
import { approvalFromAttentionItem } from "./agents/attention-approval";
export { approvalFromAttentionItem } from "./agents/attention-approval";
import {
  useRealtimeConnectionState,
  useRealtimeSubscription,
} from "./lib/realtime";
import {
  attentionHref,
  attentionListPath,
  readAttentionRoute,
  type AttentionRouteState,
  type AttentionView,
} from "./attention-route-state";

type Actor = Readonly<{
  id: string;
  workspace_id?: string;
  workspace_role: "admin" | "member";
}>;
export type AttentionResponseDraft = Readonly<{
  optionId: string;
  reason: string;
  message: string;
  choice: string;
}>;
type MutationDescription = Readonly<{
  operation: string;
  path: string;
  init: RequestInit;
}>;

const ifMatch = (revision?: number): HeadersInit => ({
  ...json({}),
  ...(revision ? { "If-Match": `"revision-${revision}"` } : {}),
});

export function describeAttentionMutation(
  item: HumanAttentionItem,
  draft: AttentionResponseDraft,
): MutationDescription {
  const option = item.options.find(
    (candidate) => candidate.id === draft.optionId,
  );
  if (!option) throw new Error("The selected response is no longer available.");
  const reason = draft.reason.trim();
  const message = draft.message.trim();
  const choice = draft.choice.trim();
  if (item.response.requiresReason && !reason && option.command !== "decideApproval")
    throw new Error("A reason is required.");
  if (item.response.requiresMessage && !message)
    throw new Error("A response is required.");
  let body: unknown = {};
  if (option.command === "decideApproval")
    body = {
      decision: option.id === "approve" ? "approved" : "rejected",
      reason: reason || defaultApprovalDecisionReason(option.id === "approve" ? "approved" : "rejected"),
    };
  else if (option.command === "finalizeDecision")
    body = {
      ...(choice ? { selectedOption: choice } : {}),
      ...(reason ? { reason } : {}),
    };
  else if (option.command === "replyInboxItem")
    body = {
      body: message,
      payload: { attentionId: item.id, sourceRevision: item.sourceRevision },
    };
  else if (option.command === "resolveRoomMessage")
    body = { ...(reason ? { reason } : {}) };
  else if (option.command === "retryAgentSession")
    body = { reason, reuseContext: true };
  else if (option.command === "rejectHandoff") body = { reason };
  else if (option.command === "decideCompletionSuggestion")
    body = { decision: option.id === "accept" ? "accepted" : "dismissed" };
  return {
    operation: `human-attention:${item.id}:${option.id}:${option.targetRevision ?? item.sourceRevision}`,
    path: option.path,
    init: {
      method: option.method,
      headers: ifMatch(option.targetRevision),
      body: JSON.stringify(body),
    },
  };
}

export const attentionResourceHref = (
  item: HumanAttentionItem,
  type: string,
  id: string,
): string => {
  if (type === "session") return `/agent-sessions/${encodeURIComponent(id)}`;
  if (type === "work_item") return `/?workItemId=${encodeURIComponent(id)}`;
  if (type === "project")
    return `/?view=projects&project=${encodeURIComponent(id)}`;
  if (type === "plan_step" && item.sessionId)
    return `/agent-sessions/${encodeURIComponent(item.sessionId)}?step=${encodeURIComponent(id)}`;
  if (type === "artifact" && item.sessionId)
    return `/agent-sessions/${encodeURIComponent(item.sessionId)}?tab=artifacts&artifact=${encodeURIComponent(id)}`;
  return item.sessionId
    ? `/agent-sessions/${encodeURIComponent(item.sessionId)}`
    : "/";
};

const isDangerous = (item: HumanAttentionItem): boolean =>
  item.severity === "high" ||
  item.severity === "critical" ||
  ["approval", "conflict", "recovery"].includes(item.kind);

export function AttentionCenter({
  actor,
  projectId,
}: {
  actor: Actor;
  projectId?: string;
}) {
  const { locale, agentsCopy } = useLocale();
  const copy =
    locale === "zh-CN"
      ? {
          title: projectId ? "项目关注中心" : "需要我处理",
          intro: "按风险、紧迫度和责任归集所有需要 Human 判断或响应的事项。",
          active: "待处理",
          history: "历史",
          filters: "关注事项筛选",
          all: "全部",
          kind: "类型",
          severity: "风险",
          urgency: "紧迫度",
          audience: "责任范围",
          mine: "分配给我",
          visible: "我可见",
          admin: "工作区管理",
          apply: "应用筛选",
          clear: "清除",
          empty: "当前没有符合条件的关注事项。",
          loadError: "无法加载关注事项。",
          retry: "重试",
          details: "查看与处理",
          loadMore: "下一页",
          loadingMore: "正在加载…",
          requestedBy: "请求者",
          responsible: "负责人",
          source: "权威来源",
          revision: "来源 revision",
          impact: "预期影响",
          resources: "受影响资源",
          evidence: "证据与验证",
          none: "未提供",
          expires: "到期时间",
          updated: "更新时间",
          reasonCodes: "原因代码",
          technical: "技术详情",
          response: "响应",
          cancel: "取消",
          submit: "提交响应",
          reason: "理由",
          message: "答复",
          choice: "选项",
          preview: "权威后果预览",
          previewLoading: "正在计算当前后果…",
          previewUnavailable: "无法取得当前后果预览。请刷新后重试。",
          stale: "当前数据不可用于高风险响应，请重新同步。",
          applying: "命令已提交，正在从权威状态重新同步。",
          bulk: "批量处理",
          bulkReason: "批量理由（可选）",
          bulkApprove: "批量批准",
          bulkReject: "批量拒绝",
          bulkResult: (ok: number, failed: number) =>
            `${ok} 项成功，${failed} 项仍需处理。`,
          selected: (count: number) => `已选择 ${count} 项兼容审批`,
          incompatible: "与当前选择的精确 payload 不兼容",
          prohibited: "此事项不能批量处理",
          assigned: "分配给我",
          workspaceAdmin: "工作区管理",
          visibleToMe: "我可见",
          refresh: "重新同步",
          current: "当前",
          offline: "离线",
          partial: "部分数据",
          historyStatus: "历史状态",
          status: "状态",
          immediate: "立即处理",
          soon: "即将到期",
          normal: "普通",
          expiredCount: (count: number) => `历史已过期 ${count} 项`,
          selectPrompt: "从左侧选择一项，查看完整决策上下文。",
          request: "请求内容",
          boundary: "允许边界",
          exclusions: "排除项",
          boundaryHint: "仅限下列明确列出的资源与当前来源 revision。",
          exclusionsHint: "未列出的资源和超出当前 revision 的变更不在本次授权范围内。",
          readOnly: "该事项已结束，仅可查看历史详情。",
        }
      : {
          title: projectId ? "Project Attention Center" : "Needs You",
          intro:
            "Human decisions and responses grouped by risk, urgency, and responsibility.",
          active: "Active",
          history: "History",
          filters: "Attention filters",
          all: "All",
          kind: "Kind",
          severity: "Risk",
          urgency: "Urgency",
          audience: "Responsibility",
          mine: "Assigned to me",
          visible: "Visible to me",
          admin: "Workspace administration",
          apply: "Apply filters",
          clear: "Clear",
          empty: "No attention items match these filters.",
          loadError: "Unable to load attention.",
          retry: "Retry",
          details: "Review and respond",
          loadMore: "Next page",
          loadingMore: "Loading…",
          requestedBy: "Requested by",
          responsible: "Responsible Human",
          source: "Authoritative source",
          revision: "Source revision",
          impact: "Expected impact",
          resources: "Affected resources",
          evidence: "Evidence and validation",
          none: "None provided",
          expires: "Expires",
          updated: "Updated",
          reasonCodes: "Reason codes",
          technical: "Technical details",
          response: "Response",
          cancel: "Cancel",
          submit: "Submit response",
          reason: "Reason",
          message: "Response",
          choice: "Option",
          preview: "Authoritative consequence preview",
          previewLoading: "Computing current consequences…",
          previewUnavailable:
            "Current consequences could not be loaded. Refresh before retrying.",
          stale:
            "Current data cannot authorize a high-risk response. Resynchronize first.",
          applying: "Command committed; resynchronizing authoritative state.",
          bulk: "Bulk response",
          bulkReason: "Bulk reason (optional)",
          bulkApprove: "Bulk approve",
          bulkReject: "Bulk reject",
          bulkResult: (ok: number, failed: number) =>
            `${ok} succeeded; ${failed} remain actionable.`,
          selected: (count: number) => `${count} compatible approvals selected`,
          incompatible: "Incompatible with the selected exact payload",
          prohibited: "This item cannot be handled in bulk",
          assigned: "Assigned to me",
          workspaceAdmin: "Workspace administration",
          visibleToMe: "Visible to me",
          refresh: "Resync",
          current: "Current",
          offline: "Offline",
          partial: "Partial data",
          historyStatus: "History status",
          status: "Status",
          immediate: "Act now",
          soon: "Due soon",
          normal: "Normal",
          expiredCount: (count: number) => `${count} expired in history`,
          selectPrompt: "Select an item on the left to review its full decision context.",
          request: "Request",
          boundary: "Allowed boundary",
          exclusions: "Excluded",
          boundaryHint: "Limited to the explicitly listed resources and current source revision.",
          exclusionsHint: "Unlisted resources and changes beyond the current revision are outside this authorization.",
          readOnly: "This item is closed and available as read-only history.",
        };
  const [route, setRoute] = useState<AttentionRouteState>(() =>
    typeof window === "undefined"
      ? { view: "active" }
      : readAttentionRoute(window.location.search),
  );
  const [draftFilters, setDraftFilters] = useState<AttentionRouteState>(route);
  const [page, setPage] = useState<ListResponse<HumanAttentionItem> | null>(
    null,
  );
  const [selected, setSelected] = useState<HumanAttentionItem | null>(null);
  const attentionOpenedAtRef = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const firstAttentionOpenedRef = useRef(false);
  const [responseDraft, setResponseDraft] = useState<AttentionResponseDraft>({
    optionId: "",
    reason: "",
    message: "",
    choice: "",
  });
  const [approvalDecisionState, setApprovalDecisionState] = useState<ApprovalDecisionUiState>({ status: "idle" });
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const connectionState = useRealtimeConnectionState();
  const attentionEvidence = useMemo<EvidenceDrawerItem[]>(() =>
    selected?.evidence.map(reference => ({
      ...reference,
      sessionId: selected.sessionId ?? undefined,
      workItem: selected.workItemId ? { id: selected.workItemId, label: "Related Work Item", projectId } : undefined,
      principalHuman: selected.responsibleHuman ? { id: selected.responsibleHuman.id, label: selected.responsibleHuman.displayName } : undefined,
      freshness: connectionState === "offline" ? "offline" : selected.freshness.state,
      validationState: reference.status === "validated" ? "verified" : reference.status === "failed" ? "failed" : reference.status === "superseded" ? "superseded" : reference.status === "produced" ? "pending" : "unknown",
      summary: `Evidence explicitly referenced by ${selected.title}.`,
    })) ?? [], [connectionState, projectId, selected]);
  const evidenceDrawer = useEvidenceDrawer(attentionEvidence, "attention");

  const prepareResponse = useCallback(async (item: HumanAttentionItem) => {
    const optionId = item.recommendedOptionId ?? item.options[0]?.id ?? "";
    setResponseDraft({
      optionId,
      reason: "",
      message: "",
      choice: item.response.choices[0]?.id ?? "",
    });
    setPreview(null);
    setApprovalDecisionState({ status: "idle" });
    const option = item.options.find((candidate) => candidate.id === optionId);
    if (!option?.consequencePreviewPath) return;
    setPreviewLoading(true);
    try {
      setPreview(
        await apiRequest<ActionPreview>(option.consequencePreviewPath, {
          method: "POST",
          headers: json({}),
          body: JSON.stringify({ action: option.id }),
        }),
      );
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async (next = route) => {
      setError("");
      try {
        const loaded = await apiRequest<ListResponse<HumanAttentionItem>>(
          attentionListPath(next, projectId),
        );
        setPage(loaded);
        if (next.selectedId) {
          const fromPage = loaded.items.find(
            (item) => item.id === next.selectedId,
          );
          const loadedSelected = fromPage ??
            (await apiRequest<HumanAttentionItem>(
              `/api/v1/human-attention/${encodeURIComponent(next.selectedId)}`,
            ));
          setSelected(loadedSelected);
          void prepareResponse(loadedSelected);
        } else setSelected(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : copy.loadError);
      }
    },
    [copy.loadError, prepareResponse, projectId, route],
  );

  useEffect(() => {
    void refresh(route);
  }, [route, refresh]);
  useEffect(() => {
    const restore = () => {
      const next = readAttentionRoute(window.location.search);
      setRoute(next);
      setDraftFilters(next);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useRealtimeSubscription(
    [
      ...(actor.workspace_id
        ? [{ type: "workspace" as const, id: actor.workspace_id }]
        : []),
      ...(projectId ? [{ type: "project" as const, id: projectId }] : []),
    ],
    () => refresh(route),
  );

  const writeRoute = (next: AttentionRouteState, replace = false) => {
    const href = attentionHref(window.location.href, next);
    window.history[replace ? "replaceState" : "pushState"]({}, "", href);
    setRoute(next);
    setDraftFilters(next);
  };
  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    writeRoute({ ...draftFilters, cursor: undefined, selectedId: undefined });
  };
  const openItem = (item: HumanAttentionItem, trigger: HTMLElement) => {
    if (!firstAttentionOpenedRef.current) {
      firstAttentionOpenedRef.current = true;
      recordProductMetric("first_attention_detail", (typeof performance === "undefined" ? attentionOpenedAtRef.current : performance.now()) - attentionOpenedAtRef.current, { surface: "attention", actionClass: "open" }, { outcome: "success" });
    }
    returnFocusRef.current = trigger;
    setSelected(item);
    void prepareResponse(item);
    writeRoute({ ...route, selectedId: item.id }, false);
  };
  const closeItem = () => {
    setSelected(null);
    writeRoute({ ...route, selectedId: undefined }, true);
    queueMicrotask(() => returnFocusRef.current?.focus());
  };
  const execute = async (
    item: HumanAttentionItem,
    draft: AttentionResponseDraft,
  ) => {
    const described = describeAttentionMutation(item, draft);
    return apiMutation<unknown>(
      described.operation,
      described.path,
      described.init,
    );
  };
  const decideAttentionApproval = async (
    approval: Approval,
    decision: ApprovalDecision,
    reason?: string,
  ): Promise<boolean> => {
    if (approvalDecisionState.status === "busy" || approvalDecisionState.status === "success") return false;
    setApprovalDecisionState({ status: "busy", decision });
    try {
      const result = await decideApproval(approval, decision, reason);
      setApprovalDecisionState({
        status: "success",
        decision,
        message: result.status === "pending" && !result.quorum.reached
          ? agentsCopy.approvalDecisionQuorum(result.quorum.approved, result.quorum.required)
          : agentsCopy.approvalDecisionRecorded(decision),
        quorum: result.quorum,
      });
      setApplying(copy.applying);
      window.setTimeout(() => void refresh(route), 1200);
      return true;
    } catch (reason) {
      const failure = classifyApprovalDecisionFailure(reason);
      if (failure === "conflict" || failure === "expired" || failure === "authority_inactive") {
        await refresh(route);
      }
      setApprovalDecisionState({
        status: "error",
        decision,
        message: agentsCopy.approvalDecisionFailure(failure),
        retryable: failure === "network" || failure === "server",
      });
      return false;
    }
  };
  const submitResponse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const optionId = submitter?.value || responseDraft.optionId;
    const nextDraft = { ...responseDraft, optionId };
    const finishMetric = startProductMetric("attention_response", { surface: "attention", actionClass: "respond" });
    try {
      setBusy(true);
      setError("");
      await execute(selected, nextDraft);
      setApplying(copy.applying);
      await refresh({ ...route, selectedId: undefined });
      writeRoute({ ...route, selectedId: undefined }, true);
      finishMetric({ outcome: "success" });
    } catch (reason) {
      finishMetric({ outcome: "failure", errorClass: productMetricError(reason) });
      const prefix =
        reason instanceof ApiError && [409, 412].includes(reason.status)
          ? `${reason.message} ${copy.refresh}`
          : reason instanceof Error
            ? reason.message
            : copy.loadError;
      setError(prefix);
      await refresh(route);
    } finally {
      setBusy(false);
    }
  };

  const bulkCompatibility = useMemo(() => {
    const chosen = page?.items.find((item) => bulkSelected.has(item.id));
    return chosen?.bulk.compatibilityKey ?? null;
  }, [bulkSelected, page?.items]);
  const toggleBulk = (item: HumanAttentionItem) => {
    if (
      !item.bulk.eligible ||
      (bulkCompatibility && item.bulk.compatibilityKey !== bulkCompatibility)
    )
      return;
    setBulkSelected((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };
  const runBulk = async (decision: "approve" | "reject") => {
    const items = page?.items.filter((item) => bulkSelected.has(item.id)) ?? [];
    if (items.length === 0) return;
    setBusy(true);
    setError("");
    setApplying("");
    setBulkMessage("");
    const results = await Promise.allSettled(
      items.map((item) =>
        execute(item, {
          optionId: decision,
          reason: bulkReason.trim() || defaultApprovalDecisionReason(decision === "approve" ? "approved" : "rejected"),
          message: "",
          choice: "",
        }),
      ),
    );
    const failedIds = new Set(
      items
        .filter((_, index) => results[index]?.status === "rejected")
        .map((item) => item.id),
    );
    const succeeded = items.length - failedIds.size;
    setBulkSelected(failedIds);
    await refresh(route);
    setBulkMessage(copy.bulkResult(succeeded, failedIds.size));
    setBusy(false);
  };

  const freshness =
    connectionState === "offline"
      ? "offline"
      : error && page
        ? "partial"
        : "fresh";
  const items = page?.items ?? [];
  const groupedItems = useMemo(() => {
    const groups = {
      immediate: [] as HumanAttentionItem[],
      soon: [] as HumanAttentionItem[],
      normal: [] as HumanAttentionItem[],
    };
    for (const item of items) groups[item.urgency].push(item);
    return groups;
  }, [items]);
  const expiredCount = route.view === "history"
    ? items.filter((item) => item.status === "expired").length
    : 0;
  const selectedApproval = selected ? approvalFromAttentionItem(selected) : null;
  const historyStatuses = ["verified", "expired", "superseded"] as const;
  return (
    <section className="attention-center" data-testid="attention-center">
      <header className="attention-center-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
        <FreshnessBadge
          categoryLabel={copy.status}
          label={
            freshness === "offline"
              ? copy.offline
              : freshness === "partial"
                ? copy.partial
                : copy.current
          }
          value={freshness}
        />
      </header>
      <div
        aria-label={copy.status}
        className="attention-view-switch"
        role="tablist"
      >
        {(["active", "history"] as AttentionView[]).map((view) => (
          <Button
            aria-selected={route.view === view}
            key={view}
            onClick={() =>
              writeRoute({
                ...route,
                view,
                status: undefined,
                cursor: undefined,
                selectedId: undefined,
              })
            }
            role="tab"
            type="button"
            variant={route.view === view ? "primary" : "ghost"}
          >
            {view === "active" ? copy.active : copy.history}
          </Button>
        ))}
      </div>
      <form
        aria-label={copy.filters}
        className="attention-filters"
        onSubmit={applyFilters}
      >
        <label>
          {copy.kind}
          <select
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((current) => ({
                ...current,
                kind: value
                  ? (value as AttentionRouteState["kind"])
                  : undefined,
              }));
            }}
            value={draftFilters.kind ?? ""}
          >
            <option value="">{copy.all}</option>
            {[
              "decision",
              "approval",
              "clarification",
              "conflict",
              "recovery",
              "completion_review",
            ].map((kind) => (
              <option key={kind} value={kind}>
                {kind.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.severity}
          <select
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((current) => ({
                ...current,
                severity: value
                  ? (value as AttentionRouteState["severity"])
                  : undefined,
              }));
            }}
            value={draftFilters.severity ?? ""}
          >
            <option value="">{copy.all}</option>
            {["info", "low", "medium", "high", "critical"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.urgency}
          <select
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((current) => ({
                ...current,
                urgency: value
                  ? (value as AttentionRouteState["urgency"])
                  : undefined,
              }));
            }}
            value={draftFilters.urgency ?? ""}
          >
            <option value="">{copy.all}</option>
            {["normal", "soon", "immediate"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.audience}
          <select
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((current) => ({
                ...current,
                audience: value
                  ? (value as AttentionRouteState["audience"])
                  : undefined,
              }));
            }}
            value={draftFilters.audience ?? ""}
          >
            <option value="">{copy.all}</option>
            <option value="assigned_to_me">{copy.mine}</option>
            <option value="visible_to_me">{copy.visible}</option>
            {actor.workspace_role === "admin" && (
              <option value="workspace_administration">{copy.admin}</option>
            )}
          </select>
        </label>
        {route.view === "history" && (
          <label>
            {copy.historyStatus}
            <select
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraftFilters((current) => ({
                  ...current,
                  status: value
                    ? (value as AttentionRouteState["status"])
                    : undefined,
                }));
              }}
              value={draftFilters.status ?? ""}
            >
              <option value="">{copy.all}</option>
              {historyStatuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="attention-filter-actions">
          <Button type="submit">{copy.apply}</Button>
          <Button
            onClick={() => writeRoute({ view: route.view })}
            type="button"
            variant="ghost"
          >
            {copy.clear}
          </Button>
        </div>
      </form>
      {(error || applying || bulkMessage) && (
        <div
          className={error ? "attention-banner error" : "attention-banner"}
          role={error ? "alert" : "status"}
        >
          <span>{error || applying || bulkMessage}</span>
          <Button
            onClick={() => void refresh(route)}
            type="button"
            variant="ghost"
          >
            {copy.retry}
          </Button>
        </div>
      )}
      {bulkSelected.size > 0 && (
        <section aria-label={copy.bulk} className="attention-bulk-bar">
          <strong>{copy.selected(bulkSelected.size)}</strong>
          <label>
            {copy.bulkReason}
            <input
              onChange={(event) => setBulkReason(event.currentTarget.value)}
              required
              value={bulkReason}
            />
          </label>
          <Button
            disabled={busy}
            onClick={() => void runBulk("approve")}
            type="button"
          >
            {copy.bulkApprove}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void runBulk("reject")}
            type="button"
            variant="danger"
          >
            {copy.bulkReject}
          </Button>
        </section>
      )}
      <div className="attention-workbench">
        <aside aria-label={copy.title} className="attention-queue">
          {route.view === "history" && expiredCount > 0 && (
            <p className="attention-expired-count">{copy.expiredCount(expiredCount)}</p>
          )}
          {(["immediate", "soon", "normal"] as const).map((group) => {
            const groupItems = groupedItems[group];
            if (groupItems.length === 0) return null;
            return (
              <section className="attention-queue-group" key={group}>
                <h3>{copy[group]} <span>{groupItems.length}</span></h3>
                <div className="attention-list" role="list">
                  {groupItems.map((item) => {
                    const incompatible = Boolean(bulkCompatibility && item.bulk.compatibilityKey !== bulkCompatibility);
                    const risk = item.severity === "info" ? "none" : item.severity;
                    const urgency = item.urgency === "immediate" ? "urgent" : item.urgency;
                    return (
                      <div className={`attention-row${selected?.id === item.id ? " selected" : ""}`} key={item.id} role="listitem">
                        {item.bulk.eligible && (
                          <label className="attention-bulk-check" title={incompatible ? copy.incompatible : undefined}>
                            <input
                              aria-label={`${copy.bulk}: ${item.title}`}
                              checked={bulkSelected.has(item.id)}
                              disabled={incompatible}
                              onChange={() => toggleBulk(item)}
                              type="checkbox"
                            />
                            <span>{copy.bulk}</span>
                          </label>
                        )}
                        <AttentionListItem
                          actions={
                            <Button onClick={(event) => openItem(item, event.currentTarget)} type="button" variant="ghost">
                              {copy.details}
                            </Button>
                          }
                          actor={<span className="attention-queue-actor">{item.requestedBy.displayName}</span>}
                          badges={
                            <>
                              <AttentionKindBadge categoryLabel={copy.kind} label={item.kind.replaceAll("_", " ")} value={item.kind} />
                              <RiskBadge categoryLabel={copy.severity} label={item.severity} value={risk} />
                              <UrgencyBadge categoryLabel={copy.urgency} label={item.urgency} value={urgency} />
                              <LifecycleBadge categoryLabel={copy.status} label={item.status} value={item.status} />
                            </>
                          }
                          description={item.summary}
                          title={item.title}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {page && items.length === 0 && <p className="attention-empty">{copy.empty}</p>}
          {!page && !error && <p className="attention-empty">{copy.loadingMore}</p>}
          <WorkSurfacePagination
            copy={{ loadMore: copy.loadMore, loading: copy.loadingMore }}
            loading={false}
            nextCursor={page?.nextCursor ?? null}
            onLoadMore={() => {
              if (page?.nextCursor) writeRoute({ ...route, cursor: page.nextCursor, selectedId: undefined });
            }}
          />
        </aside>
        <main className="attention-decision-context">
          {!selected ? (
            <p className="attention-select-prompt">{copy.selectPrompt}</p>
          ) : (
            <>
              <header className="attention-detail-heading">
                <div>
                  <p>{selected.kind.replaceAll("_", " ")} · {selected.severity}</p>
                  <h3>{selected.title}</h3>
                </div>
                <Button onClick={closeItem} type="button" variant="ghost">{copy.cancel}</Button>
              </header>
              <div className="attention-detail">
                <section>
                  <h3>{copy.request}</h3>
                  <p>{selected.summary}</p>
                </section>
                <ActorAttribution
                  activeAgent={{ label: copy.requestedBy, name: selected.requestedBy.displayName }}
                  relationshipLabel=""
                  responsibleHuman={{ label: copy.responsible, name: selected.responsibleHuman?.displayName ?? copy.none }}
                />
                <dl>
                  <div><dt>{copy.source}</dt><dd>{selected.source.type} · {selected.source.status}</dd></div>
                  <div><dt>{copy.revision}</dt><dd>{selected.sourceRevision}</dd></div>
                  <div><dt>{copy.expires}</dt><dd>{selected.expiresAt ? new Date(selected.expiresAt).toLocaleString(locale) : copy.none}</dd></div>
                  <div><dt>{copy.updated}</dt><dd>{new Date(selected.updatedAt).toLocaleString(locale)}</dd></div>
                </dl>
                <section><h3>{copy.impact}</h3><p>{selected.impactSummary}</p></section>
                <section className="attention-boundary-grid">
                  <div>
                    <h3>{copy.boundary}</h3>
                    <p>{copy.boundaryHint}</p>
                    {selected.affectedResources.length ? (
                      <ul>{selected.affectedResources.map((resource) => (
                        <li key={`${resource.type}:${resource.id}`}><a href={attentionResourceHref(selected, resource.type, resource.id)}>{resource.label ?? resource.type}</a></li>
                      ))}</ul>
                    ) : <p>{copy.none}</p>}
                  </div>
                  <div><h3>{copy.exclusions}</h3><p>{copy.exclusionsHint}</p></div>
                </section>
                <section>
                  <h3>{copy.evidence}</h3>
                  {selected.evidence.length ? (
                    <ul className="evidence-reference-buttons">{selected.evidence.map((reference) => (
                      <li key={`${reference.type}:${reference.id}`}><button onClick={event => { const item = attentionEvidence.find(candidate => candidate.id === reference.id); if (item) evidenceDrawer.open(item, event.currentTarget) }} type="button"><span>{reference.type}</span>{reference.title ?? reference.type}{reference.status ? ` · ${reference.status}` : ""}</button></li>
                    ))}</ul>
                  ) : <p>{copy.none}</p>}
                </section>
                <details><summary>{copy.technical}</summary><p>{copy.reasonCodes}: {selected.reasonCodes.join(", ")}</p><p>{selected.correlationId}</p><p>{selected.id}</p></details>
              </div>
              {selectedApproval ? (
                <section className="attention-approval-decision" aria-label={copy.response}>
                  <h3>{copy.response}</h3>
                  <ApprovalDecisionControls
                    approval={selectedApproval}
                    copy={agentsCopy}
                    key={`${selectedApproval.id}:${selectedApproval.revision}`}
                    onDecide={decideAttentionApproval}
                    state={approvalDecisionState}
                  />
                  {selectedApproval.viewer_actionability?.status === "blocked" && (
                    <div className="attention-recovery-links">
                      {selected.sessionId && <a href={attentionResourceHref(selected, "session", selected.sessionId)}>{copy.source}: Session</a>}
                      {selected.workItemId && <a href={attentionResourceHref(selected, "work_item", selected.workItemId)}>{copy.source}: WorkItem</a>}
                    </div>
                  )}
                </section>
              ) : selected.audience.canRespond && selected.options.length > 0 ? (
                <form className="attention-response-form" onSubmit={submitResponse}>
                  {selected.response.choices.length > 0 && (
                    <fieldset className="attention-choice-list"><legend>{copy.choice}</legend>{selected.response.choices.map((choice) => (
                      <label key={choice.id}><input checked={responseDraft.choice === choice.id} name="attention-choice" onChange={() => setResponseDraft((current) => ({ ...current, choice: choice.id }))} type="radio" value={choice.id} />{choice.label}</label>
                    ))}</fieldset>
                  )}
                  {(selected.response.requiresReason || selected.kind !== "clarification") && (
                    <label>{copy.reason}<textarea onChange={(event) => { const reason = event.currentTarget.value; setResponseDraft((current) => ({ ...current, reason })); }} required={selected.response.requiresReason} value={responseDraft.reason} /></label>
                  )}
                  {selected.response.requiresMessage && (
                    <label>{copy.message}<textarea onChange={(event) => { const message = event.currentTarget.value; setResponseDraft((current) => ({ ...current, message })); }} required value={responseDraft.message} /></label>
                  )}
                  {(previewLoading || selected.options.some((option) => option.consequencePreviewPath)) && (
                    <section className="attention-preview"><h3>{copy.preview}</h3>{previewLoading ? <p>{copy.previewLoading}</p> : preview ? <><p>{preview.reasonCode}</p><ul>{preview.consequences.map((consequence) => <li key={consequence.code}>{consequence.summary}</li>)}{preview.warnings.map((warning, index) => <li key={`warning-${index}`}>{warning}</li>)}</ul></> : <p>{copy.previewUnavailable}</p>}</section>
                  )}
                  <div className="attention-response-actions">
                    {(selected.kind === "approval"
                      ? [...selected.options].sort((left, right) => Number(right.id === "reject") - Number(left.id === "reject"))
                      : selected.options).map((option) => (
                      <Button
                        disabled={busy || ((connectionState === "offline" || selected.freshness.state !== "current") && isDangerous(selected)) || (Boolean(option.consequencePreviewPath) && !preview)}
                        key={option.id}
                        name="attention-option"
                        type="submit"
                        value={option.id}
                        variant={["reject", "dismiss"].includes(option.id) ? "danger" : "primary"}
                      >
                        {selected.kind === "approval" && option.id === "approve"
                          ? (locale === "zh-CN" ? "批准并继续" : "Approve and continue")
                          : selected.kind === "approval" && option.id === "reject"
                            ? (locale === "zh-CN" ? "拒绝" : "Reject")
                          : option.label}
                      </Button>
                    ))}
                  </div>
                </form>
              ) : <p className="attention-readonly">{copy.readOnly}</p>}
            </>
          )}
        </main>
      </div>
      <EvidenceDrawer item={evidenceDrawer.selected} onClose={evidenceDrawer.close} />
    </section>
  );
}
