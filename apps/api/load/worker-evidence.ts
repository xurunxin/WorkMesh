export type WorkerContainerState = {
  capturedAt: string;
  id: string;
  name: string;
  status: string;
  running: boolean;
  restartCount: number;
  oomKilled: boolean;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
};

export type WorkerContainerEvent = {
  action: string;
  time: number;
  timeNano: number;
  containerId: string;
};

export type WorkerContainerEventEvidence = {
  events: WorkerContainerEvent[];
  invalidEventCount: number;
  ignoredEventCount: number;
};

export type WorkerEventLineResult =
  | { kind: "accepted"; event: WorkerContainerEvent }
  | { kind: "ignored" }
  | { kind: "invalid" };

const forbiddenLifecycleActions = new Set([
  "die",
  "restart",
  "oom",
  "kill",
  "stop",
  "destroy",
]);

export const evaluateWorkerContinuity = ({
  baseline,
  samples,
  events,
  samplingErrors,
}: {
  baseline: WorkerContainerState;
  samples: WorkerContainerState[];
  events: WorkerContainerEvent[];
  samplingErrors: number;
}) => {
  const states = [baseline, ...samples];
  const forbiddenEvents = events.filter((event) =>
    forbiddenLifecycleActions.has(event.action),
  );
  return {
    containerId: baseline.id,
    sampleCount: states.length,
    samplingErrors,
    sameContainer: states.every((state) => state.id === baseline.id),
    runningThroughout: states.every(
      (state) => state.running && state.status === "running",
    ),
    restartCountZero: states.every((state) => state.restartCount === 0),
    noOom: states.every((state) => !state.oomKilled),
    noForbiddenEvents: forbiddenEvents.length === 0,
    forbiddenEvents,
  };
};

type WorkerLogCategory =
  | "redis_hint_connection_error"
  | "outbox_tick_failed"
  | "worker_shutdown_failed"
  | "other_error"
  | "other";

const workerLogCategory = (line: string): WorkerLogCategory => {
  if (line.includes("redis realtime hint unavailable"))
    return "redis_hint_connection_error";
  if (line.includes("outbox worker tick failed")) return "outbox_tick_failed";
  if (line.includes("outbox worker shutdown failed"))
    return "worker_shutdown_failed";
  if (/\b(?:error|failed|exception)\b/i.test(line)) return "other_error";
  return "other";
};

export const sanitizeWorkerLogs = (output: string, maximumSamples = 100) => {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const counts: Record<WorkerLogCategory, number> = {
    redis_hint_connection_error: 0,
    outbox_tick_failed: 0,
    worker_shutdown_failed: 0,
    other_error: 0,
    other: 0,
  };
  const categorized = lines.map((line) => {
    const timestamp = /^(\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?)\s/.exec(line)?.[1];
    const category = workerLogCategory(line);
    counts[category] += 1;
    return { timestamp, category };
  });
  const samples = categorized.slice(-maximumSamples);
  return {
    totalLines: lines.length,
    retainedSamples: samples.length,
    truncated: lines.length > maximumSamples,
    counts,
    samples,
  };
};

export const parseWorkerEventLine = (line: string): WorkerEventLineResult => {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return { kind: "invalid" };
  }
  if (!value || typeof value !== "object") return { kind: "invalid" };
  const record = value as Record<string, unknown>;
  const actor =
    record.Actor && typeof record.Actor === "object"
      ? (record.Actor as Record<string, unknown>)
      : undefined;
  if (
    typeof record.Action !== "string" ||
    record.Action.length === 0 ||
    typeof record.time !== "number" ||
    !Number.isFinite(record.time) ||
    typeof record.timeNano !== "number" ||
    !Number.isFinite(record.timeNano) ||
    typeof actor?.ID !== "string" ||
    actor.ID.length === 0
  )
    return { kind: "invalid" };
  if (
    !forbiddenLifecycleActions.has(record.Action) &&
    record.Action !== "start"
  )
    return { kind: "ignored" };
  return {
    kind: "accepted",
    event: {
      action: record.Action,
      time: record.time,
      timeNano: record.timeNano,
      containerId: actor.ID,
    },
  };
};

export const collectWorkerEventEvidence = (
  output: string,
  maximumEvents = 100,
): WorkerContainerEventEvidence => {
  const events: WorkerContainerEvent[] = [];
  let invalidEventCount = 0;
  let ignoredEventCount = 0;
  for (const line of output
    .split(/\r?\n/)
    .filter((value) => value.trim().length > 0)) {
    const result = parseWorkerEventLine(line);
    if (result.kind === "accepted") events.push(result.event);
    else if (result.kind === "ignored") ignoredEventCount += 1;
    else invalidEventCount += 1;
  }
  return {
    events: events.slice(-maximumEvents),
    invalidEventCount,
    ignoredEventCount,
  };
};
