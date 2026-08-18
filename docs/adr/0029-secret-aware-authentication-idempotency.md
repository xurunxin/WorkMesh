# Secret-aware authentication idempotency

Status

Accepted.

Context

Authentication and Agent-session bootstrap mutations issue cookies, CSRF values,
one-time exchange codes, or bearer tokens. The generic
`api_idempotency_keys.response_body` JSON replay mechanism is appropriate for
ordinary commands but would persist those credentials in plaintext. Installation
also previously committed the Workspace before creating its initial human
session, leaving a two-transaction response-loss gap.

Decision

Use `auth_idempotency_records` for every mutation marked
`secretReplay: encrypted_auth` in the declarative route policy.

- PostgreSQL owns the claim, business mutation, credential issue, event/outbox
  inserts, and encrypted replay completion in one transaction.
- The record stores only keyed HMAC fingerprints for the idempotency key,
  normalized subject, canonical request, and non-secret client context.
- The normalized subject is never stored. Login uses normalized lowercase email;
  logout uses the authenticated human-session identity; Agent exchange/refresh
  uses the installation actor plus exact Agent session; install uses the
  singleton bootstrap context.
- The replay envelope uses AES-256-GCM under a
  `WORKMESH_MASTER_KEY`-derived subkey. AAD binds record ID, operation,
  subject fingerprint, and request fingerprint. Key ID, key fingerprint, IV,
  tag, and ciphertext are stored; cookie and token plaintext are not.
- Exact retries replay for 15 minutes. At expiry the worker cryptographically
  erases response status, key metadata, IV, tag, and ciphertext while retaining
  fingerprints and the conflict fence. Later retries return
  `IDEMPOTENCY_REPLAY_EXPIRED` and do not execute again. The key conflict remains
  protected for 24 hours, after which the record can be reclaimed or deleted.
- Operation, canonical request, or client-context mismatch returns
  `IDEMPOTENCY_KEY_REUSED`. Decryption, key mismatch, or tampering returns
  `IDEMPOTENCY_REPLAY_UNAVAILABLE`; none of these cases re-executes the command.
- An Idempotency-Key is bound to exactly one normalized authentication subject
  during the 24-hour conflict window. A PostgreSQL transaction advisory lock on
  its keyed fingerprint serializes cross-subject claims across API replicas;
  reusing the key for a different subject returns `IDEMPOTENCY_KEY_REUSED`
  instead of creating a second composite-key record.
- Installation password policy/hash work and login credential validation may
  precede the claim. The successful install/session mutation and login/session
  mutation remain transactionally coupled to replay completion.
- A revoked logout session may be resolved only for an exact logout replay.
  A new key cannot create a second successful logout.

Alternatives

- Plain JSON replay was rejected because it exposes bearer-equivalent material.
- Storing only response hashes was rejected because response loss would force a
  second credential issue.
- In-memory locks/caches were rejected because they are not restart-safe and do
  not make claim and mutation atomic.
- Reusing ciphertext without AAD or key metadata was rejected because record
  substitution and key mismatch would not fail closed.

Consequences

`sessions` gains `revoked_at` so logout can distinguish ordinary authentication
from an exact response-loss replay. The worker performs bounded indexed replay
wipes at 15 minutes and bounded indexed record deletion after conflict retention
expires. Deployments must retain
`SESSION_SECRET` for keyed identity matching and `WORKMESH_MASTER_KEY` for replay
decryption throughout the 24-hour protection horizon. Rotating the master key
without a compatibility window intentionally makes retained replay records fail
closed.

Migration

Migration `0023_auth_idempotency_records.sql` adds the dedicated table, expiry
index, and `sessions.revoked_at`. Existing generic idempotency rows are not
copied because plaintext secret responses must not be propagated. Deploy the
migration before the API/worker version.

Spec changes

OpenAPI documents the 15-minute replay and 24-hour conflict windows, the three
409 idempotency diagnostics, and the `x-workmesh-secret-replay` route marker.
The route-policy contract is the executable inventory.
