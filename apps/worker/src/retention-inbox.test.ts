import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ordinaryPrunableEventTypes } from "./retention.js";

const protectedEventTypes = [
  "room.message.posted",
  "room.message.human_visibility_recorded",
  "room.message.resolved",
  "inbox.item.created",
  "inbox.item.claimed",
  "inbox.item.acknowledged",
  "inbox.item.replied",
];

const protectedFactTables = [
  "room_messages",
  "room_message_recipients",
  "room_message_session_recipients",
  "room_message_response_resolutions",
  "inbox_items",
  "inbox_item_receipts",
];

describe("Agent Inbox retention boundaries", () => {
  it("keeps message, recipient, receipt, and resolution events outside ordinary pruning", () => {
    for (const eventType of protectedEventTypes) {
      expect(ordinaryPrunableEventTypes.has(eventType), eventType).toBe(false);
    }
  });

  it("does not delete durable Inbox audit facts during generic cleanup", async () => {
    const source = await readFile(new URL("./retention.ts", import.meta.url), "utf8");
    for (const table of protectedFactTables) {
      expect(source, table).not.toMatch(
        new RegExp(`DELETE\\s+FROM\\s+${table}\\b`, "i"),
      );
    }
  });
});
