"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest, json } from "./lib/api";
import {
  type AgentSession,
  agentStateClass,
  agentStateLabel,
  canStopAgentSession,
  formatTime,
} from "./lib/agents";
import {
  type Room,
  type RoomRecord,
  arrayValue,
  createRoomMessage,
  findWorkItemRoom,
  mergeRoomTimelines,
  normalizeRoomTimelineItem,
  numberValue,
  optionalRoomRequest,
  roomMutation,
  stringValue,
  value,
} from "./lib/room";
import { LoadMoreButton, usePagedApiList } from "./lib/pagination";
import { useRealtimeSubscription } from "./lib/realtime";
import { workRoomRefreshTargets } from "./lib/realtime-refresh";
import { Markdown } from "../features/rich-content/markdown";
import {
  RichTextEditor,
  type DraftIdentity,
} from "../features/rich-content/editor";
import { WorkItemArtifacts } from "../features/rich-content/artifacts";
import { CollaborationHub } from "../features/collaboration/collaboration-hub";
import { type WorkRoomCopy, useLocale } from "./lib/i18n";

type Tab =
  "conversation" | "plan" | "activity" | "artifacts" | "decisions" | "sessions";
type LegacyComment = {
  id: string;
  body: string;
  revision: number;
  parent_comment_id: string | null;
  reply_to_comment_id: string | null;
  author_name: string;
  author_kind: "human";
  is_resolved: boolean;
  created_at: string;
  mentions: string[];
};
type LegacyHuman = { id: string; display_name: string };
type IdentifiedRoomRecord = RoomRecord & { id: string };
type Props = {
  workItemId: string;
  draftIdentity: Omit<DraftIdentity, "field" | "baseRevision">;
  legacyComments: LegacyComment[];
  legacyHumans: LegacyHuman[];
  onLegacyComment: (
    event: FormEvent<HTMLFormElement>,
    parentCommentId?: string,
  ) => Promise<void>;
  onLegacyUpdate: (
    comment: LegacyComment,
    patch: Record<string, string | boolean>,
  ) => Promise<void>;
  onLegacyRefresh: () => Promise<unknown>;
};

const titleCase = (value: string): string =>
  value.replaceAll("_", " ") || "message";
const itemKind = (item: RoomRecord): string =>
  stringValue(
    item,
    "intent",
    "messageIntent",
    "message_intent",
    "kind",
    "type",
  ) || "comment";
const itemBody = (item: RoomRecord): string =>
  stringValue(item, "body", "bodyMarkdown", "body_markdown", "summary", "text");
const itemActor = (item: RoomRecord, fallback = "Unknown actor"): string =>
  stringValue(
    item,
    "actorName",
    "actor_name",
    "displayName",
    "display_name",
    "authorName",
    "author_name",
    "senderName",
    "sender_name",
    "actorId",
    "actor_id",
  ) || fallback;
const itemTime = (item: RoomRecord): string =>
  stringValue(item, "createdAt", "created_at", "timestamp");
const itemPayload = (item: RoomRecord): RoomRecord =>
  (value(item, "payload", "structuredPayload", "structured_payload") as
    RoomRecord | undefined) ?? {};
const textList = (record: RoomRecord, ...keys: string[]): string[] => {
  const found = value(record, ...keys);
  if (!Array.isArray(found)) return [];
  return found
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? stringValue(
              item as RoomRecord,
              "label",
              "title",
              "value",
              "summary",
              "impact",
              "id",
            )
          : String(item),
    )
    .filter(Boolean);
};

export function summarizeWorkRoom(
  sessions: AgentSession[],
  timeline: RoomRecord[],
  handoffs: RoomRecord[],
  humans: LegacyHuman[],
) {
  const principalIds = Array.from(
    new Set(
      sessions
        .map((session) => session.principal_human_actor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const principalHumans = principalIds.map(
    (id) =>
      humans.find((human) => human.id === id)?.display_name ?? id.slice(0, 8),
  );
  const agentActors = Array.from(
    new Set(
      sessions.map((session) => session.agent_id || session.agent_actor_id),
    ),
  );
  const pendingKinds = new Set(["ask", "review_request", "blocker", "handoff"]);
  const pendingResponses =
    timeline.filter(
      (item) =>
        pendingKinds.has(itemKind(item)) &&
        !["resolved", "closed", "completed"].includes(
          stringValue(item, "status", "responseStatus", "response_status"),
        ),
    ).length +
    handoffs.filter((handoff) =>
      ["draft", "requested"].includes(
        stringValue(handoff, "status") || "requested",
      ),
    ).length;
  const evidence = timeline.filter(
    (item) =>
      ["artifact", "artifact_published", "evidence", "context_delta"].includes(
        itemKind(item),
      ) ||
      arrayValue(
        itemPayload(item),
        "additions",
        "contextDeltas",
        "context_deltas",
        "sources",
      ).length > 0 ||
      arrayValue(item, "contextDeltas", "context_deltas").length > 0,
  ).length;
  const decisions = timeline.filter((item) =>
    ["decision", "decide"].includes(itemKind(item)),
  ).length;
  return {
    agentActors,
    principalHumans,
    sessions: sessions.length,
    pendingResponses,
    evidence,
    decisions,
    handoffs: handoffs.length,
  };
}

function AgentMessageControls({
  sessionId,
  revision,
  text,
}: {
  sessionId: string;
  revision?: number;
  text: WorkRoomCopy;
}) {
  const control = async (signal: "pause" | "stop") => {
    await apiRequest(
      `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/signals`,
      {
        method: "POST",
        headers: {
          ...json({}),
          ...(revision === undefined
            ? {}
            : { "If-Match": `"revision-${revision}"` }),
        },
        body: JSON.stringify({
          signal,
          reason: signal === "pause" ? text.agentPauseReason : text.agentStopReason,
        }),
      },
    );
  };
  const prompt = async () => {
    const body = window.prompt(text.agentPromptPlaceholder)?.trim();
    if (!body) return;
    await apiRequest(
      `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/prompt`,
      {
        method: "POST",
        headers: {
          ...json({}),
          ...(revision === undefined
            ? {}
            : { "If-Match": `"revision-${revision}"` }),
        },
        body: JSON.stringify({ bodyMarkdown: body }),
      },
    );
  };
  return (
    <span className="message-session-controls">
      <a href={`/agent-sessions/${encodeURIComponent(sessionId)}`}>
        {text.viewSession}
      </a>
      <button type="button" onClick={() => void prompt()}>
        {text.agentPrompt}
      </button>
      <button type="button" onClick={() => void control("pause")}>
        {text.agentPause}
      </button>
      <button
        className="danger"
        type="button"
        onClick={() => void control("stop")}
      >
        {text.agentStop}
      </button>
    </span>
  );
}

function TimelineCard({
  item,
  onResolve,
}: {
  item: RoomRecord;
  onResolve: (item: RoomRecord) => void;
}) {
  const { workRoomCopy: text } = useLocale();
  const intent = itemKind(item);
  const payload = itemPayload(item);
  const status = stringValue(
    item,
    "status",
    "responseStatus",
    "response_status",
  );
  const sessionId = stringValue(item, "sessionId", "session_id");
  const stepId =
    stringValue(item, "planStepId", "plan_step_id") ||
    stringValue(payload, "planStepId", "plan_step_id");
  const step =
    stringValue(
      item,
      "planStepTitle",
      "plan_step_title",
      "stepTitle",
      "step_title",
    ) ||
    stringValue(
      payload,
      "planStepTitle",
      "plan_step_title",
      "stepTitle",
      "step_title",
    ) ||
    stepId.slice(0, 8);
  const actorKind =
    stringValue(item, "actorKind", "actor_kind") ||
    stringValue(payload, "actorKind", "actor_kind");
  const context = arrayValue(
    payload,
    "additions",
    "contextDeltas",
    "context_deltas",
    "sources",
  ).concat(arrayValue(item, "contextDeltas", "context_deltas"));
  return (
    <article
      className={`room-card intent-${intent}`}
      data-testid={`timeline-${stringValue(item, "id")}`}
    >
      <header className="timeline-attribution">
        <span className="timeline-fact">
          <small>{text.timelineActor}</small>
          <strong>{itemActor(item, text.unknownActor)}</strong>
          {actorKind && (
            <span className="intent-badge">{titleCase(actorKind)}</span>
          )}
        </span>
        <span className="timeline-fact">
          <small>{text.timelineIntent}</small>
          <span className="intent-badge">{titleCase(intent)}</span>
        </span>
        {sessionId && (
          <span className="timeline-fact">
            <small>{text.timelineSession}</small>
            <a href={`/agent-sessions/${encodeURIComponent(sessionId)}`}>
              {sessionId.slice(0, 8)}
            </a>
          </span>
        )}
        {step && (
          <span className="timeline-fact">
            <small>{text.timelinePlanStep}</small>
            <span className="plan-step">{step}</span>
          </span>
        )}
        <time>{formatTime(itemTime(item))}</time>
      </header>
      <Markdown source={itemBody(item) || text.timelineBodyMissing} />
      {sessionId && (
        <AgentMessageControls
          sessionId={sessionId}
          revision={numberValue(
            itemPayload(item),
            "sessionRevision",
            "session_revision",
          )}
          text={text}
        />
      )}
      {intent === "context_delta" && (
        <p>
          {text.timelineContextDeltaBase}:{" "}
          {stringValue(payload, "baseSnapshotId", "base_snapshot_id") ||
            text.notReported}{" "}
          · {text.timelineContextDeltaNew}:{" "}
          {stringValue(payload, "sourceSnapshotId", "source_snapshot_id") ||
            text.notReported}{" "}
          · {text.timelineContextDeltaHash}:{" "}
          {stringValue(payload, "contentHash", "content_hash") ||
            text.notReported}{" "}
          · {text.timelineContextDeltaAddedBy}:{" "}
          {stringValue(payload, "createdByActorId", "created_by_actor_id") ||
            text.notReported}
        </p>
      )}
      {context.length > 0 && (
        <section className="context-delta" aria-label={text.timelineContextDelta}>
          <strong>{text.timelineContextDelta}</strong>
          {context.map((source, index) => (
            <span key={`${stringValue(source, "hash", "checksum")}:${index}`}>
              {text.timelineContextDeltaSource}{" "}
              {stringValue(
                source,
                "source",
                "uri",
                "title",
                "sourceType",
                "source_type",
                "sourceId",
                "source_id",
              ) || text.timelineContextDeltaSourceFallback}{" "}
              · {stringValue(source, "hash", "checksum") || text.timelineContextDeltaHashFallback}
            </span>
          ))}
        </section>
      )}
      {status === "open" && (
        <button type="button" onClick={() => onResolve(item)}>
          {text.timelineResolveRequest}
        </button>
      )}
    </article>
  );
}

function SessionTree({
  sessions,
  roomId,
  onError,
  reload,
}: {
  sessions: AgentSession[];
  roomId: string | null;
  onError: (message: string) => void;
  reload: () => Promise<void>;
}) {
  const { workRoomCopy: text } = useLocale();
  const byParent = useMemo(
    () =>
      sessions.reduce<Record<string, AgentSession[]>>((all, session) => {
        const parent =
          stringValue(
            session as unknown as RoomRecord,
            "parent_session_id",
            "parentSessionId",
          ) || "root";
        (all[parent] ??= []).push(session);
        return all;
      }, {}),
    [sessions],
  );
  const signal = async (
    session: AgentSession,
    signalName: "pause" | "stop",
  ) => {
    try {
      await apiRequest(`/api/v1/agent-sessions/${session.id}/signals`, {
        method: "POST",
        headers: { ...json({}), "If-Match": `"revision-${session.revision}"` },
        body: JSON.stringify({
          signal: signalName,
          reason:
            signalName === "pause"
              ? text.sessionInterruptReason
              : text.sessionStopReason,
        }),
      });
      if (roomId && signalName === "pause")
        await createRoomMessage(roomId, {
          intent: "blocker",
          body: text.sessionInterruptMessage.replace(
            "{id}",
            session.id.slice(0, 8),
          ),
          payload: { sessionId: session.id, action: "interrupt" },
        });
      await reload();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : text.sessionControlError,
      );
    }
  };
  const branch = (parent: string): ReactNode => (
    <ul className="session-tree">
      {(byParent[parent] ?? []).map((session) => (
        <li key={session.id} data-testid={`session-tree-${session.id}`}>
          <div>
            <span className={agentStateClass(session.state)}>
              {agentStateLabel(session.state)}
            </span>
            <strong>{session.id.slice(0, 8)}</strong>
            <span>
              {session.current_plan_version_id
                ? text.sessionStatePlanAttached
                : text.sessionStateNoPlan}
            </span>
            <span>
              {text.sessionStateHeartbeat}: {formatTime(session.last_heartbeat_at)}
            </span>
            <span>
              {text.sessionStateBudget}:{" "}
              {session.budget.maxRuntimeSeconds
                ? `${session.budget.maxRuntimeSeconds}s`
                : text.sessionStateBudgetDefault}
            </span>
            <button type="button" onClick={() => void signal(session, "pause")}>
              {text.sessionActionInterrupt}
            </button>
            <button
              className="danger"
              type="button"
              disabled={!canStopAgentSession(session.state)}
              onClick={() => void signal(session, "stop")}
            >
              {text.sessionActionStop}
            </button>
          </div>
          {branch(session.id)}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="session-tree-panel" aria-label={text.sessionTreeAria}>
      <h3>{text.sessionTreeTitle}</h3>
      {sessions.length === 0 ? (
        <p className="empty">{text.sessionTreeEmpty}</p>
      ) : (
        branch("root")
      )}
    </section>
  );
}

function LeaseCard({
  lease,
  onForceRelease,
  onRefresh,
}: {
  lease: RoomRecord;
  onForceRelease: (lease: RoomRecord) => void;
  onRefresh: () => void;
}) {
  const { workRoomCopy: text } = useLocale();
  const holder =
    stringValue(
      lease,
      "holderName",
      "holder_name",
      "holderActorId",
      "holder_actor_id",
    ) || text.unknownHolder;
  const resource =
    stringValue(
      lease,
      "resourceId",
      "resource_id",
      "resourceType",
      "resource_type",
    ) || text.resourceNotReported;
  const conflict =
    stringValue(lease, "status", "errorCode", "error_code") === "conflict" ||
    stringValue(lease, "errorCode", "error_code") === "LEASE_CONFLICT";
  return (
    <article
      className={`room-card lease-card${conflict ? " lease-conflict" : ""}`}
      data-testid={`lease-${stringValue(lease, "id")}`}
    >
      <header>
        <strong>{conflict ? text.leaseConflictTitle : text.leaseTitle}</strong>
        <span className="intent-badge">{resource}</span>
      </header>
      <p>
        {text.leaseHolderAgent}: {holder} · {text.leaseSession}:{" "}
        {stringValue(lease, "holderSessionId", "holder_session_id") ||
          text.notReported}
      </p>
      <p>
        {text.leasePlanStep}:{" "}
        {stringValue(
          lease,
          "planStepId",
          "plan_step_id",
          "stepId",
          "step_id",
        ) || text.notReported}{" "}
        · {text.leaseExpires}: {formatTime(stringValue(lease, "expiresAt", "expires_at"))}
      </p>
      {conflict && (
        <p className="error">
          {text.leaseConflictHint}
        </p>
      )}
      <div className="session-actions">
        <button type="button" onClick={onRefresh}>
          {text.leaseRefresh}
        </button>
        <button
          className="danger"
          type="button"
          onClick={() => onForceRelease(lease)}
        >
          {text.leaseForceRelease}
        </button>
      </div>
    </article>
  );
}

type HandoffAction = "request" | "accept" | "reject" | "cancel" | "complete";
function HandoffCard({
  handoff,
  onAction,
}: {
  handoff: RoomRecord;
  onAction: (handoff: RoomRecord, action: HandoffAction) => void;
}) {
  const { workRoomCopy: text } = useLocale();
  const status = stringValue(handoff, "status") || "requested";
  const routingValue = value(handoff, "routingSnapshot", "routing_snapshot");
  const routing =
    routingValue &&
    typeof routingValue === "object" &&
    !Array.isArray(routingValue)
      ? (routingValue as RoomRecord)
      : {};
  const sections: Array<[string, string[]]> = [
    [text.handoffCompletedWork, textList(handoff, "completedWork", "completed_work")],
    [text.handoffRemainingWork, textList(handoff, "remainingWork", "remaining_work")],
    [text.handoffOpenQuestions, textList(handoff, "openQuestions", "open_questions")],
    [text.handoffRisks, textList(handoff, "risks")],
    [
      text.handoffAcceptanceCriteria,
      textList(handoff, "acceptanceCriteria", "acceptance_criteria"),
    ],
  ];
  return (
    <article
      className="room-card handoff-card"
      data-testid={`handoff-${stringValue(handoff, "id")}`}
    >
      <header>
        <strong>{text.handoffTitle}</strong>
        <span className="intent-badge">{status}</span>
      </header>
      <p>{stringValue(handoff, "summary") || text.handoffSummaryMissing}</p>
      <p>
        {text.handoffRequestedAction}:{" "}
        {stringValue(handoff, "requestedAction", "requested_action") ||
          text.notReported}
      </p>
      <p>
        {text.handoffTo}:{" "}
        {stringValue(
          handoff,
          "toAgentName",
          "to_agent_name",
          "targetSkill",
          "target_skill",
          "targetAgentId",
          "target_agent_id",
        ) || text.notReported}{" "}
        · {text.handoffScope}:{" "}
        {stringValue(handoff, "scopeType", "scope_type") || text.notReported}{" "}
        {stringValue(handoff, "scopeId", "scope_id")}
      </p>
      <p>
        {text.handoffContextSnapshot}:{" "}
        {stringValue(handoff, "contextSnapshotId", "context_snapshot_id") ||
          text.notReported}{" "}
        · {text.handoffArtifacts}:{" "}
        {textList(handoff, "artifactIds", "artifact_ids").join(", ") || text.noArtifacts}{" "}
        · {text.handoffLeasePolicy}:{" "}
        {stringValue(handoff, "leaseTransferPolicy", "lease_transfer_policy") ||
          "retain"}
      </p>
      {Object.keys(routing).length > 0 && (
        <p>
          {text.handoffRouting}: {text.selectedLabel}{" "}
          {stringValue(routing, "selectedAgentId", "selected_agent_id") ||
            text.none}{" "}
          {text.handoffRoutingCandidates(textList(routing, "candidateIds", "candidate_ids").length || 0)}
        </p>
      )}
      {stringValue(handoff, "machineRejectReason", "machine_reject_reason") && (
        <p>
          {text.handoffRejection}:{" "}
          {stringValue(handoff, "machineRejectReason", "machine_reject_reason")}
        </p>
      )}
      {sections.map(
        ([label, entries]) =>
          entries.length > 0 && (
            <section key={label}>
              <strong>{label}</strong>
              <ul>
                {entries.map((entry, index) => (
                  <li key={`${label}-${index}`}>{entry}</li>
                ))}
              </ul>
            </section>
          ),
      )}
      <div className="session-actions">
        {status === "draft" && (
          <button onClick={() => onAction(handoff, "request")}>
            {text.handoffRequest}
          </button>
        )}
        {status === "requested" && (
          <>
            <button onClick={() => onAction(handoff, "accept")}>{text.handoffAccept}</button>
            <button
              className="danger"
              onClick={() => onAction(handoff, "reject")}
            >
              {text.handoffReject}
            </button>
          </>
        )}
        {["draft", "requested"].includes(status) && (
          <button
            className="danger"
            onClick={() => onAction(handoff, "cancel")}
          >
            {text.handoffCancel}
          </button>
        )}
        {status === "accepted" && (
          <button onClick={() => onAction(handoff, "complete")}>
            {text.handoffComplete}
          </button>
        )}
      </div>
    </article>
  );
}

function DecisionCard({
  decision,
  onAction,
}: {
  decision: RoomRecord;
  onAction: (
    decision: RoomRecord,
    action: "finalize" | "supersede" | "reverse",
  ) => void;
}) {
  const { workRoomCopy: text } = useLocale();
  const final =
    ["final", "finalized", "accepted"].includes(
      stringValue(decision, "status"),
    ) ||
    Boolean(value(decision, "finalizedByActorId", "finalized_by_actor_id"));
  const options = textList(decision, "options");
  const affected = arrayValue(
    decision,
    "affectedResources",
    "affected_resources",
  );
  const relations = arrayValue(decision, "relations");
  return (
    <article
      className="room-card decision-card"
      data-testid={`decision-${stringValue(decision, "id")}`}
    >
      <header>
        <strong>{text.decisionTitle}</strong>
        <span className={final ? "decision-final" : "decision-proposal"}>
          {final ? text.decisionFinal : text.decisionProposal}
        </span>
      </header>
      <p>
        {stringValue(decision, "question", "title", "summary") ||
          text.decisionQuestionMissing}
      </p>
      <p>
        {text.decisionSelected}:{" "}
        {stringValue(decision, "selectedOption", "selected_option") ||
          text.notSelected}{" "}
        · {text.decisionRationale}: {stringValue(decision, "rationale") || text.notReported}
      </p>
      <p>
        {text.decisionProposedBy}:{" "}
        {stringValue(
          decision,
          "proposedByActorId",
          "proposed_by_actor_id",
          "actorId",
          "actor_id",
        ) || `${text.unknownActor} (${text.notReported})`}{" "}
        · {text.decisionFinalizedBy}:{" "}
        {stringValue(decision, "finalizedByActorId", "finalized_by_actor_id") ||
          text.notFinalized}
      </p>
      {options.length > 0 && (
        <ul>
          {options.map((option, index) => (
            <li key={index}>{option}</li>
          ))}
        </ul>
      )}
      {affected.length > 0 && (
        <p>
          {text.decisionAffected}:{" "}
          {affected
            .map(
              (resource) =>
                `${stringValue(resource, "resourceType", "resource_type")}:${stringValue(resource, "resourceId", "resource_id")} (${stringValue(resource, "impact")})`,
            )
            .join(", ")}
        </p>
      )}
      {relations.length > 0 && (
        <p>
          {text.decisionLineage}:{" "}
          {relations
            .map(
              (relation) =>
                `${stringValue(relation, "kind")} ${stringValue(relation, "relatedDecisionId", "related_decision_id")}`,
            )
            .join(", ")}
        </p>
      )}
      <div className="session-actions">
        {!final && (
          <button onClick={() => onAction(decision, "finalize")}>
            {text.decisionFinalize}
          </button>
        )}
        {final && (
          <>
            <button onClick={() => onAction(decision, "supersede")}>
              {text.decisionSupersede}
            </button>
            <button
              className="danger"
              onClick={() => onAction(decision, "reverse")}
            >
              {text.decisionReverse}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export function WorkRoom({
  workItemId,
  draftIdentity,
  legacyComments,
  legacyHumans,
  onLegacyComment,
  onLegacyUpdate,
  onLegacyRefresh,
}: Props) {
  const { workRoomCopy: text } = useLocale();
  const tabs: { id: Tab; label: string }[] = [
    { id: "conversation", label: text.tabConversation },
    { id: "plan", label: text.tabPlan },
    { id: "activity", label: text.tabActivity },
    { id: "artifacts", label: text.tabArtifacts },
    { id: "decisions", label: text.tabDecisions },
    { id: "sessions", label: text.tabSessions },
  ];
  const [tab, setTab] = useState<Tab>("conversation");
  const [room, setRoom] = useState<Room | null>(null);
  const [decisions, setDecisions] = useState<RoomRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activitySessionId, setActivitySessionId] = useState("");
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const timelinePage = usePagedApiList<
    IdentifiedRoomRecord,
    IdentifiedRoomRecord
  >(room ? `/api/v1/rooms/${encodeURIComponent(room.id)}/timeline` : null, {
    optional: true,
    map: (item) => normalizeRoomTimelineItem(item) as IdentifiedRoomRecord,
  });
  const sessionsPage = usePagedApiList<AgentSession>(
    `/api/v1/agent-sessions?workItemId=${encodeURIComponent(workItemId)}`,
    { optional: true },
  );
  const handoffsPage = usePagedApiList<IdentifiedRoomRecord>(
    "/api/v1/handoffs",
    { optional: true },
  );
  const leasesPage = usePagedApiList<IdentifiedRoomRecord>("/api/v1/leases", {
    optional: true,
  });
  const timeline = timelinePage.items;
  const sessions = sessionsPage.items;
  const sessionIds = useMemo(
    () => new Set(sessions.map((session) => session.id)),
    [sessions],
  );
  const handoffs = useMemo(
    () =>
      handoffsPage.items.filter(
        (handoff) =>
          !stringValue(handoff, "fromSessionId", "from_session_id") ||
          sessionIds.has(
            stringValue(handoff, "fromSessionId", "from_session_id"),
          ),
      ),
    [handoffsPage.items, sessionIds],
  );
  const leases = useMemo(
    () =>
      leasesPage.items.filter((lease) => {
        const leaseSessionId = stringValue(
          lease,
          "sessionId",
          "session_id",
          "holderSessionId",
          "holder_session_id",
        );
        return !leaseSessionId || sessionIds.has(leaseSessionId);
      }),
    [leasesPage.items, sessionIds],
  );
  const collectionError =
    timelinePage.error ??
    sessionsPage.error ??
    handoffsPage.error ??
    leasesPage.error;
  const realtimeResources = useMemo(
    () => [{ type: "work_item" as const, id: workItemId }],
    [workItemId],
  );
  useRealtimeSubscription(realtimeResources, (invalidation) => {
    const targets = workRoomRefreshTargets(invalidation, workItemId);
    const refreshes: Array<Promise<unknown>> = [];
    if (targets.has("timeline")) refreshes.push(timelinePage.refresh());
    if (targets.has("comments")) refreshes.push(onLegacyRefresh());
    return Promise.all(refreshes).then(() => undefined);
  });
  const load = useCallback(async () => {
    try {
      setError("");
      setRoom(await findWorkItemRoom(workItemId));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : text.loadError,
      );
    }
  }, [workItemId, text.loadError]);
  useEffect(() => {
    void load();
  }, [load]);
  const refreshAll = useCallback(async () => {
    await load();
    await Promise.all([
      timelinePage.refresh(),
      sessionsPage.refresh(),
      handoffsPage.refresh(),
      leasesPage.refresh(),
    ]);
  }, [
    handoffsPage.refresh,
    leasesPage.refresh,
    load,
    sessionsPage.refresh,
    timelinePage.refresh,
  ]);
  useEffect(() => {
    let current = true;
    const timelineDecisions = timeline.filter(
      (item) => itemKind(item) === "decision",
    );
    void Promise.all(
      timelineDecisions.map((decision) =>
        optionalRoomRequest<unknown>(
          `/api/v1/decisions/${encodeURIComponent(stringValue(decision, "id"))}`,
        ),
      ),
    )
      .then((details) => {
        if (!current) return;
        setDecisions(
          timelineDecisions.map((decision, index) =>
            details[index] && typeof details[index] === "object"
              ? { ...decision, ...(details[index] as RoomRecord) }
              : decision,
          ),
        );
      })
      .catch((reason) => {
        if (current)
          setError(
            reason instanceof Error
              ? reason.message
              : text.decisionsLoadError,
          );
      });
    return () => {
      current = false;
    };
  }, [timeline]);
  const legacyTimeline = legacyComments.map((comment) => ({
    id: `comment-${comment.id}`,
    type: "comment",
    intent: "comment",
    body: comment.body,
    author_name: comment.author_name,
    actorKind: comment.author_kind,
    created_at: comment.created_at,
    status: comment.is_resolved ? "resolved" : "open",
  }));
  const visibleTimeline = mergeRoomTimelines(timeline, legacyTimeline);
  const participants = room?.participants.length
    ? room.participants
    : sessions.map((session) => ({
        id: session.agent_actor_id,
        name: session.agent_id,
        sessionId: session.id,
        state: session.state,
      }));
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const intent = String(form.get("intent") ?? "comment");
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    if (!room) {
      await onLegacyComment(event);
      return;
    }
    try {
      setBusy(true);
      await createRoomMessage(room.id, {
        intent,
        body,
        requiresResponse: ["ask", "review_request", "blocker"].includes(intent),
      });
      event.currentTarget.reset();
      await timelinePage.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : text.sendError,
      );
    } finally {
      setBusy(false);
    }
  };
  const resolve = async (message: RoomRecord) => {
    try {
      setBusy(true);
      await roomMutation(
        `/api/v1/messages/${encodeURIComponent(stringValue(message, "id"))}/resolve`,
      );
      await timelinePage.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : text.resolveError,
      );
    } finally {
      setBusy(false);
    }
  };
  const forceRelease = async (lease: RoomRecord) => {
    if (
      !window.confirm(text.leaseForceReleaseConfirm)
    )
      return;
    try {
      setBusy(true);
      await roomMutation(
        `/api/v1/leases/${encodeURIComponent(stringValue(lease, "id"))}/force-release`,
        { reason: text.leaseForceReleaseReason },
        numberValue(lease, "revision"),
      );
      await leasesPage.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : text.forceReleaseError,
      );
    } finally {
      setBusy(false);
    }
  };
  const handoffAction = async (handoff: RoomRecord, action: HandoffAction) => {
    try {
      setBusy(true);
      const reasonText =
        action === "accept" ? text.handoffAcceptReason
        : action === "reject" ? text.handoffRejectReason
        : action === "cancel" ? text.handoffCancelReason
        : text.handoffCompleteReason;
      const body = action === "accept" ? {} : { reason: reasonText };
      await roomMutation(
        `/api/v1/handoffs/${encodeURIComponent(stringValue(handoff, "id"))}/${action}`,
        body,
        numberValue(handoff, "revision"),
      );
      await handoffsPage.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : text.handoffActionError,
      );
    } finally {
      setBusy(false);
    }
  };
  const decisionAction = async (
    decision: RoomRecord,
    action: "finalize" | "supersede" | "reverse",
  ) => {
    try {
      setBusy(true);
      await roomMutation(
        `/api/v1/decisions/${encodeURIComponent(stringValue(decision, "id"))}/${action}`,
        action === "supersede"
          ? { reason: text.decisionSupersedeReason }
          : {},
        numberValue(decision, "revision"),
      );
      await timelinePage.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : text.decisionActionError,
      );
    } finally {
      setBusy(false);
    }
  };
  const activityItems = timeline.filter((item) => {
    const kind = itemKind(item);
    const sessionId = stringValue(item, "sessionId", "session_id");
    return (
      (showHeartbeats || kind !== "heartbeat") &&
      (!activitySessionId || sessionId === activitySessionId) &&
      !["comment", "ask", "answer", "review_request"].includes(kind)
    );
  });
  const planItems = timeline.filter((item) =>
    ["plan", "plan_step", "assignment", "claim", "step_comment"].includes(
      itemKind(item),
    ),
  );
  const artifactItems = timeline.filter(
    (item) =>
      ["artifact", "artifact_published", "context_delta"].includes(
        itemKind(item),
      ) ||
      arrayValue(
        itemPayload(item),
        "additions",
        "contextDeltas",
        "context_deltas",
        "sources",
      ).length > 0 ||
      arrayValue(item, "contextDeltas", "context_deltas").length > 0,
  );
  const summary = summarizeWorkRoom(sessions, timeline, handoffs, legacyHumans);
  const participantNames = participants
    .filter(
      (participant) =>
        stringValue(participant, "actorKind", "actor_kind", "kind") !== "human",
    )
    .map((participant) =>
      stringValue(participant, "displayName", "display_name", "name"),
    )
    .filter(Boolean);
  return (
    <section
      className="work-room"
      aria-label={text.title}
      data-testid="work-room"
    >
      <header>
        <div>
          <h3>{text.title}</h3>
          <p>
            {text.intro}
          </p>
        </div>
        <button disabled={busy} onClick={() => void refreshAll()}>
          {text.refresh}
        </button>
      </header>
      {(error || collectionError) && (
        <p className="error" role="alert">
          {error || collectionError?.message}
        </p>
      )}
      <section
        className="work-room-attribution"
        aria-label={text.tabAria}
      >
        <div>
          <small>{text.agentParticipants}</small>
          <strong>
            {participantNames.join(", ") ||
              summary.agentActors.join(", ") ||
              text.noneReported}
          </strong>
        </div>
        <div>
          <small>{text.principalHumans}</small>
          <strong>
            {summary.principalHumans.join(", ") || text.notReported}
          </strong>
        </div>
        <div>
          <small>{text.sessionsStat}</small>
          <strong>{summary.sessions}</strong>
        </div>
        <div>
          <small>{text.pendingResponses}</small>
          <strong>{summary.pendingResponses}</strong>
        </div>
        <div>
          <small>{text.evidenceStat}</small>
          <strong>{summary.evidence}</strong>
        </div>
        <div>
          <small>{text.decisionsHandoffs}</small>
          <strong>
            {summary.decisions} / {summary.handoffs}
          </strong>
        </div>
      </section>
      <div role="tablist" aria-label={text.tabAria}>
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "selected" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "conversation" && (
        <section>
          {room && (
            <form
              className="room-message-form"
              onSubmit={(event) => void send(event)}
            >
              <label>
                {text.messageIntentLabel}
                <select name="intent" defaultValue="inform">
                  <option value="inform">{text.messageIntentComment}</option>
                  <option value="ask">{text.messageIntentAsk}</option>
                  <option value="answer">{text.messageIntentAnswer}</option>
                  <option value="review_request">{text.messageIntentReviewRequest}</option>
                  <option value="blocker">{text.messageIntentBlocker}</option>
                  <option value="handoff">{text.messageIntentHandoff}</option>
                </select>
              </label>
              <label>
                {text.messageBodyLabel}
                <textarea
                  name="body"
                  placeholder={text.messageBodyPlaceholder}
                  required
                />
              </label>
              <button disabled={busy}>{text.messageSend}</button>
            </form>
          )}
          <LegacyCommentComposer
            draftIdentity={draftIdentity}
            humans={legacyHumans}
            onSubmit={onLegacyComment}
          />
          {!room && (
            <p className="empty">
              {text.roomUnavailable}
            </p>
          )}
          <div className="combined-timeline" aria-label={text.tabAria}>
            {visibleTimeline.length === 0 ? (
              <p className="empty">{text.noTimeline}</p>
            ) : (
              visibleTimeline.map((item) => (
                <TimelineCard
                  key={stringValue(item, "id")}
                  item={item}
                  onResolve={(message) => void resolve(message)}
                />
              ))
            )}
          </div>
          <LoadMoreButton collection={timelinePage} label="timeline" />
          {legacyComments.length > 0 && (
            <section
              className="legacy-comment-controls"
              aria-label={text.legacyAria}
            >
              {legacyComments.map((comment) => {
                const mentioned = legacyHumans
                  .filter((human) => comment.mentions.includes(human.id))
                  .map((human) => `@${human.display_name}`);
                return (
                  <article className="room-card" key={comment.id}>
                    <header>
                      <strong>{comment.author_name}</strong>
                      <span className="intent-badge">{text.legacyHuman}</span>
                      <span>{comment.is_resolved ? text.resolved : text.open}</span>
                    </header>
                    <Markdown source={comment.body} />
                    {mentioned.length > 0 && (
                      <p>{text.legacyMentioned}: {mentioned.join(", ")}</p>
                    )}
                    <div className="session-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const body = window.prompt(
                            text.legacyEditPrompt,
                            comment.body,
                          );
                          if (body?.trim())
                            void onLegacyUpdate(comment, { body: body.trim() });
                        }}
                      >
                        {text.legacyEditPrompt}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onLegacyUpdate(comment, {
                            isResolved: !comment.is_resolved,
                          })
                        }
                      >
                        {comment.is_resolved ? text.legacyReopen : text.legacyResolve}
                      </button>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => {
                          if (window.confirm(text.legacyDeleteConfirm))
                            void onLegacyUpdate(comment, { deleted: true });
                        }}
                      >
                        {text.legacyDelete}
                      </button>
                    </div>
                    <form
                      className="reply-form"
                      onSubmit={(event) =>
                        void onLegacyComment(
                          event,
                          comment.parent_comment_id ?? comment.id,
                        )
                      }
                    >
                      <textarea name="body" placeholder={text.legacyReplyPlaceholder} required />
                      <button>{text.legacyReply}</button>
                    </form>
                  </article>
                );
              })}
            </section>
          )}
        </section>
      )}
      {tab === "plan" && (
        <section
          className="combined-timeline"
          aria-label={text.planAria}
        >
          {planItems.length === 0 ? (
            <p className="empty">
              {text.planEmpty}
            </p>
          ) : (
            planItems.map((item) => {
              const payload = itemPayload(item);
              return (
                <article className="room-card" key={stringValue(item, "id")}>
                  <header>
                    <strong>
                      {stringValue(
                        payload,
                        "title",
                        "stepTitle",
                        "step_title",
                      ) ||
                        itemBody(item) ||
                        text.planStepFallback}
                    </strong>
                    <span className="plan-step">
                      {stringValue(payload, "status") || itemKind(item)}
                    </span>
                  </header>
                  <p>
                    {text.planOwner}:{" "}
                    {stringValue(
                      payload,
                      "ownerName",
                      "owner_name",
                      "ownerActorId",
                      "owner_actor_id",
                    ) || text.unassigned}{" "}
                    · {text.planDependencies}:{" "}
                    {arrayValue(payload, "dependsOn", "depends_on")
                      .map((value) => stringValue(value, "id", "title"))
                      .filter(Boolean)
                      .join(", ") || text.none}
                  </p>
                  <p>
                    {text.planRequired}:{" "}
                    {stringValue(
                      payload,
                      "required",
                      "requiredApproval",
                      "required_approval",
                    ) || text.notReported}{" "}
                    · {text.planAssignment}:{" "}
                    {stringValue(payload, "assignmentId", "assignment_id") ||
                      text.notReported}{" "}
                    · {text.planClaim}:{" "}
                    {stringValue(payload, "leaseId", "lease_id") ||
                      text.notClaimed}
                  </p>
                  {stringValue(
                    payload,
                    "comment",
                    "stepComment",
                    "step_comment",
                  ) && (
                    <p>
                      {text.planStepComment}:{" "}
                      {stringValue(
                        payload,
                        "comment",
                        "stepComment",
                        "step_comment",
                      )}
                    </p>
                  )}
                </article>
              );
            })
          )}
          <LoadMoreButton collection={timelinePage} label="timeline" />
          <SessionTree
            sessions={sessions}
            roomId={room?.id ?? null}
            onError={setError}
            reload={refreshAll}
          />
        </section>
      )}
      {tab === "activity" && (
        <section
          className="combined-timeline"
          aria-label={text.activityAria}
        >
          <div className="activity-filters">
            <label>
              {text.activityFilterSession}
              <select
                value={activitySessionId}
                onChange={(event) =>
                  setActivitySessionId(event.currentTarget.value)
                }
              >
                <option value="">{text.activityFilterAll}</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label className="heartbeat-toggle">
              <input
                type="checkbox"
                checked={showHeartbeats}
                onChange={(event) =>
                  setShowHeartbeats(event.currentTarget.checked)
                }
              />{" "}
              {text.activityShowHeartbeats}
            </label>
          </div>
          {activityItems.map((item) => (
            <TimelineCard
              key={stringValue(item, "id")}
              item={item}
              onResolve={(message) => void resolve(message)}
            />
          ))}
          {activityItems.length === 0 && (
            <p className="empty">
              {text.activityEmpty}
            </p>
          )}
          <LoadMoreButton collection={timelinePage} label="timeline" />
          {leases.map((lease) => (
            <LeaseCard
              key={stringValue(lease, "id")}
              lease={lease}
              onForceRelease={(lease) => void forceRelease(lease)}
              onRefresh={() => void leasesPage.refresh()}
            />
          ))}
          <LoadMoreButton collection={leasesPage} label="leases" />
        </section>
      )}
      {tab === "artifacts" && (
        <section
          className="combined-timeline"
          aria-label={text.artifactsAria}
        >
          <WorkItemArtifacts copy={text.artifactAttachments} workItemId={workItemId} />
          {artifactItems.map((item) => (
            <TimelineCard
              key={stringValue(item, "id")}
              item={item}
              onResolve={(message) => void resolve(message)}
            />
          ))}
          {artifactItems.length === 0 && (
            <p className="empty">
              {text.artifactsEmpty}
            </p>
          )}
          <LoadMoreButton collection={timelinePage} label="timeline" />
          <p className="empty">
            {text.artifactsAttribution}
          </p>
        </section>
      )}
      {tab === "decisions" && (
        <section className="decision-list">
          {decisions.length === 0 ? (
            <p className="empty">{text.decisionsEmpty}</p>
          ) : (
            decisions.map((decision) => (
              <DecisionCard
                key={stringValue(decision, "id")}
                decision={decision}
                onAction={(item, action) => void decisionAction(item, action)}
              />
            ))
          )}
          {handoffs.map((handoff) => (
            <HandoffCard
              key={stringValue(handoff, "id")}
              handoff={handoff}
              onAction={(item, action) => void handoffAction(item, action)}
            />
          ))}
          <LoadMoreButton collection={timelinePage} label="timeline" />
          <LoadMoreButton collection={handoffsPage} label="handoffs" />
        </section>
      )}
      {tab === "sessions" && (
        <section>
          <SessionTree
            sessions={sessions}
            roomId={room?.id ?? null}
            onError={setError}
            reload={refreshAll}
          />
          <LoadMoreButton collection={sessionsPage} label="sessions" />
          <section className="lease-list">
            {leases.length === 0 ? (
              <p className="empty">{text.leasesEmpty}</p>
            ) : (
              leases.map((lease) => (
                <LeaseCard
                  key={stringValue(lease, "id")}
                  lease={lease}
                  onForceRelease={(item) => void forceRelease(item)}
                  onRefresh={() => void leasesPage.refresh()}
                />
              ))
            )}
            <LoadMoreButton collection={leasesPage} label="leases" />
          </section>
        </section>
      )}
    </section>
  );
}

type InboxItem = RoomRecord;
export function InboxPanel() {
  const { inboxCopy: text } = useLocale();
  const [status, setStatus] = useState("open");
  const [busyItemId, setBusyItemId] = useState("");
  const [actionError, setActionError] = useState("");
  const page = usePagedApiList<InboxItem & { id: string }>(
    `/api/v1/inbox?status=${encodeURIComponent(status)}`,
    { optional: true },
  );
  const items = page.items;
  const acknowledge = async (item: InboxItem) => {
    const id = stringValue(item, "id");
    if (!id) return;
    try {
      setBusyItemId(id);
      setActionError("");
      await apiRequest(`/api/v1/inbox/${encodeURIComponent(id)}/acknowledge`, {
        method: "POST",
        headers: json({}),
        body: "{}",
      });
      await page.refresh();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : text.acknowledgeError,
      );
    } finally {
      setBusyItemId("");
    }
  };
  return (
    <section className="inbox-panel" data-testid="stage2-inbox">
      <header>
        <div>
          <h3>{text.title}</h3>
          <p>{text.intro}</p>
        </div>
        <label>
          {text.status}
          <select
            value={status}
            onChange={(event) => setStatus(event.currentTarget.value)}
          >
            <option value="open">{text.statusOpen}</option>
            <option value="resolved">{text.statusResolved}</option>
          </select>
        </label>
      </header>
      {(page.error || actionError) && (
        <p className="error" role="alert">
          {page.error?.message || actionError}
        </p>
      )}
      {items.length === 0 ? (
        <p className="empty">{text.empty}</p>
      ) : (
        items.map((item) => {
          const payload = itemPayload(item);
          const sourceType = stringValue(item, "source_type", "sourceType");
          const sourceId = stringValue(item, "source_id", "sourceId");
          const workItemId =
            stringValue(item, "workItemId", "work_item_id") ||
            (sourceType === "work_item" ? sourceId : "");
          const id = stringValue(item, "id");
          return (
            <article
              className="room-card"
              id={`inbox-${stringValue(item, 'id')}`}
              key={id}
            >
              <header>
                <span className="intent-badge">
                  {text.intentLabel(itemKind(item))}
                </span>
                <strong>
                  {stringValue(
                    payload,
                    "actorName",
                    "actor_name",
                    "sourceName",
                    "source_name",
                  ) ||
                    sourceType ||
                    "WorkMesh"}
                </strong>
              </header>
              <p>
                {itemBody(item) ||
                  stringValue(
                    payload,
                    "summary",
                    "contextSummary",
                    "context_summary",
                    "body",
                  ) ||
                  text.inspectCanonical}
              </p>
              <dl className="inbox-facts">
                <div>
                  <dt>{text.source}</dt>
                  <dd>
                    {sourceType || text.notReported} ·{" "}
                    {sourceId ? sourceId.slice(0, 8) : text.notReported}
                  </dd>
                </div>
                <div>
                  <dt>{text.risk}</dt>
                  <dd>
                    {stringValue(item, "riskLevel", "risk_level") ||
                      stringValue(payload, "riskLevel", "risk_level", "risk") ||
                      text.notReported}
                  </dd>
                </div>
                <div>
                  <dt>{text.deadline}</dt>
                  <dd>
                    {formatTime(
                      stringValue(
                        item,
                        "deadline",
                        "expiresAt",
                        "expires_at",
                      ) ||
                        stringValue(
                          payload,
                          "deadline",
                          "expiresAt",
                          "expires_at",
                        ),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{text.itemStatus}</dt>
                  <dd>{text.intentLabel(stringValue(item, "status") || "open")}</dd>
                </div>
                <div>
                  <dt>{text.responsibleHuman}</dt>
                  <dd>
                    {stringValue(
                      item,
                      "responsibleHumanName",
                      "responsible_human_name",
                      "recipientName",
                      "recipient_name",
                    ) ||
                      stringValue(
                        payload,
                        "responsibleHumanName",
                        "responsible_human_name",
                      ) ||
                      text.currentHuman}
                  </dd>
                </div>
                <div>
                  <dt>{text.context}</dt>
                  <dd>
                    {stringValue(
                      payload,
                      "contextSummary",
                      "context_summary",
                      "summary",
                    ) || text.inspectCanonical}
                  </dd>
                </div>
              </dl>
              <div className="session-actions">
                {workItemId && (
                  <a href={`/?workItemId=${encodeURIComponent(workItemId)}`}>
                    {text.openWorkRoom}
                  </a>
                )}
                {status === "open" && (
                  <button
                    type="button"
                    disabled={busyItemId === id}
                    onClick={() => void acknowledge(item)}
                  >
                    {busyItemId === id ? text.acknowledging : text.acknowledge}
                  </button>
                )}
              </div>
            </article>
          );
        })
      )}
      <LoadMoreButton collection={page} label={text.title} />
      <CollaborationHub />
    </section>
  );
}

function LegacyCommentComposer({
  draftIdentity,
  humans,
  onSubmit,
}: {
  draftIdentity: Omit<DraftIdentity, "field" | "baseRevision">;
  humans: LegacyHuman[];
  onSubmit: Props["onLegacyComment"];
}) {
  const { workRoomCopy: text } = useLocale();
  const [body, setBody] = useState("");
  return (
    <form
      className="legacy-comment-form"
      onSubmit={(event) => {
        void onSubmit(event).then(() => setBody(""));
      }}
    >
      <RichTextEditor
        identity={{ ...draftIdentity, field: "comment", baseRevision: 0 }}
        label={text.legacyAria}
        mode="comment"
        name="body"
        required
        value={body}
        onChange={setBody}
      />
      <label className="mentions">
        {text.legacyMentionLabel}
        <select name="mentions" multiple aria-label={text.legacyMentionLabel}>
          {humans.map((human) => (
            <option key={human.id} value={human.id}>
              {human.display_name}
            </option>
          ))}
        </select>
      </label>
      <button data-testid="create-comment">{text.legacyPostComment}</button>
    </form>
  );
}
