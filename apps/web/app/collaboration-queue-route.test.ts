import { describe, expect, it } from "vitest";
import { collaborationQueueHref, readCollaborationQueueRoute } from "./collaboration-queue-route";

describe("collaboration queue route", () => {
  it("restores queue filters and selection without dropping unrelated context", () => {
    const route = readCollaborationQueueRoute("?view=inbox&queue=messages&inboxStatus=resolved&inboxKind=mention&inboxResponse=informational&inboxItem=item-1");
    expect(route).toEqual({ queue: "messages", status: "resolved", kind: "mention", response: "informational", selectedId: "item-1" });
    expect(collaborationQueueHref("https://wm.test/?view=inbox&project=p1#thread", route)).toBe("/?view=inbox&project=p1&queue=messages&inboxStatus=resolved&inboxKind=mention&inboxResponse=informational&inboxItem=item-1#thread");
  });

  it("normalizes unsupported values to the actionable queue", () => {
    expect(readCollaborationQueueRoute("?queue=raw&inboxKind=unknown")).toEqual({ queue: "needs-you", status: "open" });
  });
});
