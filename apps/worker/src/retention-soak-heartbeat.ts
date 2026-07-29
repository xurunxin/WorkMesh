export type RetentionSoakHeartbeatResult = Readonly<{
  acceptedAt: string;
  latencyMs: number;
}>;

export type RetentionSoakHeartbeatMetrics = Readonly<{
  healthy: boolean;
  successfulHeartbeats: number;
  initialServerAcceptedAt: string;
  firstPumpAcceptedAt: string | null;
  lastPumpAcceptedAt: string | null;
  maximumObservedGapMs: number;
  maximumLatencyMs: number;
  lastLatencyMs: number;
  failureCode: string | null;
}>;

type Sleep = (delayMs: number, signal: AbortSignal) => Promise<void>;

const defaultSleep: Sleep = async (delayMs, signal) =>
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("RETENTION_SOAK_HEARTBEAT_PUMP_STOPPED"));
      },
      { once: true },
    );
  });

export class RetentionSoakHeartbeatPump {
  readonly #sendHeartbeat: () => Promise<RetentionSoakHeartbeatResult>;
  readonly #intervalMs: number;
  readonly #maximumGapMs: number;
  readonly #sleep: Sleep;
  readonly #now: () => number;
  readonly #controller = new AbortController();
  #lastAcceptedAtMs: number;
  #initialServerAcceptedAt: string;
  #firstPumpAcceptedAt: string | null = null;
  #lastPumpAcceptedAt: string | null = null;
  #maximumObservedGapMs = 0;
  #maximumLatencyMs = 0;
  #lastLatencyMs = 0;
  #successfulHeartbeats = 0;
  #failureCode: string | null = null;
  #loop: Promise<void> | undefined;
  #started = false;
  #stopping = false;

  constructor(
    options: Readonly<{
      initialServerAcceptedAt: string;
      intervalMs: number;
      maximumGapMs: number;
      sendHeartbeat: () => Promise<RetentionSoakHeartbeatResult>;
      sleep?: Sleep;
      now?: () => number;
    }>,
  ) {
    const initialAcceptedAtMs = Date.parse(options.initialServerAcceptedAt);
    if (
      !Number.isFinite(initialAcceptedAtMs) ||
      !Number.isFinite(options.intervalMs) ||
      options.intervalMs <= 0 ||
      !Number.isFinite(options.maximumGapMs) ||
      options.maximumGapMs <= options.intervalMs
    )
      throw new Error("RETENTION_SOAK_HEARTBEAT_PUMP_CONFIG_INVALID");
    this.#initialServerAcceptedAt = new Date(initialAcceptedAtMs).toISOString();
    this.#lastAcceptedAtMs = initialAcceptedAtMs;
    this.#intervalMs = options.intervalMs;
    this.#maximumGapMs = options.maximumGapMs;
    this.#sendHeartbeat = options.sendHeartbeat;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#now = options.now ?? Date.now;
  }

  async start(): Promise<void> {
    if (this.#started)
      throw new Error("RETENTION_SOAK_HEARTBEAT_PUMP_ALREADY_STARTED");
    this.#started = true;
    try {
      await this.#beat();
    } catch {
      this.#failureCode = "RETENTION_SOAK_HEARTBEAT_PUMP_FAILED";
      throw new Error(this.#failureCode);
    }
    this.#loop = this.#run();
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#controller.abort();
    await this.#loop;
  }

  assertHealthy(): void {
    if (!this.#started || this.#failureCode)
      throw new Error(
        this.#failureCode ?? "RETENTION_SOAK_HEARTBEAT_PUMP_NOT_STARTED",
      );
  }

  metrics(): RetentionSoakHeartbeatMetrics {
    return {
      healthy: this.#started && this.#failureCode === null,
      successfulHeartbeats: this.#successfulHeartbeats,
      initialServerAcceptedAt: this.#initialServerAcceptedAt,
      firstPumpAcceptedAt: this.#firstPumpAcceptedAt,
      lastPumpAcceptedAt: this.#lastPumpAcceptedAt,
      maximumObservedGapMs: this.#maximumObservedGapMs,
      maximumLatencyMs: this.#maximumLatencyMs,
      lastLatencyMs: this.#lastLatencyMs,
      failureCode: this.#failureCode,
    };
  }

  async #run(): Promise<void> {
    try {
      while (!this.#stopping) {
        await this.#sleep(this.#intervalMs, this.#controller.signal);
        if (!this.#stopping) await this.#beat();
      }
    } catch {
      if (!this.#stopping)
        this.#failureCode = "RETENTION_SOAK_HEARTBEAT_PUMP_FAILED";
    }
  }

  async #beat(): Promise<void> {
    if (this.#now() - this.#lastAcceptedAtMs > this.#maximumGapMs)
      throw new Error("RETENTION_SOAK_HEARTBEAT_DEADLINE_MISSED");
    const heartbeat = await this.#sendHeartbeat();
    const acceptedAtMs = Date.parse(heartbeat.acceptedAt);
    const gapMs = acceptedAtMs - this.#lastAcceptedAtMs;
    if (
      !Number.isFinite(acceptedAtMs) ||
      !Number.isFinite(heartbeat.latencyMs) ||
      heartbeat.latencyMs < 0 ||
      gapMs < 0 ||
      gapMs > this.#maximumGapMs
    )
      throw new Error("RETENTION_SOAK_HEARTBEAT_OBSERVATION_INVALID");
    const normalized = new Date(acceptedAtMs).toISOString();
    this.#firstPumpAcceptedAt ??= normalized;
    this.#lastPumpAcceptedAt = normalized;
    this.#lastAcceptedAtMs = acceptedAtMs;
    this.#maximumObservedGapMs = Math.max(this.#maximumObservedGapMs, gapMs);
    this.#maximumLatencyMs = Math.max(
      this.#maximumLatencyMs,
      heartbeat.latencyMs,
    );
    this.#lastLatencyMs = heartbeat.latencyMs;
    this.#successfulHeartbeats += 1;
  }
}
