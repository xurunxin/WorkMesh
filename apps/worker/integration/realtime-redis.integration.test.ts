import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisStreamSink, type ClaimedEvent } from "../src/index.js";

const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
const streamKey = "workmesh:domain-events";
const suite = redisUrl ? describe : describe.skip;
const admin = redisUrl ? createClient({ url: redisUrl }) : undefined;

const event = (cursor: number): ClaimedEvent => ({
  id: `11111111-1111-4111-8111-${cursor.toString().padStart(12, "0")}`,
  eventId: `22222222-2222-4222-8222-${cursor.toString().padStart(12, "0")}`,
  cursor: String(cursor),
  workspaceId: "33333333-3333-4333-8333-333333333333",
  topic: "private.topic",
  scope: "private-scope",
  payload: { private: `payload-${cursor}` },
  attemptCount: 1,
});

suite("Redis realtime wake hint integration", () => {
  beforeAll(async () => {
    await admin!.connect();
    await admin!.del(streamKey);
  });

  afterAll(async () => {
    await admin!.del(streamKey);
    await admin!.quit();
  });

  it("approximately trims the lossy stream and retains only allowlisted fields", async () => {
    const sink = new RedisStreamSink({
      redisUrl: redisUrl!,
      maxLen: 100,
    });
    await sink.probe();
    for (let cursor = 1; cursor <= 1_000; cursor += 1)
      await sink.deliver(event(cursor));
    await sink.close();

    expect(await admin!.xLen(streamKey)).toBeLessThanOrEqual(200);
    const latest = await admin!.xRevRange(streamKey, "+", "-", { COUNT: 1 });
    expect(latest).toHaveLength(1);
    expect(latest[0]!.message).toEqual({
      cursor: "1000",
      workspaceId: "33333333-3333-4333-8333-333333333333",
    });
  }, 30_000);
});
