import { describe, expect, it } from "vitest";
import { resolveSeedAdminCredentials } from "./seed.js";

describe("resolveSeedAdminCredentials", () => {
  it("rejects missing credentials", () => {
    expect(() => resolveSeedAdminCredentials({})).toThrow(
      "SEED_ADMIN_CREDENTIALS_REQUIRED",
    );
  });

  it("rejects a single credential", () => {
    expect(() =>
      resolveSeedAdminCredentials({ SEED_ADMIN_EMAIL: "admin@example.test" }),
    ).toThrow("SEED_ADMIN_CREDENTIALS_REQUIRED");
    expect(() =>
      resolveSeedAdminCredentials({
        SEED_ADMIN_PASSWORD: "strong-password-123",
      }),
    ).toThrow("SEED_ADMIN_CREDENTIALS_REQUIRED");
  });

  it("accepts explicit valid credentials", () => {
    expect(
      resolveSeedAdminCredentials({
        SEED_ADMIN_EMAIL: "admin@example.test",
        SEED_ADMIN_PASSWORD: "strong-password-123",
      }),
    ).toEqual({
      email: "admin@example.test",
      password: "strong-password-123",
    });
  });
});
