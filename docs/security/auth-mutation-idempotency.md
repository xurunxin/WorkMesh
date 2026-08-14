# Authentication mutation idempotency inventory

This inventory distinguishes ordinary command replay from responses that contain
cookies, CSRF values, one-time exchange codes, or bearer tokens. The executable
source of truth is `secretReplayOperationIds` in
`packages/contracts/src/route-policy.ts`.

| Operation | Subject before HMAC | Secret response | Adapter |
| --- | --- | --- | --- |
| `installWorkspace` | irreversible binding of the verified bootstrap credential | session cookie and CSRF token | encrypted auth replay |
| `login` | normalized lowercase login email | session cookie and CSRF token | encrypted auth replay |
| `logout` | authenticated human session ID | clear-cookie directive | encrypted auth replay |
| `registerAgent` | authenticated human session ID | Agent installation token | encrypted auth replay |
| `rotateAgentWebhookSecret` | authenticated human session ID | webhook signing secret | encrypted auth replay |
| `createAgentSession` | authenticated human session ID | Agent exchange token | encrypted auth replay |
| `delegateAndStartAgentSession` | authenticated human session ID | Agent exchange token | encrypted auth replay |
| `exchangeAgentSessionToken` | installation actor and exact Agent session | Agent session bearer token | encrypted auth replay |
| `refreshAgentSessionToken` | installation actor and exact Agent session | rotated Agent session bearer token | encrypted auth replay |

The subject strings in this table exist only in process memory. The database
stores `subject_fingerprint`, never the email, subject ID tuple, password,
bootstrap value, session cookie, installation token, exchange token, refresh
input, or issued bearer token.

## Retry matrix

| Retry | Result |
| --- | --- |
| Exact operation/request/context within 15 minutes | Replay the same encrypted response |
| Same key and subject, different operation/request/context before 24 hours | `409 IDEMPOTENCY_KEY_REUSED` |
| Exact retry after 15 minutes but before 24 hours | Encrypted envelope has been wiped; `409 IDEMPOTENCY_REPLAY_EXPIRED`; use a new key |
| Replay key mismatch, missing key metadata, or GCM/AAD tamper | `409 IDEMPOTENCY_REPLAY_UNAVAILABLE`; no re-execution |
| Retry at or after 24 hours | Record may be reclaimed as a new logical attempt |
| Credential or authority failure before subject normalization | Normal authorization error; no replay claim |

Clients must retain the same `Idempotency-Key` after network failure or an
eligible 429/5xx retry. They must not retry 401, 403, or 409 automatically.

## Intentional webhook boundary

`retryAgentSession` creates a new exchange code but does not return it in its API
response, so its ordinary replay body contains no credential. The code is sent
only in the target Agent webhook delivery payload, the intentional one-time
transport boundary. The webhook worker must continue to redact request payloads
and credentials from logs. This exception is not permission to put exchange
codes into `api_idempotency_keys`, domain events, outbox payloads, activities, or
API logs.

## Operational checks

- Keep `SESSION_SECRET` stable for at least the 24-hour conflict horizon.
- Keep the replay master key available while records are retained; key mismatch
  fails closed.
- Cleanup first wipes response status, replay key metadata, IV, tag, and
  ciphertext for completed rows whose `replay_expires_at <= now()`, while
  retaining the fingerprint conflict fence. A second bounded, indexed,
  skip-locked batch deletes rows only when `conflict_expires_at <= now()`.
- Incident queries should inspect state/timestamps and fingerprints only. Never
  decrypt replay envelopes for routine diagnostics.
