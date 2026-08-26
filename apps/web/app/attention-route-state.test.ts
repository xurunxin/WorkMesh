import { describe, expect, it } from "vitest";
import {
  attentionHref,
  attentionListPath,
  readAttentionRoute,
} from "./attention-route-state";

describe("Attention Center route state", () => {
  it("round-trips filters, selection, and cursor without dropping unrelated Project context", () => {
    const href = attentionHref(
      "https://workmesh.test/?view=projects&project=project-1&surface=attention",
      {
        view: "history",
        kind: "approval",
        severity: "low",
        urgency: "soon",
        audience: "assigned_to_me",
        status: "verified",
        cursor: "signed-cursor",
        selectedId: "v1:approval:approval-id",
      },
    );
    expect(href).toContain("view=projects");
    expect(href).toContain("surface=attention");
    const route = readAttentionRoute(
      new URL(href, "https://workmesh.test").search,
    );
    expect(route).toMatchObject({
      view: "history",
      kind: "approval",
      severity: "low",
      status: "verified",
      cursor: "signed-cursor",
    });
  });

  it("builds a Project-scoped typed projection query and rejects unknown enum values", () => {
    const route = readAttentionRoute(
      "?attentionView=wat&attentionKind=urgent_text&attentionSeverity=critical",
    );
    expect(route).toEqual({
      view: "active",
      severity: "critical",
      kind: undefined,
      status: undefined,
      urgency: undefined,
      audience: undefined,
      requestedByActorId: undefined,
      responsibleHumanActorId: undefined,
      workItemId: undefined,
      sessionId: undefined,
      updatedAfter: undefined,
      updatedBefore: undefined,
      cursor: undefined,
      selectedId: undefined,
    });
    expect(
      attentionListPath(
        { view: "active", severity: "critical" },
        "11111111-1111-4111-8111-111111111111",
      ),
    ).toBe(
      "/api/v1/human-attention?view=active&limit=40&severity=critical&projectId=11111111-1111-4111-8111-111111111111",
    );
  });
});
