export const PHASE_C_EVIDENCE_WAIVER_FLAG =
  "--diagnostic-waive-phase-c-failure-for-evidence-only";

export const isFormalAcceptanceEligible = ({
  mode,
  formal,
  evidenceWaiverRequested,
}: {
  mode: "formal" | "diagnostic";
  formal: boolean;
  evidenceWaiverRequested: boolean;
}): boolean => mode === "formal" && formal && !evidenceWaiverRequested;

type DestroyableSocket = {
  readonly destroyed: boolean;
  destroy: () => unknown;
};

type ClosableClient = {
  close: () => Promise<void>;
};

export type EvidenceContinuationCleanup = {
  rawSocketPresent: boolean;
  rawSocketDestroyCalled: boolean;
  rawSocketDestroyed: boolean;
  clientsAttempted: number;
  clientsClosed: number;
  failures: string[];
};

export const buildFailedPhaseCEvidence = ({
  originalError,
  cleanup,
}: {
  originalError: string;
  cleanup: EvidenceContinuationCleanup;
}) => ({
  status: "failed_incomplete_evidence_only" as const,
  acceptanceEligible: false as const,
  originalError,
  cleanup,
});

export const parsePhaseCEvidenceWaiver = (
  args: readonly string[],
  diagnostic: boolean,
): boolean => {
  const requested = args.includes(PHASE_C_EVIDENCE_WAIVER_FLAG);
  if (requested && !diagnostic)
    throw new Error("PHASE_C_EVIDENCE_WAIVER_REQUIRES_DIAGNOSTIC");
  return requested;
};

const errorText = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

export const cleanupAfterPhaseCFailure = async ({
  rawSocket,
  clients,
}: {
  rawSocket?: DestroyableSocket;
  clients: readonly ClosableClient[];
}): Promise<EvidenceContinuationCleanup> => {
  const failures: string[] = [];
  let rawSocketDestroyCalled = false;

  if (rawSocket && !rawSocket.destroyed) {
    try {
      rawSocketDestroyCalled = true;
      rawSocket.destroy();
    } catch (error) {
      failures.push(`raw-socket: ${errorText(error)}`);
    }
  }

  const settled = await Promise.allSettled(
    clients.map(async (client) => await client.close()),
  );
  settled.forEach((result, index) => {
    if (result.status === "rejected")
      failures.push(`client-${index}: ${errorText(result.reason)}`);
  });

  return {
    rawSocketPresent: rawSocket !== undefined,
    rawSocketDestroyCalled,
    rawSocketDestroyed: rawSocket?.destroyed ?? false,
    clientsAttempted: clients.length,
    clientsClosed: settled.filter((result) => result.status === "fulfilled")
      .length,
    failures,
  };
};

export const evaluateHarnessOutcome = ({
  allPhasesPassed,
  nonCapacity5xx,
  evidenceWaiverRequested,
  evidenceFailure,
}: {
  allPhasesPassed: boolean;
  nonCapacity5xx: number;
  evidenceWaiverRequested: boolean;
  evidenceFailure?: string;
}): { passed: boolean; exitCode: 0 | 1; failure?: string } => {
  const passed =
    allPhasesPassed && nonCapacity5xx === 0 && !evidenceWaiverRequested;
  return {
    passed,
    exitCode: passed ? 0 : 1,
    failure: evidenceWaiverRequested
      ? `DIAGNOSTIC_EVIDENCE_ONLY:${evidenceFailure ?? "waiver requested"}`
      : undefined,
  };
};
