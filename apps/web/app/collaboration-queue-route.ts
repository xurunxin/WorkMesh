import type { InboxItemKind, InboxItemStatus } from "@workmesh/contracts";

export type CollaborationQueue =
  | "needs-you"
  | "messages"
  | "agent-delivery"
  | "updates";
export type CollaborationQueueRoute = Readonly<{
  queue: CollaborationQueue;
  status: InboxItemStatus;
  kind?: InboxItemKind;
  response?: "required" | "informational";
  selectedId?: string;
}>;

const queues = new Set<CollaborationQueue>([
  "needs-you",
  "messages",
  "agent-delivery",
  "updates",
]);
const kinds = new Set<InboxItemKind>([
  "waiting_input",
  "approval",
  "session_stale",
  "ask",
  "review_request",
  "blocker",
  "handoff",
  "mention",
]);

export function readCollaborationQueueRoute(search: string): CollaborationQueueRoute {
  const params = new URLSearchParams(search);
  const queue = params.get("queue");
  const kind = params.get("inboxKind");
  const response = params.get("inboxResponse");
  return {
    queue: queue && queues.has(queue as CollaborationQueue)
      ? (queue as CollaborationQueue)
      : "needs-you",
    status: params.get("inboxStatus") === "resolved" ? "resolved" : "open",
    ...(kind && kinds.has(kind as InboxItemKind) ? { kind: kind as InboxItemKind } : {}),
    ...(response === "required" || response === "informational" ? { response } : {}),
    ...(params.get("inboxItem") ? { selectedId: params.get("inboxItem")! } : {}),
  };
}

export function collaborationQueueHref(
  current: string,
  route: CollaborationQueueRoute,
): string {
  const url = new URL(current, "http://workmesh.local");
  if (route.queue === "needs-you") url.searchParams.delete("queue");
  else url.searchParams.set("queue", route.queue);
  if (route.status === "resolved") url.searchParams.set("inboxStatus", "resolved");
  else url.searchParams.delete("inboxStatus");
  const fields: Array<[string, string | undefined]> = [
    ["inboxKind", route.kind],
    ["inboxResponse", route.response],
    ["inboxItem", route.selectedId],
  ];
  for (const [key, value] of fields) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
