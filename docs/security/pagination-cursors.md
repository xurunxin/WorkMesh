# Pagination cursor secrets

Production API startup requires `PAGINATION_CURSOR_KEYS` and `PAGINATION_CURSOR_ACTIVE_KID`. The ring uses comma-separated `kid:canonical-base64url` entries. Each decoded key must contain 32 to 256 independently generated random bytes. Startup rejects malformed, placeholder, repeated, low-diversity, duplicate, or reused secret material.

Do not use `SESSION_SECRET`, `WORKMESH_MASTER_KEY`, `WORKMESH_BOOTSTRAP_TOKEN`, `AUTH_RATE_LIMIT_HMAC_KEY`, `POSTGRES_PASSWORD`, `S3_SECRET_ACCESS_KEY`, or `WORKMESH_MCP_ACCESS_TOKEN` as cursor keys. Cursor payloads contain scope hashes and keyset values; they are signed but not encrypted, so APIs must never put secrets or raw authorization context into filter bindings.

Rotation procedure:

1. Generate a new random key and add it to the verification ring.
2. Set its new key ID as `PAGINATION_CURSOR_ACTIVE_KID` and deploy all API replicas together.
3. Keep the previous key for at least `PAGINATION_CURSOR_TTL_SECONDS` plus deployment clock skew.
4. Remove the retired key only after no valid cursor can reference it.

Malformed, expired, unknown-key, and signature failures return the same `PAGINATION_CURSOR_INVALID` response. Correctly signed cursors used with a different route, workspace, actor, filter, view revision, or sort return `PAGINATION_CURSOR_MISMATCH`. Neither response identifies the failed field.
