# Authentication choice
Status: Accepted

## Context
The initial self-hosted UI needs secure browser authentication with a direct CSRF story and server-side revocation.
## Decision
Use Argon2id password hashes and an opaque server-side session cookie. Cookie is HttpOnly, SameSite=Lax and Secure when configured. Authenticated unsafe requests carry a server-issued CSRF token; login/install additionally require idempotency keys.
## Alternatives
Browser JWTs; a cookie without CSRF protection.
## Consequences
Sessions can be revoked by deleting their server record and credentials never enter event payloads.
## Migration
Migration adds the `sessions` table; password hashes are never returned by read APIs.
## Spec changes
None.
