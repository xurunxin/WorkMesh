# Installation bootstrap

`POST /api/v1/auth/install` creates the first administrator and is never a
public mutation. Production requires a single deployment credential in
`X-WorkMesh-Bootstrap-Token`. The page at `/install` sends that header directly
and does not put the token in local storage, session storage, cookies, the URL,
or the JSON body.

## Generate and configure the credential

Generate 32 random bytes as canonical unpadded base64url:

```powershell
$bootstrapToken = pnpm --silent bootstrap:token
$bootstrapToken
```

Put the result in the deployment secret store as
`WORKMESH_BOOTSTRAP_TOKEN`. Do not reuse `SESSION_SECRET`,
`WORKMESH_MASTER_KEY`, database/object-storage credentials, or the MCP access
token. Do not commit it, pass it as an image build argument, include it in a
support bundle, or place it on a command line that is retained in shell
history.

The API fails before listening when production has no token, enables loopback
bypass, or supplies a malformed, placeholder, repeated, low-diversity, or
reused-secret value.

## Local source flow

The recommended local flow uses the same explicit credential as production:

```powershell
$env:WORKMESH_BOOTSTRAP_TOKEN = pnpm --silent bootstrap:token
$env:API_HOST = '127.0.0.1'
pnpm dev
```

Open `http://localhost:3000/install`, paste the token into the dedicated field,
and complete the form.

Tokenless local bootstrap is an explicit development exception:

```powershell
$env:NODE_ENV = 'development'
$env:API_HOST = '127.0.0.1'
$env:WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK = 'true'
Remove-Item Env:WORKMESH_BOOTSTRAP_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS -ErrorAction SilentlyContinue
pnpm dev
```

It works only for a literal loopback bind and loopback socket peer. Any
`Forwarded`, `X-Forwarded-*`, `X-Real-IP`, provider client-IP, or equivalent
client-address header rejects the bypass. Never use this mode through a
container port, tunnel, reverse proxy, or shared development host.

## Container flow

Set every required value in `.env`, including a unique generated bootstrap
token, then render and start the stack:

```powershell
$env:WORKMESH_BOOTSTRAP_TOKEN = pnpm --silent bootstrap:token
docker compose config
docker compose up --build -d
docker compose ps
```

Compose runs the API as `NODE_ENV=production`, binds it inside the container to
`0.0.0.0`, forbids loopback bypass, and refuses to render without an explicit
token. The host API and Web ports remain loopback-bound by default.

For a command-line install, keep the body and key files out of logs and use the
same files for an exact response-loss retry:

```powershell
$headers = @{
  'X-WorkMesh-Bootstrap-Token' = $env:WORKMESH_BOOTSTRAP_TOKEN
  'Idempotency-Key' = [guid]::NewGuid().ToString()
  'Content-Type' = 'application/json'
}
$body = @{
  name = 'WorkMesh'
  slug = 'workmesh'
  adminName = 'Operator'
  email = 'operator@example.com'
  password = '<unique password of at least 12 characters>'
} | ConvertTo-Json
Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:3001/api/v1/auth/install' -Headers $headers -Body $body -SessionVariable session
```

An exact retry within 15 minutes uses the same header token, idempotency key,
body, Origin, and User-Agent and returns the same encrypted session response
and cookie. Changing the body or client context returns
`IDEMPOTENCY_KEY_REUSED`; using a new key after success returns
`INSTALLATION_ALREADY_COMPLETED`.

Keep the same token available through the 15-minute response-loss window. After
that window, rotate it in the deployment secret store and restart the API if
operational policy requires credential rotation. The old token then fails
authentication, while the permanent `platform_installation` singleton still
closes installation. Production startup continues to require a safe configured
value.

## Reverse-proxy flow

The proxy must:

- terminate TLS and restrict request bodies and concurrent authentication
  requests;
- pass `X-WorkMesh-Bootstrap-Token` only to the installation route and never
  log it;
- strip caller-supplied forwarding/client-IP headers, then write one normalized
  forwarding chain;
- use an immediate peer listed exactly in
  `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS`;
- disable caching for installation responses and preserve every `Set-Cookie`
  header;
- return generic `429`/`503` responses without credential details.

Proxy addressing does not grant bootstrap authority. A remote request still
needs the exact token, and Redis admission runs before credential verification.
Do not enable loopback bypass behind a proxy.

## Verification and incident response

Expected checks after installation:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3001/api/v1/install-status'
docker compose logs api
```

The status should be `installed: true`. Audit records use only
`bootstrap.install_authorized` or `bootstrap.authentication_failed`,
`installWorkspace`, a bounded outcome, and for success `token` or `loopback`
mode. Logs, errors, events, traces, idempotency rows, and authorization denials
must not contain the bootstrap token. Invalid attempts may consume Redis
admission/backoff state but must not create PostgreSQL idempotency records or
authorization-denial rows.

During Redis outage installation returns `503 AUTH_RATE_LIMIT_UNAVAILABLE`.
Restore Redis; do not bypass the limiter or switch to a process-local counter.
If exposure is suspected before installation, rotate the token before retrying.
If installation already completed unexpectedly, isolate the deployment and
investigate the administrator, session, event, and outbox facts; do not delete
`platform_installation` to reopen bootstrap.
