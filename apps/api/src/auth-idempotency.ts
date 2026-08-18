import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withTx } from "@workmesh/db";
import { DomainError } from "@workmesh/domain";

export const AUTH_REPLAY_WINDOW_MS = 15 * 60 * 1_000;
export const AUTH_CONFLICT_RETENTION_MS = 24 * 60 * 60 * 1_000;
const replayKeyId = "workmesh-auth-idempotency-v1";

export type AuthReplayEnvelope<T> = {
  status: number;
  body: T;
  cookie?:
    | { action: "set"; value: string; csrfToken: string }
    | { action: "clear" };
};

type AuthIdempotencyInput = {
  idempotencyKey: string;
  subject: string;
  operation: string;
  request: unknown;
  clientContext: unknown;
};

type AuthIdempotencyRow = {
  id: string;
  operation: string;
  request_fingerprint: string;
  client_context_fingerprint: string;
  subject_fingerprint: string;
  state: "claimed" | "completed";
  response_status: number | null;
  replay_key_id: string | null;
  replay_key_fingerprint: string | null;
  replay_iv: Buffer | null;
  replay_tag: Buffer | null;
  replay_ciphertext: Buffer | null;
  replay_expires_at: Date;
  conflict_expires_at: Date;
  replay_wiped_at: Date | null;
};

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  return value instanceof Date ? value.toISOString() : value;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(stable(value));

const masterKey = (): Buffer => {
  const raw = process.env.WORKMESH_MASTER_KEY;
  if (!raw)
    throw new DomainError(
      "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      "Authentication replay key is unavailable",
    );
  const decoded = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (decoded.length !== 32)
    throw new DomainError(
      "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      "Authentication replay key is invalid",
    );
  return decoded;
};

const replaySubkey = (purpose: string): Buffer =>
  crypto
    .createHmac("sha256", masterKey())
    .update(`workmesh:auth-idempotency:${purpose}:v1`)
    .digest();

const fingerprintRoot = (): Buffer => {
  const raw = process.env.SESSION_SECRET;
  if (!raw || Buffer.byteLength(raw, "utf8") < 32)
    throw new DomainError(
      "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      "Authentication fingerprint key is unavailable",
    );
  return crypto
    .createHmac("sha256", raw)
    .update("workmesh:auth-idempotency:fingerprint-root:v1")
    .digest();
};

const keyedFingerprint = (purpose: string, value: unknown): string =>
  crypto
    .createHmac("sha256", fingerprintRoot())
    .update(`${purpose}\u0000`)
    .update(canonicalJson(value))
    .digest("hex");

const replayKey = (): Buffer => replaySubkey("replay-envelope");
const replayKeyFingerprint = (): string =>
  crypto.createHash("sha256").update(replayKey()).digest("hex");

export const replayKeyFingerprintMatches = (stored: string | null): boolean => {
  if (!stored || !/^[0-9a-f]{64}$/i.test(stored)) return false;
  const expected = replayKeyFingerprint();
  const storedBytes = Buffer.from(stored, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    storedBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(storedBytes, expectedBytes)
  );
};

const aad = (row: Pick<AuthIdempotencyRow, "id" | "operation" | "subject_fingerprint" | "request_fingerprint">): Buffer =>
  Buffer.from(
    canonicalJson({
      id: row.id,
      operation: row.operation,
      subjectFingerprint: row.subject_fingerprint,
      requestFingerprint: row.request_fingerprint,
    }),
    "utf8",
  );

const encryptReplay = <T>(
  row: Pick<AuthIdempotencyRow, "id" | "operation" | "subject_fingerprint" | "request_fingerprint">,
  envelope: AuthReplayEnvelope<T>,
) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", replayKey(), iv);
  cipher.setAAD(aad(row));
  const ciphertext = Buffer.concat([
    cipher.update(canonicalJson(envelope), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext,
    iv,
    tag: cipher.getAuthTag(),
    keyFingerprint: replayKeyFingerprint(),
  };
};

const decryptReplay = <T>(row: AuthIdempotencyRow): AuthReplayEnvelope<T> => {
  if (
    row.replay_key_id !== replayKeyId ||
    !replayKeyFingerprintMatches(row.replay_key_fingerprint) ||
    !row.replay_iv ||
    !row.replay_tag ||
    !row.replay_ciphertext
  )
    throw new DomainError(
      "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      "The original authentication response cannot be safely replayed",
    );
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      replayKey(),
      row.replay_iv,
    );
    decipher.setAAD(aad(row));
    decipher.setAuthTag(row.replay_tag);
    const plaintext = Buffer.concat([
      decipher.update(row.replay_ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as AuthReplayEnvelope<T>;
  } catch {
    throw new DomainError(
      "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      "The original authentication response cannot be safely replayed",
    );
  }
};

const loadLocked = async (
  tx: PoolClient,
  keyFingerprint: string,
  subjectFingerprint: string,
): Promise<AuthIdempotencyRow> => {
  const row = (
    await tx.query<AuthIdempotencyRow>(
      `SELECT id,operation,request_fingerprint,client_context_fingerprint,
              subject_fingerprint,state,response_status,replay_key_id,
               replay_key_fingerprint,replay_iv,replay_tag,replay_ciphertext,
               replay_expires_at,conflict_expires_at,replay_wiped_at
         FROM auth_idempotency_records
        WHERE key_fingerprint=$1 AND subject_fingerprint=$2
        FOR UPDATE`,
      [keyFingerprint, subjectFingerprint],
    )
  ).rows[0];
  if (!row)
    throw new DomainError(
      "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      "Authentication idempotency claim is unavailable",
    );
  return row;
};

export async function authIdempotentTransaction<T>(
  db: Pool,
  input: AuthIdempotencyInput,
  handler: (tx: PoolClient) => Promise<AuthReplayEnvelope<T>>,
): Promise<AuthReplayEnvelope<T>> {
  const keyFingerprint = keyedFingerprint("key", input.idempotencyKey);
  const subjectFingerprint = keyedFingerprint("subject", input.subject);
  const requestFingerprint = keyedFingerprint("request", input.request);
  const clientContextFingerprint = keyedFingerprint(
    "client-context",
    input.clientContext,
  );

  return withTx(db, async (tx) => {
    // Bind an Idempotency-Key to one authentication subject for the whole
    // conflict window. The table's composite uniqueness protects exact
    // retries; this transaction-scoped advisory lock also closes the race
    // where two different subjects try to claim the same key concurrently.
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [keyFingerprint],
    );
    const conflictingSubject = (
      await tx.query<{ present: number }>(
        `SELECT 1 AS present
           FROM auth_idempotency_records
          WHERE key_fingerprint=$1
            AND subject_fingerprint<>$2
            AND conflict_expires_at>now()
          LIMIT 1`,
        [keyFingerprint, subjectFingerprint],
      )
    ).rows[0];
    if (conflictingSubject)
      throw new DomainError(
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key was already used for a different authentication subject",
      );

    let claimed = (
      await tx.query<Pick<AuthIdempotencyRow, "id">>(
        `INSERT INTO auth_idempotency_records(
           key_fingerprint,subject_fingerprint,operation,request_fingerprint,
           client_context_fingerprint,replay_expires_at,conflict_expires_at
         ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',now()+interval '24 hours')
         ON CONFLICT(key_fingerprint,subject_fingerprint) DO NOTHING
         RETURNING id`,
        [
          keyFingerprint,
          subjectFingerprint,
          input.operation,
          requestFingerprint,
          clientContextFingerprint,
        ],
      )
    ).rows[0];

    if (!claimed) {
      const previous = await loadLocked(tx, keyFingerprint, subjectFingerprint);
      if (previous.conflict_expires_at.getTime() <= Date.now()) {
        await tx.query("DELETE FROM auth_idempotency_records WHERE id=$1", [
          previous.id,
        ]);
        claimed = (
          await tx.query<Pick<AuthIdempotencyRow, "id">>(
            `INSERT INTO auth_idempotency_records(
               key_fingerprint,subject_fingerprint,operation,request_fingerprint,
               client_context_fingerprint,replay_expires_at,conflict_expires_at
             ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',now()+interval '24 hours')
             RETURNING id`,
            [
              keyFingerprint,
              subjectFingerprint,
              input.operation,
              requestFingerprint,
              clientContextFingerprint,
            ],
          )
        ).rows[0];
      } else {
        if (
          previous.operation !== input.operation ||
          previous.request_fingerprint !== requestFingerprint ||
          previous.client_context_fingerprint !== clientContextFingerprint
        )
          throw new DomainError(
            "IDEMPOTENCY_KEY_REUSED",
            "Idempotency-Key was already used for a different authentication request",
          );
        if (previous.replay_expires_at.getTime() <= Date.now())
          throw new DomainError(
            "IDEMPOTENCY_REPLAY_EXPIRED",
            "The authentication response replay window has expired; use a new Idempotency-Key",
          );
        if (previous.state !== "completed")
          throw new DomainError(
            "IDEMPOTENCY_REPLAY_UNAVAILABLE",
            "The original authentication response is unavailable",
          );
        return decryptReplay<T>(previous);
      }
    }

    if (!claimed)
      throw new DomainError(
        "IDEMPOTENCY_REPLAY_UNAVAILABLE",
        "Authentication idempotency claim could not be established",
      );
    const identity = {
      id: claimed.id,
      operation: input.operation,
      subject_fingerprint: subjectFingerprint,
      request_fingerprint: requestFingerprint,
    };
    // Return the same canonical object shape used for encrypted storage so a
    // lost-response replay is byte-identical after Fastify serialization.
    const response = JSON.parse(canonicalJson(await handler(tx))) as AuthReplayEnvelope<T>;
    const encrypted = encryptReplay(identity, response);
    await tx.query(
      `UPDATE auth_idempotency_records
          SET state='completed',response_status=$2,replay_key_id=$3,
              replay_key_fingerprint=$4,replay_iv=$5,replay_tag=$6,
              replay_ciphertext=$7,completed_at=now()
        WHERE id=$1`,
      [
        claimed.id,
        response.status,
        replayKeyId,
        encrypted.keyFingerprint,
        encrypted.iv,
        encrypted.tag,
        encrypted.ciphertext,
      ],
    );
    return response;
  });
}

export const authClientContext = (request: {
  headers: Record<string, unknown>;
}): Record<string, string | null> => ({
  origin:
    typeof request.headers.origin === "string" ? request.headers.origin : null,
  userAgent:
    typeof request.headers["user-agent"] === "string"
      ? request.headers["user-agent"]
      : null,
});
