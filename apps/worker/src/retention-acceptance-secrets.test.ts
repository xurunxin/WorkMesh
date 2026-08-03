import { describe, expect, it } from "vitest";
import {
  randomAcceptanceMasterKey,
  randomAcceptanceSecret,
} from "../../../scripts/retention-acceptance-secrets.mjs";

describe("retention acceptance secrets", () => {
  it("generates runtime-compatible secret encodings", () => {
    expect(randomAcceptanceSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomAcceptanceMasterKey()).toMatch(/^[0-9a-f]{64}$/);
  });
});
