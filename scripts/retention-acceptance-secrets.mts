import { randomBytes } from "node:crypto";

export const randomAcceptanceSecret = (): string =>
  randomBytes(32).toString("base64url");

export const randomAcceptanceMasterKey = (): string =>
  randomBytes(32).toString("hex");
