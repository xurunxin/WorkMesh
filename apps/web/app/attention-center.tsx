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
  approvalActionability,
  classifyApprovalDecisionFailure,
  decideApproval,
  defaultApprovalDecisionReason,
  getApproval,
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

export type BulkFailureResolution = Readonly<{
  kind: ReturnType<typeof classifyApprovalDecisionFailure>;
  retryable: boolean;
  requiresReconfirmation: boolean;
}>;

/**
 * Keep bulk response recovery aligned with the single-approval path. A
 * forbidden or stale decision is not safe to replay; only transport/server
 * failures get an item-level retry affordance.
 */
export function describeBulkFailure(reason: unknown): BulkFailureResolution {
  const kind = classifyApprovalDecisionFailure(reason);
  return {
    kind,
    retryable: kind === "network" || kind === "server",
    requiresReconfirmation: kind === "conflict",
  };
}

type BulkItemResult = Readonly<{
  itemId: string;
  approvalId: string;
  title: string;
  decision: "approve" | "reject";
  reason: string;
  status: "busy" | "success" | "error";
  message?: string;
  retryable: boolean;
  requiresReconfirmation: boolean;
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
          approvalLoading: "正在加载权威审批范围…",
          approvalLoadFailed: "无法加载完整审批范围，决策已保持关闭。",
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
          bulkResults: "批量处理结果",
          bulkWorking: "处理中…",
          bulkSucceeded: "已完成",
          bulkFailureForbidden: "权限已拒绝，不会自动重试。",
          bulkFailureConflict: "来源已变化，已重新同步；请重新确认后再提交。",
          bulkFailureExpired: "审批已过期，无法重试。",
          bulkFailureAuthority: "授权已失效，无法重试。",
          bulkFailureNetwork: "网络暂时不可用，可重试此项。",
          bulkFailureServer: "服务暂时不可用，可重试此项。",
          bulkFailureUnknown: "处理失败，请查看详情后决定是否重试。",
          bulkReconciled: "权威状态已同步；此项已不再需要处理。",
          bulkReconcileMismatch: "权威状态已变化，但未找到你刚提交的相同决定；不会将此项误报为成功。",
          bulkRetry: "重试此项",
          bulkReconfirm: "重新同步并确认",
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
          approvalLoading: "Loading authoritative approval scope…",
          approvalLoadFailed: "The complete approval scope could not be loaded. Decisions remain disabled.",
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
          bulkResults: "Bulk response results",
          bulkWorking: "Working…",
          bulkSucceeded: "Completed",
          bulkFailureForbidden: "Permission denied; this item will not be retried.",
          bulkFailureConflict: "The source changed; data was refreshed. Confirm again before submitting.",
          bulkFailureExpired: "The approval expired and cannot be retried.",
          bulkFailureAuthority: "The authority is no longer active and cannot be retried.",
          bulkFailureNetwork: "The network is unavailable; retry this item.",
          bulkFailureServer: "The service is unavailable; retry this item.",
          bulkFailureUnknown: "The response failed; review the details before deciding whether to retry.",
          bulkReconciled: "Authoritative state synchronized; this item no longer needs action.",
          bulkReconcileMismatch: "Authoritative state changed, but your matching decision was not recorded; this item is not reported as successful.",
          bulkRetry: "Retry this item",
          bulkReconfirm: "Refresh and confirm",
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
  const [approvalDetail, setApprovalDetail] = useState<Approval | null>(null);
  const [approvalDetailLoading, setApprovalDetailLoading] = useState(false);
  const [approvalDetailError, setApprovalDetailError] = useState("");
  const responsePreparationIdRef = useRef(0);
  const responseDraftItemIdRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkResults, setBulkResults] = useState<Record<string, BulkItemResult>>({});
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
    const preparationId = ++responsePreparationIdRef.current;
    const optionId = item.recommendedOptionId ?? item.options[0]?.id ?? "";
    if (responseDraftItemIdRef.current !== item.id) {
      responseDraftItemIdRef.current = item.id;
      setResponseDraft({
        optionId,
        reason: "",
        message: "",
        choice: item.response.choices[0]?.id ?? "",
      });
    }
    setPreview(null);
    setApprovalDecisionState({ status: "idle" });
    setApprovalDetail(null);
    setApprovalDetailError("");
    if (item.kind === "approval" && item.source.type === "approval") {
      setApprovalDetailLoading(true);
      void getApproval(item.source.id).then((loaded) => {
        if (responsePreparationIdRef.current === preparationId) {
          setApprovalDetail(loaded);
          setApprovalDetailError("");
        }
      }).catch((reason) => {
        if (responsePreparationIdRef.current === preparationId) {
          setApprovalDetail(null);
          setApprovalDetailError(reason instanceof Error ? reason.message : copy.approvalLoadFailed);
        }
      }).finally(() => {
        if (responsePreparationIdRef.current === preparationId) setApprovalDetailLoading(false);
      });
    } else setApprovalDetailLoading(false);
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
  }, [copy.approvalLoadFailed]);

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
        } else {
          responseDraftItemIdRef.current = null;
          setSelected(null);
        }
        return loaded;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : copy.loadError);
        return null;
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
    () => { void refresh(route); },
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
    responseDraftItemIdRef.current = null;
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
        reason: result.decision.reason,
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
  const bulkFailureMessage = (reason: unknown, resolution: BulkFailureResolution): string => {
    const label: Record<BulkFailureResolution["kind"], string> = {
      forbidden: copy.bulkFailureForbidden,
      conflict: copy.bulkFailureConflict,
      expired: copy.bulkFailureExpired,
      authority_inactive: copy.bulkFailureAuthority,
      network: copy.bulkFailureNetwork,
      server: copy.bulkFailureServer,
      unknown: copy.bulkFailureUnknown,
    };
    const detail = reason instanceof ApiError
      ? `${reason.message}${reason.code ? ` (${reason.code})` : ""}`
      : reason instanceof Error
        ? reason.message
        : copy.bulkFailureUnknown;
    return `${label[resolution.kind]} ${detail}`.trim();
  };

  const reconcileBulkOutcome = async (outcome: BulkItemResult): Promise<BulkItemResult> => {
    if (outcome.status !== "error" || !outcome.retryable) return outcome;
    try {
      const current = await getApproval(outcome.approvalId);
      const actionability = approvalActionability(current);
      const expectedDecision = outcome.decision === "approve" ? "approved" : "rejected";
      const matchingDecision = current.decisions?.some((decision) =>
        decision.actor_id === actor.id
        && decision.decision === expectedDecision
        && decision.reason === outcome.reason,
      ) ?? false;
      if (matchingDecision) {
        return { ...outcome, status: "success", message: copy.bulkReconciled, retryable: false };
      }
      if (current.status !== "pending"
        || (actionability.status === "blocked" && ["viewer_already_decided", "already_decided"].includes(actionability.reason))) {
        return {
          ...outcome,
          message: copy.bulkReconcileMismatch,
          retryable: false,
          requiresReconfirmation: false,
        };
      }
      if (actionability.status === "blocked" && actionability.reason === "expired") {
        return { ...outcome, message: copy.bulkFailureExpired, retryable: false };
      }
      if (actionability.status === "blocked"
        && (actionability.reason === "session_inactive" || actionability.reason === "authority_revoked")) {
        return { ...outcome, message: copy.bulkFailureAuthority, retryable: false };
      }
    } catch {
      // The authoritative read failed too. Preserve the original retryable
      // transport/server error instead of guessing that the mutation landed.
    }
    return outcome;
  };

  const runBulkItems = async (
    requests: ReadonlyArray<{
      item: HumanAttentionItem;
      decision: "approve" | "reject";
      reason: string;
    }>,
  ) => {
    if (requests.length === 0 || busy) return;
    const pendingResults = Object.fromEntries(
      requests.map(({ item, decision, reason }) => [item.id, {
        itemId: item.id,
        approvalId: item.source.id,
        title: item.title,
        decision,
        reason,
        status: "busy" as const,
        retryable: false,
        requiresReconfirmation: false,
      } satisfies BulkItemResult]),
    );
    setBusy(true);
    setError("");
    setApplying("");
    setBulkMessage("");
    setBulkResults((current) => ({ ...current, ...pendingResults }));
    try {
      const settled = await Promise.allSettled(
        requests.map(({ item, decision, reason }) =>
          execute(item, {
            optionId: decision,
            reason,
            message: "",
            choice: "",
          }),
        ),
      );
      const outcomes = requests.map((request, index): BulkItemResult => {
        const result = settled[index];
        if (result?.status === "fulfilled") {
          return {
            itemId: request.item.id,
            approvalId: request.item.source.id,
            title: request.item.title,
            decision: request.decision,
            reason: request.reason,
            status: "success",
            message: copy.bulkSucceeded,
            retryable: false,
            requiresReconfirmation: false,
          };
        }
        const resolution = describeBulkFailure(result?.reason);
        return {
          itemId: request.item.id,
          approvalId: request.item.source.id,
          title: request.item.title,
          decision: request.decision,
          reason: request.reason,
          status: "error",
          message: bulkFailureMessage(result?.reason, resolution),
          retryable: resolution.retryable,
          requiresReconfirmation: resolution.requiresReconfirmation,
        };
      });
      // Always reconcile after a batch. In particular, a revision conflict
      // must refresh the authoritative item before the Human can confirm it.
      await refresh(route);
      const reconciledOutcomes = await Promise.all(outcomes.map(reconcileBulkOutcome));
      setBulkResults((current) => ({
        ...current,
        ...Object.fromEntries(reconciledOutcomes.map((outcome) => [outcome.itemId, outcome])),
      }));
      setBulkSelected((current) => {
        const next = new Set(current);
        reconciledOutcomes.forEach((outcome) => {
          if (outcome.status === "error") next.add(outcome.itemId);
          else next.delete(outcome.itemId);
        });
        return next;
      });
      const failed = reconciledOutcomes.filter((outcome) => outcome.status === "error").length;
      setBulkMessage(copy.bulkResult(reconciledOutcomes.length - failed, failed));
    } finally {
      setBusy(false);
    }
  };

  const runBulk = async (decision: "approve" | "reject") => {
    const reason = bulkReason.trim() || defaultApprovalDecisionReason(decision === "approve" ? "approved" : "rejected");
    const items = page?.items.filter((item) => bulkSelected.has(item.id)) ?? [];
    await runBulkItems(items.map((item) => ({ item, decision, reason })));
  };

  const retryBulkItem = async (itemId: string) => {
    const previous = bulkResults[itemId];
    const item = page?.items.find((candidate) => candidate.id === itemId);
    if (!previous || previous.status !== "error" || !previous.retryable) return;
    if (!item) {
      setBusy(true);
      setBulkResults((current) => ({ ...current, [itemId]: { ...previous, status: "busy" } }));
      try {
        const currentApproval = await getApproval(previous.approvalId);
        const actionability = approvalActionability(currentApproval);
        if (actionability.status === "actionable") {
          const result = await decideApproval(
            currentApproval,
            previous.decision === "approve" ? "approved" : "rejected",
            previous.reason,
          );
          setBulkResults((current) => ({
            ...current,
            [itemId]: {
              ...previous,
              status: "success",
              message: result.status === "pending" && !result.quorum.reached
                ? agentsCopy.approvalDecisionQuorum(result.quorum.approved, result.quorum.required)
                : copy.bulkSucceeded,
              retryable: false,
            },
          }));
          setBulkSelected((current) => {
            const next = new Set(current);
            next.delete(itemId);
            return next;
          });
        } else {
          const reconciled = await reconcileBulkOutcome({ ...previous, status: "error" });
          setBulkResults((current) => ({ ...current, [itemId]: reconciled }));
        }
        await refresh(route);
      } catch (reason) {
        const resolution = describeBulkFailure(reason);
        setBulkResults((current) => ({
          ...current,
          [itemId]: {
            ...previous,
            status: "error",
            message: bulkFailureMessage(reason, resolution),
            retryable: resolution.retryable,
            requiresReconfirmation: resolution.requiresReconfirmation,
          },
        }));
      } finally {
        setBusy(false);
      }
      return;
    }
    await runBulkItems([{
      item,
      decision: previous.decision,
      reason: previous.reason,
    }]);
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
  const projectedApproval = selected ? approvalFromAttentionItem(selected) : null;
  const selectedApproval = projectedApproval && approvalDetail?.id === projectedApproval.id
    ? approvalDetail
    : projectedApproval?.viewer_actionability?.status === "blocked"
      && projectedApproval.viewer_actionability.reason !== "viewer_already_decided"
      ? projectedApproval
      : null;
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
      {(bulkSelected.size > 0 || Object.keys(bulkResults).length > 0) && (
        <section aria-label={copy.bulk} className="attention-bulk-bar">
          {bulkSelected.size > 0 && <>
            <strong>{copy.selected(bulkSelected.size)}</strong>
            <label>
              {copy.bulkReason}
              <input
                aria-label={copy.bulkReason}
                onChange={(event) => setBulkReason(event.currentTarget.value)}
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
          </>}
          {Object.values(bulkResults).length > 0 && (
            <div aria-label={copy.bulkResults} className="attention-bulk-results">
              <strong aria-live="polite" role="status">{copy.bulkResults}</strong>
              <ul>
                {Object.values(bulkResults).map((result) => (
                  <li data-testid={`attention-bulk-result-${result.itemId}`} key={result.itemId}>
                    <span>{result.title}</span>
                    <span>{result.status === "busy" ? copy.bulkWorking : result.message}</span>
                    {result.status === "error" && result.retryable && (
                      <Button
                        disabled={busy}
                        onClick={() => void retryBulkItem(result.itemId)}
                        type="button"
                        variant="secondary"
                      >
                        {copy.bulkRetry}
                      </Button>
                    )}
                    {result.status === "error" && result.requiresReconfirmation && (
                      <Button
                        disabled={busy}
                        onClick={() => void refresh(route)}
                        type="button"
                        variant="secondary"
                      >
                        {copy.bulkReconfirm}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
              {projectedApproval && !selectedApproval ? (
                <section className="attention-approval-decision" aria-label={copy.response}>
                  <h3>{copy.response}</h3>
                  <div className={approvalDetailError ? "approval-detail-gate is-error" : "approval-detail-gate"} role={approvalDetailError ? "alert" : "status"}>
                    <span>{approvalDetailError ? copy.approvalLoadFailed : copy.approvalLoading}</span>
                    {approvalDetailError && <Button disabled={approvalDetailLoading} onClick={() => void prepareResponse(selected)} type="button" variant="secondary">{copy.retry}</Button>}
                  </div>
                </section>
              ) : selectedApproval ? (
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
