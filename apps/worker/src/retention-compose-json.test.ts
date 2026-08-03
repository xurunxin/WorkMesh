import { describe, expect, it } from "vitest";
import { parseComposeRows } from "../../../scripts/retention-compose-json.mjs";

const api = {
  ID: "api-id",
  Project: "acceptance",
  Service: "api",
  State: "running",
  Health: "healthy",
};
const worker = {
  ID: "worker-id",
  Project: "acceptance",
  Service: "worker",
  State: "running",
  Health: "healthy",
};

describe("retention Compose JSON parser", () => {
  it("accepts array, single-object, and JSON-lines output", () => {
    expect(parseComposeRows(JSON.stringify([api, worker]))).toEqual([
      api,
      worker,
    ]);
    expect(parseComposeRows(JSON.stringify(api))).toEqual([api]);
    expect(
      parseComposeRows(`${JSON.stringify(api)}\n${JSON.stringify(worker)}\n`),
    ).toEqual([api, worker]);
  });

  it("fails closed on malformed output", () => {
    expect(() => parseComposeRows("{not-json")).toThrow(
      "RETENTION_ACCEPTANCE_COMPOSE_JSON_INVALID",
    );
  });
});
