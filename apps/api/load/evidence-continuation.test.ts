import { describe, expect, it, vi } from "vitest";
import {
  buildFailedPhaseCEvidence,
  cleanupAfterPhaseCFailure,
  evaluateHarnessOutcome,
  isFormalAcceptanceEligible,
  parsePhaseCEvidenceWaiver,
  PHASE_C_EVIDENCE_WAIVER_FLAG,
} from "./evidence-continuation.js";

describe("Phase C evidence-only continuation", () => {
  it("marks ordinary diagnostic runs as ineligible for formal acceptance", () => {
    expect(
      isFormalAcceptanceEligible({
        mode: "diagnostic",
        formal: false,
        evidenceWaiverRequested: false,
      }),
    ).toBe(false);
  });

  it("marks a formal run without a waiver as acceptance eligible", () => {
    expect(
      isFormalAcceptanceEligible({
        mode: "formal",
        formal: true,
        evidenceWaiverRequested: false,
      }),
    ).toBe(true);
  });

  it("accepts the waiver only in diagnostic mode", () => {
    expect(
      parsePhaseCEvidenceWaiver([PHASE_C_EVIDENCE_WAIVER_FLAG], true),
    ).toBe(true);
    expect(parsePhaseCEvidenceWaiver([], false)).toBe(false);
    expect(() =>
      parsePhaseCEvidenceWaiver([PHASE_C_EVIDENCE_WAIVER_FLAG], false),
    ).toThrow("PHASE_C_EVIDENCE_WAIVER_REQUIRES_DIAGNOSTIC");
  });

  it("destroys the raw socket and attempts every client close", async () => {
    const rawSocket = {
      destroyed: false,
      destroy: vi.fn(function (this: { destroyed: boolean }) {
        this.destroyed = true;
      }),
    };
    const clients = [
      { close: vi.fn(async () => undefined) },
      {
        close: vi.fn(async () => {
          throw new Error("injected close failure");
        }),
      },
      { close: vi.fn(async () => undefined) },
    ];

    const cleanup = await cleanupAfterPhaseCFailure({ rawSocket, clients });

    expect(rawSocket.destroy).toHaveBeenCalledOnce();
    expect(
      clients.every((client) => client.close.mock.calls.length === 1),
    ).toBe(true);
    expect(cleanup).toMatchObject({
      rawSocketPresent: true,
      rawSocketDestroyCalled: true,
      rawSocketDestroyed: true,
      clientsAttempted: 3,
      clientsClosed: 2,
    });
    expect(cleanup.failures).toEqual([
      "client-1: Error: injected close failure",
    ]);
  });

  it("keeps an evidence-only report failed with a nonzero exit", () => {
    expect(
      evaluateHarnessOutcome({
        allPhasesPassed: true,
        nonCapacity5xx: 0,
        evidenceWaiverRequested: true,
        evidenceFailure: "Error: Phase C incomplete",
      }),
    ).toEqual({
      passed: false,
      exitCode: 1,
      failure: "DIAGNOSTIC_EVIDENCE_ONLY:Error: Phase C incomplete",
    });
    expect(
      evaluateHarnessOutcome({
        allPhasesPassed: true,
        nonCapacity5xx: 0,
        evidenceWaiverRequested: false,
      }),
    ).toEqual({ passed: true, exitCode: 0, failure: undefined });
  });

  it("marks the continued Phase C evidence as failed and incomplete", () => {
    const cleanup = {
      rawSocketPresent: true,
      rawSocketDestroyCalled: true,
      rawSocketDestroyed: true,
      clientsAttempted: 1000,
      clientsClosed: 1000,
      failures: [],
    };
    expect(
      buildFailedPhaseCEvidence({
        originalError: "Error: backpressure close timed out",
        cleanup,
      }),
    ).toEqual({
      status: "failed_incomplete_evidence_only",
      acceptanceEligible: false,
      originalError: "Error: backpressure close timed out",
      cleanup,
    });
  });
});
