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
  InboxItemDetail,
  InboxItemKind,
  InboxListItem,
  ListResponse,
} from "@workmesh/contracts";
import { Badge, Button, Card, WorkSurfaceState } from "@workmesh/ui";
import { AttentionCenter } from "./attention-center";
import { CollaborationHub } from "../features/collaboration/collaboration-hub";
import {
  collaborationQueueHref,
  readCollaborationQueueRoute,
  type CollaborationQueue,
  type CollaborationQueueRoute,
} from "./collaboration-queue-route";
import { ApiError, apiMutation, apiRequest, json } from "./lib/api";
import { formatTime } from "./lib/agents";
import { useLocale } from "./lib/i18n";
import { LoadMoreButton, usePagedApiList } from "./lib/pagination";
import {
  useRealtimeConnectionState,
  useRealtimeSubscription,
} from "./lib/realtime";

type Actor = Readonly<{
  id: string;
  workspace_id?: string;
  workspace_role: "admin" | "member";
}>;
type TimelineItem = Readonly<{
  id: string;
  kind?: string;
  subtype?: string;
  actorName?: string;
  actor_name?: string;
  body?: string;
  summary?: string;
  occurredAt?: string;
  occurred_at?: string;
  threadId?: string;
  thread_id?: string;
  sourceId?: string;
  source_id?: string;
  payload?: Record<string, unknown>;
}>;

const value = (item: Record<string, unknown> | undefined, ...keys: string[]): string => {
  for (const key of keys) if (typeof item?.[key] === "string") return item[key] as string;
  return "";
};
const kindOptions: InboxItemKind[] = [
  "waiting_input",
  "approval",
  "session_stale",
  "ask",
  "review_request",
  "blocker",
  "handoff",
  "mention",
];

export function ActionableCollaborationQueues({ actor }: { actor: Actor }) {
  const { locale } = useLocale();
  const copy = locale === "zh-CN"
    ? {
        title: "协作队列",
        intro: "需要 Human 判断的事项、团队消息与 Agent 投递状态保持清晰分层。",
        needs: "需要我处理",
        messages: "消息与提及",
        agents: "Agent 投递",
        updates: "通知与更新",
        status: "状态",
        open: "待处理",
        resolved: "历史",
        kind: "类型",
        allKinds: "全部类型",
        response: "响应要求",
        allResponses: "全部",
        required: "需要响应",
        informational: "信息",
        apply: "应用筛选",
        empty: "当前队列没有匹配项目。",
        retry: "重试",
        needsGroup: "需要响应（由需要我处理统一执行）",
        infoGroup: "提及与信息更新",
        openThread: "打开上下文",
        closeThread: "返回队列",
        respondInAttention: "在需要我处理中响应",
        thread: "上下文线程",
        participants: "参与者与归属",
        recipient: "接收者",
        exactSession: "精确 Session",
        agentActor: "Agent actor 队列",
        claim: "认领",
        receipts: "回执",
        none: "无",
        stale: "接收者已过期",
        active: "接收者可用",
        recovery: "打开 Session 恢复控制",
        reply: "回复",
        send: "发送回复",
        sending: "正在发送…",
        technical: "技术详情",
        source: "来源",
        lifecycle: "生命周期",
        acknowledgedNotResolved: "已确认仅是回执，不等同于响应或解决。",
        readNotResolved: "已读不等同于响应或完成。",
        observable: "只读运行观测；Human 不能认领或读取 Agent Inbox 正文。",
        showUpdates: "显示新更新",
        pendingUpdates: "有新的协作更新，当前焦点保持不变。",
        loadError: "无法加载协作队列。",
        threadLoadError: "无法加载当前线程。",
        conflict: "线程已更新；草稿已保留，请检查最新内容后重试。",
        current: "实时",
        offline: "离线",
        grouped: "等价更新已安全归组；失败、冲突、决策和证据保持独立。",
      }
    : {
        title: "Collaboration queues",
        intro: "Human judgment, team messages, and Agent delivery state remain deliberately separate.",
        needs: "Needs You",
        messages: "Messages & mentions",
        agents: "Agent delivery",
        updates: "Notifications & updates",
        status: "Status",
        open: "Open",
        resolved: "History",
        kind: "Kind",
        allKinds: "All kinds",
        response: "Response expectation",
        allResponses: "All",
        required: "Requires response",
        informational: "Informational",
        apply: "Apply filters",
        empty: "No queue items match these filters.",
        retry: "Retry",
        needsGroup: "Needs response (governed in Needs You)",
        infoGroup: "Mentions and informational updates",
        openThread: "Open context",
        closeThread: "Back to queue",
        respondInAttention: "Respond in Needs You",
        thread: "Contextual thread",
        participants: "Participants and ownership",
        recipient: "Recipient",
        exactSession: "Exact Session",
        agentActor: "Agent actor queue",
        claim: "Claim",
        receipts: "Receipts",
        none: "None",
        stale: "Recipient is stale",
        active: "Recipient available",
        recovery: "Open Session recovery controls",
        reply: "Reply",
        send: "Send reply",
        sending: "Sending…",
        technical: "Technical details",
        source: "Source",
        lifecycle: "Lifecycle",
        acknowledgedNotResolved: "Acknowledged is a receipt; it is not a response or resolution.",
        readNotResolved: "Read is not response or completion.",
        observable: "Read-only operations view; Humans cannot claim or read Agent Inbox bodies.",
        showUpdates: "Show new updates",
        pendingUpdates: "New collaboration updates are queued; current focus has not moved.",
        loadError: "Unable to load collaboration queues.",
        threadLoadError: "Unable to load this thread.",
        conflict: "The thread changed; your draft is preserved. Review the latest facts and retry.",
        current: "Live",
        offline: "Offline",
        grouped: "Equivalent updates are safely grouped; failures, conflicts, decisions, and evidence remain distinct.",
      };
  const [route, setRoute] = useState<CollaborationQueueRoute>(() =>
    typeof window === "undefined"
      ? { queue: "needs-you", status: "open" }
      : readCollaborationQueueRoute(window.location.search),
  );
  const [draftRoute, setDraftRoute] = useState(route);
  const [selected, setSelected] = useState<InboxItemDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [detailError, setDetailError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const connection = useRealtimeConnectionState();
  const humanPage = usePagedApiList<InboxListItem>(
    `/api/v1/inbox?scope=mine&status=${encodeURIComponent(route.status)}`,
    { scopeKey: `human:${route.status}` },
  );
  const agentPage = usePagedApiList<InboxListItem>(
    `/api/v1/inbox?scope=agent_observability&status=${encodeURIComponent(route.status)}`,
    { optional: true, scopeKey: `agent:${route.status}` },
  );

  const writeRoute = useCallback((next: CollaborationQueueRoute, replace = false) => {
    const href = collaborationQueueHref(window.location.href, next);
    window.history[replace ? "replaceState" : "pushState"](window.history.state, "", href);
    setRoute(next);
    setDraftRoute(next);
  }, []);
  useEffect(() => {
    const restore = () => {
      const next = readCollaborationQueueRoute(window.location.search);
      setRoute(next);
      setDraftRoute(next);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const refreshQueues = useCallback(async () => {
    await Promise.all([humanPage.refresh(), agentPage.refresh()]);
    setPendingRefresh(false);
  }, [agentPage.refresh, humanPage.refresh]);
  useRealtimeSubscription(
    actor.workspace_id ? [{ type: "workspace", id: actor.workspace_id }] : [],
    () => {
      const active = document.activeElement;
      if (active && rootRef.current?.contains(active)) setPendingRefresh(true);
      else void refreshQueues();
    },
  );

  useEffect(() => {
    if (route.queue !== "messages" || !route.selectedId) {
      setSelected(null);
      setTimeline([]);
      setDetailError("");
      return;
    }
    let current = true;
    const load = async () => {
      try {
        setDetailError("");
        const detail = await apiRequest<InboxItemDetail>(`/api/v1/inbox/${encodeURIComponent(route.selectedId!)}`);
        if (!current) return;
        setSelected(detail);
        if (!detail.channel_id) return setTimeline([]);
        const page = await apiRequest<ListResponse<TimelineItem>>(`/api/v1/rooms/${encodeURIComponent(detail.channel_id)}/timeline?limit=100`);
        if (!current) return;
        const threadId = detail.source_thread_id ?? detail.source_room_message_id;
        setTimeline(page.items.filter(item => {
          const record = item as Record<string, unknown>;
          const payload = item.payload;
          return item.id === detail.source_room_message_id
            || value(record, "sourceId", "source_id") === detail.source_room_message_id
            || value(record, "threadId", "thread_id") === threadId
            || value(payload, "threadId", "thread_id", "replyToMessageId", "reply_to_message_id") === threadId;
        }));
      } catch (reason) {
        if (current) setDetailError(reason instanceof Error ? reason.message : copy.threadLoadError);
      }
    };
    void load();
    return () => { current = false; };
  }, [copy.threadLoadError, route.queue, route.selectedId]);

  const filterItems = useCallback((items: InboxListItem[]) => items.filter(item =>
    (!route.kind || item.kind === route.kind)
    && (!route.response
      || (route.response === "required" ? item.requires_response : !item.requires_response))), [route.kind, route.response]);
  const humanItems = useMemo(() => filterItems(humanPage.items), [filterItems, humanPage.items]);
  const agentItems = useMemo(() => filterItems(agentPage.items), [agentPage.items, filterItems]);
  const requiredItems = humanItems.filter(item => item.requires_response);
  const informationalItems = humanItems.filter(item => !item.requires_response);
  const selectedAgent = route.queue === "agent-delivery" && route.selectedId
    ? agentItems.find(item => item.id === route.selectedId) ?? null
    : null;

  const selectQueue = (queue: CollaborationQueue) => {
    setSelected(null);
    setTimeline([]);
    writeRoute({ ...route, queue, selectedId: undefined });
  };
  const openItem = (item: InboxListItem, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    writeRoute({ ...route, selectedId: item.id });
  };
  const closeItem = () => {
    writeRoute({ ...route, selectedId: undefined }, true);
    queueMicrotask(() => returnFocusRef.current?.focus());
  };
  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    writeRoute({ ...draftRoute, queue: route.queue, selectedId: undefined });
  };
  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    try {
      setSending(true);
      setDetailError("");
      await apiMutation<InboxItemDetail>(
        `human-inbox-reply:${selected.id}:${selected.revision}`,
        `/api/v1/inbox/${encodeURIComponent(selected.id)}/reply`,
        {
          method: "POST",
          headers: { ...json({}), "If-Match": `"revision-${selected.revision}"` },
          body: JSON.stringify({ body: reply.trim(), payload: { source: "collaboration_queue" } }),
        },
      );
      setReply("");
      await humanPage.refresh();
      closeItem();
    } catch (reason) {
      setDetailError(reason instanceof ApiError && reason.status === 409
        ? copy.conflict
        : reason instanceof Error ? reason.message : copy.threadLoadError);
      if (reason instanceof ApiError && reason.status === 409 && selected)
        setSelected(await apiRequest<InboxItemDetail>(`/api/v1/inbox/${encodeURIComponent(selected.id)}`).catch(() => selected));
    } finally {
      setSending(false);
    }
  };

  const filters = (route.queue === "messages" || route.queue === "agent-delivery") && (
    <form className="collaboration-queue-filters" onSubmit={submitFilters}>
      <label>{copy.status}<select value={draftRoute.status} onChange={event => setDraftRoute(current => ({ ...current, status: event.currentTarget.value === "resolved" ? "resolved" : "open" }))}><option value="open">{copy.open}</option><option value="resolved">{copy.resolved}</option></select></label>
      <label>{copy.kind}<select value={draftRoute.kind ?? ""} onChange={event => setDraftRoute(current => ({ ...current, kind: event.currentTarget.value ? event.currentTarget.value as InboxItemKind : undefined }))}><option value="">{copy.allKinds}</option>{kindOptions.map(kind => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</select></label>
      <label>{copy.response}<select value={draftRoute.response ?? ""} onChange={event => setDraftRoute(current => ({ ...current, response: event.currentTarget.value === "required" || event.currentTarget.value === "informational" ? event.currentTarget.value : undefined }))}><option value="">{copy.allResponses}</option><option value="required">{copy.required}</option><option value="informational">{copy.informational}</option></select></label>
      <Button type="submit" variant="secondary">{copy.apply}</Button>
    </form>
  );

  const messageCard = (item: InboxListItem) => (
    <button className="collaboration-queue-card" key={item.id} onClick={event => openItem(item, event.currentTarget)} type="button">
      <span><Badge tone={item.requires_response ? "warning" : "neutral"}>{item.kind.replaceAll("_", " ")}</Badge>{item.requires_response && <Badge tone="danger">{copy.required}</Badge>}</span>
      <strong>{item.source_subject_key ? `${item.source_subject_key} · ` : ""}{item.source_subject_title ?? item.source_summary ?? item.source_type}</strong>
      <span>{item.source_author_name ?? item.source_type} · {formatTime(item.created_at)}</span>
      <span>{copy.openThread}</span>
    </button>
  );
  const receiptText = (item: InboxListItem) => {
    const receipts = item.receipt_summary;
    if (!receipts) return copy.none;
    return `claim ${receipts.claimed} · read ${receipts.read} · ack ${receipts.acknowledged} · reply ${receipts.replied}`;
  };
  const agentCard = (item: InboxListItem) => (
    <button className="collaboration-queue-card" key={item.id} onClick={event => openItem(item, event.currentTarget)} type="button">
      <span><Badge tone={item.stale_recipient ? "danger" : "success"}>{item.stale_recipient ? copy.stale : copy.active}</Badge><Badge tone="neutral">{item.kind.replaceAll("_", " ")}</Badge></span>
      <strong>{item.source_subject_key ? `${item.source_subject_key} · ` : ""}{item.source_subject_title ?? item.source_summary ?? item.source_type}</strong>
      <span>{copy.recipient}: {item.recipient_actor_name ?? item.recipient_actor_id} · {item.recipient_session_id ? copy.exactSession : copy.agentActor}</span>
      <span>{copy.receipts}: {receiptText(item)}</span>
    </button>
  );

  const detail = selected && (
    <aside className="collaboration-thread" aria-labelledby="collaboration-thread-title">
      <header><div><p className="eyebrow">{copy.thread}</p><h3 id="collaboration-thread-title">{selected.source_message_intent?.replaceAll("_", " ") ?? selected.kind.replaceAll("_", " ")}</h3></div><Button onClick={closeItem} type="button" variant="secondary">{copy.closeThread}</Button></header>
      <Card title={selected.source_message_body ?? copy.source} subtitle={`${selected.source_subject_kind ?? selected.source_type} · ${formatTime(selected.created_at)}`}>
        <dl className="collaboration-thread-facts"><div><dt>{copy.participants}</dt><dd>{selected.source_author_actor_id ?? copy.none} → {selected.recipient_actor_id}</dd></div><div><dt>{copy.lifecycle}</dt><dd>{selected.status} · revision {selected.revision}</dd></div><div><dt>{copy.receipts}</dt><dd>{selected.receipts.map(receipt => `${receipt.kind} ${formatTime(receipt.created_at)}`).join(" · ") || copy.none}</dd></div></dl>
        <p>{copy.acknowledgedNotResolved}</p><p>{copy.readNotResolved}</p>
      </Card>
      <div className="collaboration-thread-timeline">
        {(timeline.length ? timeline : [{ id: selected.source_room_message_id ?? selected.id, body: selected.source_message_body ?? "", actorName: selected.source_author_actor_id ?? "WorkMesh", occurredAt: selected.created_at }]).map(item => <article className="room-card" key={item.id}><header><strong>{item.actorName ?? item.actor_name ?? "WorkMesh"}</strong><Badge tone="neutral">{item.subtype ?? item.kind ?? "message"}</Badge><time>{formatTime(item.occurredAt ?? item.occurred_at ?? selected.created_at)}</time></header><p>{item.body ?? item.summary ?? value(item.payload, "body", "summary")}</p></article>)}
      </div>
      {selected.requires_response ? <a className="wm-button wm-button-primary" href={collaborationQueueHref(window.location.href, { ...route, queue: "needs-you", selectedId: undefined })}>{copy.respondInAttention}</a> : selected.source_room_message_id && <form className="collaboration-reply" onSubmit={submitReply}><label>{copy.reply}<textarea onChange={event => setReply(event.currentTarget.value)} required value={reply} /></label><Button disabled={sending || !reply.trim()} type="submit" variant="primary">{sending ? copy.sending : copy.send}</Button></form>}
      <details><summary>{copy.technical}</summary><dl className="collaboration-thread-facts"><div><dt>{copy.source}</dt><dd>{selected.source_type} · {selected.source_id}</dd></div><div><dt>Inbox</dt><dd>{selected.id}</dd></div><div><dt>Thread</dt><dd>{selected.source_thread_id ?? copy.none}</dd></div><div><dt>Channel</dt><dd>{selected.channel_id ?? copy.none}</dd></div></dl></details>
    </aside>
  );
  const agentDetail = selectedAgent && (
    <aside className="collaboration-thread" aria-labelledby="agent-delivery-title"><header><div><p className="eyebrow">{copy.agents}</p><h3 id="agent-delivery-title">{selectedAgent.source_subject_title ?? selectedAgent.source_summary}</h3></div><Button onClick={closeItem} type="button" variant="secondary">{copy.closeThread}</Button></header><p>{copy.observable}</p><dl className="collaboration-thread-facts"><div><dt>{copy.recipient}</dt><dd>{selectedAgent.recipient_actor_name ?? selectedAgent.recipient_actor_id} · {selectedAgent.recipient_session_id ? copy.exactSession : copy.agentActor}</dd></div><div><dt>{copy.claim}</dt><dd>{selectedAgent.claimed_by_session_id ?? copy.none} {selectedAgent.claimed_by_session_state ? `· ${selectedAgent.claimed_by_session_state}` : ""}</dd></div><div><dt>{copy.receipts}</dt><dd>{receiptText(selectedAgent)}</dd></div><div><dt>{copy.lifecycle}</dt><dd>{selectedAgent.status} · {selectedAgent.stale_recipient ? copy.stale : copy.active}</dd></div></dl>{selectedAgent.stale_recipient && (selectedAgent.claimed_by_session_id ?? selectedAgent.recipient_session_id) && <a href={`/agent-sessions/${encodeURIComponent((selectedAgent.claimed_by_session_id ?? selectedAgent.recipient_session_id)!)}`}>{copy.recovery}</a>}<details><summary>{copy.technical}</summary><p>{selectedAgent.source_type} · {selectedAgent.source_id}</p><p>Inbox · {selectedAgent.id}</p></details></aside>
  );

  return <section className="actionable-collaboration" data-testid="actionable-collaboration" ref={rootRef}>
    <header className="surface-header"><div><p className="eyebrow">Human Control Plane</p><h2>{copy.title}</h2><p>{copy.intro}</p></div><Badge tone={connection === "connected" ? "success" : "warning"}>{connection === "connected" ? copy.current : copy.offline}</Badge></header>
    <nav aria-label={copy.title} className="collaboration-queue-tabs" role="tablist">{(["needs-you", "messages", "agent-delivery", "updates"] as CollaborationQueue[]).map(queue => <button aria-selected={route.queue === queue} key={queue} onClick={() => selectQueue(queue)} role="tab" type="button">{queue === "needs-you" ? copy.needs : queue === "messages" ? copy.messages : queue === "agent-delivery" ? copy.agents : copy.updates}</button>)}</nav>
    {pendingRefresh && <div className="collaboration-update-notice" role="status"><span>{copy.pendingUpdates}</span><Button onClick={() => void refreshQueues()} type="button" variant="secondary">{copy.showUpdates}</Button></div>}
    {filters}
    {detailError && <p className="error" role="alert">{detailError}</p>}
    {route.queue === "needs-you" && <AttentionCenter actor={actor} />}
    {route.queue === "messages" && <div className={`collaboration-split${route.selectedId ? " has-detail" : ""}`}><section aria-label={copy.messages} className="collaboration-queue-list">{humanPage.error ? <WorkSurfaceState actionLabel={copy.retry} description={humanPage.error.message} onAction={() => void humanPage.refresh()} state="error" title={copy.loadError} /> : humanPage.loading ? <WorkSurfaceState description={copy.intro} state="loading" title={copy.messages} /> : humanItems.length === 0 ? <WorkSurfaceState description={copy.empty} state="empty" title={copy.messages} /> : <><section><h3>{copy.needsGroup}</h3>{requiredItems.map(messageCard)}</section><section><h3>{copy.infoGroup}</h3>{informationalItems.map(messageCard)}</section><LoadMoreButton collection={humanPage} label={copy.messages} /></>}</section>{detail}</div>}
    {route.queue === "agent-delivery" && <div className={`collaboration-split${route.selectedId ? " has-detail" : ""}`}><section aria-label={copy.agents} className="collaboration-queue-list"><p>{copy.observable}</p>{agentPage.error ? <WorkSurfaceState actionLabel={copy.retry} description={agentPage.error.message} onAction={() => void agentPage.refresh()} state="error" title={copy.loadError} /> : agentPage.loading ? <WorkSurfaceState description={copy.intro} state="loading" title={copy.agents} /> : agentItems.length === 0 ? <WorkSurfaceState description={copy.empty} state="empty" title={copy.agents} /> : <>{agentItems.map(agentCard)}<LoadMoreButton collection={agentPage} label={copy.agents} /></>}</section>{agentDetail}</div>}
    {route.queue === "updates" && <section><p>{copy.grouped}</p><CollaborationHub /></section>}
  </section>;
}
