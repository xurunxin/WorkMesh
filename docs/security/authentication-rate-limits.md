# Authentication rate-limit operations

The limiter protects exactly six credential-verification operations:

| Operation                   | Dimensions beyond endpoint, socket peer, and client IP |
| --------------------------- | ------------------------------------------------------ |
| `installWorkspace`          | global bootstrap                                       |
| `login`                     | normalized email plus client IP                        |
| `exchangeAgentSessionToken` | exact Session plus client IP                           |
| `refreshAgentSessionToken`  | exact Session plus client IP                           |
| `inspectExactTargetHandoff` | exact Handoff plus client IP                           |
| `rejectHandoff`             | exact Handoff plus client IP                           |

All other routes are deliberately excluded. Redis loss therefore does not
disable health, information, ordinary human/Agent work, heartbeat, SSE, or
provider-webhook handling.

## Deployment

- Set `REDIS_URL`; do not share a Redis endpoint whose eviction policy can
  discard limiter state. The supplied Compose service uses `noeviction`.
- Keep `AUTH_RATE_LIMIT_HMAC_KEY` unset to derive an isolated key from
  `SESSION_SECRET`, or set a separate random value of at least 32 bytes.
- Leave `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS` empty for direct exposure. Behind
  a proxy, list only the actual proxy IPs/CIDRs. Replace the list when the proxy
  topology changes; never use `true`, a hop count, or a public network range.
- Keep connect/command deadlines below the upstream request timeout. Bounds are
  validated at startup and there is no production disable flag.
- Set `AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS` to the structured-log collection
  window. The default is 60 seconds and startup validation bounds it from one
  second to one hour.
- Preserve the Issue #12 master key and idempotency retention while clients may
  retry a response-lost authentication mutation.

### Recommended edge starting limits

Put a coarse limiter at the public reverse proxy or edge before requests reach
the API. These are conservative starting values, not universal production
defaults; load-test them and raise them for known NAT, automation, or recovery
traffic. Apply the counters to the client IP resolved by the edge's own trusted
proxy chain:

| Public authentication class | Routes | Requests per resolved client IP | Concurrent auth requests per resolved client IP |
| --------------------------- | ------ | ------------------------------- | ------------------------------------------------ |
| `install` | `POST /api/v1/auth/install` | 90/minute, burst 80 | 16 |
| `login` | `POST /api/v1/auth/login` | 120/minute, burst 80 | 16 |
| `agent_token` | Session token exchange and refresh, combined | 180/minute, burst 120 | 32 |
| `handoff_target` | Exact-target inspect and reject, combined | 180/minute, burst 120 | 32 |

The edge bursts deliberately exceed the default application client-IP burst of
40 and socket-peer burst of 60, while their sustained rates exceed the
application's one-token-per-two-seconds refill. The install edge burst also
exceeds the application's global install burst of 5. The edge is therefore a
connection and volumetric-abuse guard, not a second copy of WorkMesh's account
or target policy. With HTTP/2 or HTTP/3, enforce the concurrency column on
active authentication requests or streams rather than only counting transport
connections.

The processing order and trust boundary are:

1. The edge derives the client IP only from transport peers and proxy hops it
   explicitly trusts. It strips inbound `Forwarded`, `X-Forwarded-For`,
   `X-Real-IP`, and equivalent provider headers, then writes the one normalized
   forwarding header passed to WorkMesh. Never append an untrusted caller value.
2. The edge applies the coarse connection/request limits before proxying.
3. The API accepts forwarded addressing only when its immediate socket peer is
   in `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS`; otherwise it uses the socket peer.
4. The shared Redis limiter remains authoritative for endpoint, socket peer,
   client IP, normalized account, exact Session, exact Handoff, failure
   backoff, and cross-instance atomicity.

An edge rejection should use HTTP `429`, `Cache-Control: no-store`, a positive
whole-second `Retry-After`, and the generic response
`{"error":{"code":"AUTH_RATE_LIMITED","message":"Authentication request is temporarily rate limited","correlationId":"<edge-generated opaque id>"}}`.
Do not include an email, Session, Handoff, credential result, fingerprint, or
existence signal. Edge limits do not replace the Redis limiter, must not weaken
its fail-closed behavior on protected routes, and cannot enforce
account/session dimensions that are only known to the application.

## Monitoring and response

Each API process periodically emits one JSON record only when the interval has
non-zero counts:

```json
{"event":"auth.rate_limit.summary","intervalMs":60000,"counts":[{"endpointClass":"login","outcome":"allowed","count":42},{"endpointClass":"login","outcome":"limited","count":3}]}
```

The process atomically snapshots and resets the interval counters after the
record is written and flushes residual counts during graceful shutdown.
`endpointClass` is one of `install`, `login`, `agent_token`, or
`handoff_target`; `outcome` is one of `allowed`, `limited`, `unavailable`,
`credential_failure`, or `credential_success`. Thus each process emits at most
20 count cells per interval. Do not add email, IP, token, Session, Handoff, or
fingerprint fields or labels.

In the log backend, filter `event = "auth.rate_limit.summary"`, expand
`counts[]`, and sum `count` grouped only by `endpointClass` and `outcome`.
Page immediately when the five-minute sum for `outcome = "unavailable"` is
non-zero. Warn when
`limited / (allowed + limited)` exceeds 0.20 for 10 minutes for any endpoint
class; tune the threshold only from observed baseline traffic. Treat rising
`credential_failure / allowed` as abuse or client-credential drift.

`auth.rate_limit.cleanup_failed` is emitted at most once per operation per
minute when post-commit Redis cleanup fails. It contains only `endpointClass`
and `operationId`; the already committed status, response body, and Set-Cookie
are preserved. Sampled `auth.rate_limited` logs use the same bounded fields.
The repository does not currently provide an external metrics exporter; these
structured summaries are the operational sink.

During Redis outage, verify that an inventory route returns
`503 AUTH_RATE_LIMIT_UNAVAILABLE` with `Retry-After`, then verify `/health` and
an ordinary authenticated work route independently. Do not bypass the limiter
or switch to process-local counters. Restore Redis connectivity and confirm the
configured `noeviction` policy.

## Client behavior

On 429 or 503, retry the same logical attempt only after `Retry-After`, with the
same body, authorization context, and idempotency key. The Agent SDK waits a
valid explicit duration in full when it is within `maxRetryAfterMs` (60 seconds
by default); `maxDelayMs` applies only to exponential fallback. An invalid or
negative header uses that bounded exponential fallback. A valid duration above
the explicit limit, an exhausted `maxAttempts` budget, or an exhausted
`maxTotalRetryDelayMs` budget suppresses automatic retry and surfaces the
original structured server error plus retry metadata in `WorkMeshSdkError`.
Neither 429 nor 503 is a signal to refresh a Session token. Browser UI should
display the uniform server message without revealing whether an account or
target exists.
