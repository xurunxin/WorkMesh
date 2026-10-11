# 历次运行证据摘要

包含失败、提前停止与后续通过的尝试；文件名是本次隔离运行的原始日志标识。摘要保持实际输出，不将历史失败改写成通过。不完整尝试不能替代最终验收。原始全量日志在本次本地临时运行目录，不作为长期仓库资产；摘录、哈希和关键失败 PNG 纳入仓库。

## d0-capture-2.log

完整原始日志 SHA-256：`74b97eff92aa97a5dd934f9b72cf5529ed1d6ebab35ec0ca064d050fd7a65347`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: expect(locator).toBeVisible() failed
    Error: element(s) not found
  1 failed
  10 did not run
  3 passed (50.1s)
```

## d0-capture-3.log

完整原始日志 SHA-256：`9c1cd1ff72bc0d5cabaf9873d405bf1125764bbbdc5885a41c672e9cf81491fe`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: expect(locator).toBeVisible() failed
    Error: element(s) not found
  1 failed
  10 did not run
  3 passed (43.5s)
```

## d0-capture-4.log

完整原始日志 SHA-256：`645b39a030c69a022bfed06f316c6aac4f295950a146038c5580f7c2f091a1e0`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: 两个独立上下文的 PNG 必须逐字节一致
  1 failed
  11 did not run
  2 passed (26.6s)
```

## d0-capture-5.log

完整原始日志 SHA-256：`6a7fa76c5efd952eb1daaca04f82df3dfb01f0a708c96ca13193f03d5687858f`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: expect(locator).toBeVisible() failed
    Error: element(s) not found
  1 failed
  7 did not run
  6 passed (1.0m)
```

## d0-capture-6.log

完整原始日志 SHA-256：`daccc81801ac079848f713d0554badde15b4ccfcf3cf5aad916f011aaedb669d`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: expect(locator).toBeVisible() failed
    Error: element(s) not found
  1 failed
  7 did not run
  6 passed (55.3s)
```

## d0-capture-final.log

完整原始日志 SHA-256：`d66c6c194c27fa999d724b2072d091605783c14b2a75131d45ec1ebbadaae37f`。

```text
  14 passed (1.3m)
```

## d0-e2e-configured.log

完整原始日志 SHA-256：`e32198351125c558b4726e5348b2b3400909e88b05d3fc76db14ca9ea34c79b7`。

```text
 Tasks:    12 successful, 12 total
```

## d0-e2e.log

完整原始日志 SHA-256：`33c01c35ceeec884377eb1b1fdd06dfa2d4f219506babd21fc3792941dfe8464`。

```text
 Tasks:    5 successful, 10 total
Failed:    @workmesh/web#test:e2e
```

## d0-integration-ci.log

完整原始日志 SHA-256：`02f15d4da092b60d2581f06634708924be777d30ac1dd98712ca227204a58f53`。

```text
      Tests  77 passed (77)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > runs branch, commit, PR, check, independent review, exact-head approval, merge, and suggestion
AssertionError: {"error":{"code":"INTERNAL_ERROR","message":"Unexpected server error","correlationId":"caec2855-339c-485e-9da9-cfb1511c3d45"}}: expected 500 to be 200 // Object.is equality
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > supports a Human-owned upload lifecycle with attribution, listing, download, and cancellation
Error: S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required
      Tests  2 failed | 152 passed | 1 skipped (155)
```

## d0-integration-configured.log

完整原始日志 SHA-256：`9da267eb2ce88770ee318ac6a687155a95d123a0d042bba7ed7c393e4876718c`。

```text
      Tests  77 passed (77)
 FAIL  integration/agent-lock-order.integration.test.ts [ integration/agent-lock-order.integration.test.ts ]
 FAIL  integration/auth-idempotency.integration.test.ts [ integration/auth-idempotency.integration.test.ts ]
 FAIL  integration/autonomous-control-plane.integration.test.ts [ integration/autonomous-control-plane.integration.test.ts ]
 FAIL  integration/bootstrap-install.integration.test.ts [ integration/bootstrap-install.integration.test.ts ]
 FAIL  integration/collaboration-queue-counts.integration.test.ts [ integration/collaboration-queue-counts.integration.test.ts ]
 FAIL  integration/documents.integration.test.ts [ integration/documents.integration.test.ts ]
 FAIL  integration/guidance.integration.test.ts [ integration/guidance.integration.test.ts ]
 FAIL  integration/human-attention.integration.test.ts [ integration/human-attention.integration.test.ts ]
 FAIL  integration/reviewer-fixes.integration.test.ts [ integration/reviewer-fixes.integration.test.ts ]
 FAIL  integration/route-policy-authorization.integration.test.ts [ integration/route-policy-authorization.integration.test.ts ]
 FAIL  integration/stage0.integration.test.ts [ integration/stage0.integration.test.ts ]
 FAIL  integration/stage1.integration.test.ts [ integration/stage1.integration.test.ts ]
 FAIL  integration/stage2-collaboration.integration.test.ts [ integration/stage2-collaboration.integration.test.ts ]
 FAIL  integration/stage3-delivery.integration.test.ts [ integration/stage3-delivery.integration.test.ts ]
 FAIL  integration/stage4-operations.integration.test.ts [ integration/stage4-operations.integration.test.ts ]
 FAIL  integration/stage5-agent-connections.integration.test.ts [ integration/stage5-agent-connections.integration.test.ts ]
 FAIL  integration/workbench-controls.integration.test.ts [ integration/workbench-controls.integration.test.ts ]
 FAIL  integration/workbench-conversations.integration.test.ts [ integration/workbench-conversations.integration.test.ts ]
 FAIL  integration/workbench-llm-connections.integration.test.ts [ integration/workbench-llm-connections.integration.test.ts ]
 FAIL  integration/workbench-recovery.integration.test.ts [ integration/workbench-recovery.integration.test.ts ]
 FAIL  integration/workbench-runner.integration.test.ts [ integration/workbench-runner.integration.test.ts ]
      Tests  3 passed (3)
```

## d0-integration-final.log

完整原始日志 SHA-256：`7d588b36b013ca663bec131b04651feb215352316104b5042705ccc91ec0b61c`。

```text
      Tests  77 passed (77)
 FAIL  integration/collaboration-queue-counts.integration.test.ts > collaboration queue counts
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"c13df455-bd8d-4144-a98c-1ca3fbb1354c"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/documents.integration.test.ts > ordinary versioned Documents
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"b8392e18-ca2c-4f5c-b9ae-c1fb57140583"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/reviewer-fixes.integration.test.ts > reviewer API fixes
 FAIL  integration/stage1.integration.test.ts > Stage 1 agent API acceptance
AssertionError: invalid value "undefined" for header x-csrf-token
 FAIL  integration/route-policy-authorization.integration.test.ts [ integration/route-policy-authorization.integration.test.ts ]
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"ecabebc2-e1a1-4789-871c-39fc061d9f83"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage0.integration.test.ts > Stage 0 PostgreSQL API acceptance
AssertionError: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage4-operations.integration.test.ts > Stage 4 planning and operations API
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"a4f7d15a-f101-4a96-8c9e-cc86615819e9"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage5-agent-connections.integration.test.ts [ integration/stage5-agent-connections.integration.test.ts ]
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"001b1262-c962-4070-bc7c-da52fbe8dc52"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/workbench-controls.integration.test.ts > workbench turn controls and context pins
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"3e790411-4fd0-43f1-b89b-5183daa6877c"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/workbench-conversations.integration.test.ts > durable workbench conversation admission
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"4afa3b23-cc76-4da1-994d-3e6c46c3531f"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/workbench-llm-connections.integration.test.ts > Workbench LLM connection settings
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"f115e22b-dedc-4ec8-a335-ed0a74f92abc"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/workbench-recovery.integration.test.ts > durable workbench conversation event recovery
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"fd300309-0ca7-4eeb-aa4d-2d44b577d7cc"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/workbench-runner.integration.test.ts > exact-session Pi Runner API
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"00eed2ca-85bd-48eb-9ee8-6d7a1a631a8d"}}: expected 409 to be 200 // Object.is equality
⎯⎯⎯⎯⎯⎯ Failed Tests 56 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > forms the exact WorkItem gate -> guard -> revoke chain and denies the reparented write
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"2be54859-b366-481e-a3a4-87e5f87d0580"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > forms the exact Project delete -> health guard -> revoke chain and leaves zero health projection
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"1bb7e0f6-3ecd-444f-aaf4-2f2c74b68edc"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > publishes approved Agent project health while locking only the post-core Approval row
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"d09bbf01-5d8b-4e31-9e29-68944f0da9e4"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > rejects reciprocal cross-project health drafts before the merged planner
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"fc6e477f-98da-4ad8-a7b0-b4155c4c4eb7"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > denies project health when the bound Work Item moves after pre-authorization
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"4acc1ab0-5115-4dfc-a2ae-29295b3c5c52"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > waits at Definition before Session and WorkItem and denies Usage after reparent
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"8219207b-3860-46cb-af35-14bd87db3627"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > lets WorkItem reparent win while forced assignment waits on Definition
AssertionError: {"error":{"code":"AUTH_RATE_LIMITED","message":"Authentication request is temporarily rate limited","details":{"endpointClass":"install","retryAfterSeconds":2},"correlationId":"3646532f-c7ec-4a01-b042-572e9b53aa9c"}}: expected 429 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > serializes forced assignment, retry, and revoke with no partial Session graph
AssertionError: {"error":{"code":"AUTH_RATE_LIMITED","message":"Authentication request is temporarily rate limited","details":{"endpointClass":"install","retryAfterSeconds":1},"correlationId":"9ce40dd2-b810-4203-9453-219f6137aeac"}}: expected 429 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > locks SessionToken before InstallationToken for exchange and refresh
AssertionError: {"error":{"code":"AUTH_RATE_LIMITED","message":"Authentication request is temporarily rate limited","details":{"endpointClass":"install","retryAfterSeconds":1},"correlationId":"97cbdf2b-4df4-4a55-b638-fe88f8bac06d"}}: expected 429 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > completes reciprocal child, review, and handoff acquisition in sorted order
AssertionError: {"error":{"code":"AUTH_RATE_LIMITED","message":"Authentication request is temporarily rate limited","details":{"endpointClass":"install","retryAfterSeconds":1},"correlationId":"7fc10979-fcf5-4cd9-b957-9df6b48ca959"}}: expected 429 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > revalidates automation resource, message, and approval authority after exact native lock waits
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"19629e41-a8e2-497c-aa1b-d49e6fa6c465"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > orders Stage4 approval consumption before a human Approval decision through Session
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"911ea3c3-90ef-4454-bc6f-d4224fc58112"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > denies Loop admission after project routing or exact Team grant changes behind native locks
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"787d1455-54b9-47d7-b436-4bf79bc1c5f8"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/agent-lock-order.integration.test.ts > Agent authority total lock order > serializes reordered multi-recipient reciprocal room messages at the first Definition
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"665adf2c-630d-4347-9a58-e1a7d00a228b"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > atomically installs once under concurrent duplicate requests and replays the same cookie
AssertionError: expected 409 to be 200 // Object.is equality
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > binds one authentication Idempotency-Key to exactly one subject, including concurrent claims
AssertionError: promise rejected "Error: Authentication replay key is unava… { …(2) }" instead of resolving
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > replays login exactly and conflicts on a changed client context without another session
AssertionError: expected 401 to be 200 // Object.is equality
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > rolls back a precommit claim and business writes, then permits the retry
AssertionError: expected [Function] to throw error including 'forced-precommit-failure' but got 'invalid input syntax for type uuid: ""'
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > replays Agent registration and webhook-secret rotation without generic plaintext replay
AssertionError: expected 401 to be 200 // Object.is equality
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > replays atomic assignment without exposing bootstrap credentials or using the generic replay table
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > replays exchange and refresh tokens without exchanging or rotating twice
AssertionError: expected 400 to be 200 // Object.is equality
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > fails closed for expired, tampered, and wrong-key replay without new sessions
AssertionError: expected 429 to be 200 // Object.is equality
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > returns pre-header and live CURSOR_EXPIRED controls with exact bigint cursors
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > keeps retention reads read-only under concurrency and rejects partial limits
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > reclaims only after 24 hours and replays logout after the session is revoked
AssertionError: expected 429 to be 200 // Object.is equality
 FAIL  integration/auth-idempotency.integration.test.ts > secret-aware authentication idempotency > does not persist plaintext credentials outside the intentional webhook boundary
AssertionError: expected '[]' not to contain ''
 FAIL  integration/autonomous-control-plane.integration.test.ts > autonomous control plane, browser push, and Agent enrollment > auto-approves outside exclusions and keeps excluded approvals human-visible
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"f72ed7e1-4a4d-4123-b3e6-62fed392de35"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/bootstrap-install.integration.test.ts > authenticated single-use installation bootstrap > installs once and exactly replays the encrypted cookie response only for the same credential, key, body, and client context
AssertionError: expected 409 to be 200 // Object.is equality
 FAIL  integration/bootstrap-install.integration.test.ts > authenticated single-use installation bootstrap > returns the same result to 20 concurrent callers sharing one key
AssertionError: expected false to be true // Object.is equality
 FAIL  integration/bootstrap-install.integration.test.ts > authenticated single-use installation bootstrap > allows exactly one of 20 concurrent distinct keys and permanently closes every loser
AssertionError: expected [] to have a length of 1 but got +0
 FAIL  integration/bootstrap-install.integration.test.ts > authenticated single-use installation bootstrap > rolls back the replay claim and partial installation writes, then permits the exact retry
AssertionError: expected 409 to be 200 // Object.is equality
 FAIL  integration/bootstrap-install.integration.test.ts > authenticated single-use installation bootstrap > does not leak bootstrap, password, client, cookie, or idempotency values through logs, errors, or durable facts
AssertionError: expected 409 to be 200 // Object.is equality
 FAIL  integration/guidance.integration.test.ts > versioned Guidance acceptance > publishes immutable scoped revisions, pins Session context, and audits pointer-only rollback
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"10f5fb64-9158-4ffb-b110-62d097048dc4"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/human-attention.integration.test.ts > Human Attention projection acceptance > rebuilds six typed kinds and keeps list/detail scope non-inferential
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"6a4ab6bf-63ac-4c50-a1a2-579155793ec4"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > coordinates exclusive and shared leases, child budgets, and durable parent blocking
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"caaf3641-fbb5-405f-b1a7-466039fd8751"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > audits human-visible ask/answer, rejects hidden messages and cross-scope context deltas, and records force release
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"a6c02071-3329-4e02-8777-4f60fb6dbf7b"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > supports project-linked Work Items through canonical executor and review delegation paths with exact or actor-targeted Inbox replies
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"cc0df8e0-af4b-4550-8aa4-e6617ce39e8e"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > derives legacy Human Inbox scope for current non-admin list and detail reads
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"bb3c786e-0ed2-457f-b6c6-f68e2e21f1cd"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > revalidates claim, acknowledge, and reply idempotency replays against live scope
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"9e5224fc-7abf-4ff6-b909-67ac3493edc4"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > claims actor Inbox items once and keeps exact Session ask, review, blocker, and mention flows isolated
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"43e3e900-639f-43c6-a22a-6c7db356fbed"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > enforces cross-team collaboration boundaries and trusted context sources
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"3215bc0a-626a-4d2e-a902-c0ba3f526140"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > projects body-redacted Agent Inbox delivery facts to authorized Humans
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"3d1f43da-cef8-4454-859a-8e8312f4cab4"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > accepts, rolls back, and rejects handoffs atomically with durable events and outbox
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"2c13b53f-3251-4b34-9253-97e321f4217b"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage2-collaboration.integration.test.ts > Stage 2 collaboration API acceptance > projects authorized Recovery conditions from durable execution facts and resolves a failed source through a distinct retry
AssertionError: {"error":{"code":"IDEMPOTENCY_REPLAY_UNAVAILABLE","message":"Authentication replay key is unavailable","correlationId":"2539586c-3fd6-4786-b588-682894b69b76"}}: expected 409 to be 200 // Object.is equality
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > authorizes before context disclosure and persists provider intent without provider I/O
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > persists an exact-head, approval-bound CI retry through the provider action queue
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > verifies exact raw GitHub bytes and makes duplicate deliveries a single durable effect
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > uses one live exact-context predicate and revokes repository disclosure immediately
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > rejects missing pinned review and merge permissions before PR evidence with zero residue
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > rejects sensitive artifact content and rolls back artifact, event, and outbox writes
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > requires current Team membership for human updates and serializes dependency cycles
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > keeps agent project updates draft-only and makes publication and completion decisions human, revisioned, and replay-safe
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > commits upload expiry before returning a stable replay-safe error without publishing an artifact
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > requires project and completion evidence to be linked to the exact delivery target
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > runs branch, commit, PR, check, independent review, exact-head approval, merge, and suggestion
 FAIL  integration/stage3-delivery.integration.test.ts > Stage 3 delivery API > supports a Human-owned upload lifecycle with attribution, listing, download, and cancellation
AssertionError: invalid value "undefined" for header x-csrf-token
      Tests  56 failed | 6 passed | 93 skipped (155)
```

## d0-integration-s3.log

完整原始日志 SHA-256：`810213fe3285d204bd3f0137634d9cc3e5ebdc9b6b111eb07504c172aac79940`。

```text
      Tests  77 passed (77)
      Tests  154 passed | 1 skipped (155)
      Tests  78 passed | 1 skipped (79)
      Tests  1 skipped (1)
```

## d0-integration.log

完整原始日志 SHA-256：`c348b27ece274144cfd83811c42c7b5cfbc850451f154ef211fb0d43de15ef3e`。

```text
Error: Integration tests require RUN_INTEGRATION=1 and DATABASE_URL pointing at a dedicated test database.
```

## d0-lint-final.log

完整原始日志 SHA-256：`4f0e2b099944e17358de1b07250a73a17fd3454c3e8962feac22cb69358aeb4a`。

```text
 Tasks:    18 successful, 18 total
```

## d0-lint-first.log

完整原始日志 SHA-256：`ec9c4609229e477a9432139a525a90ac00e412128c37a7ba35aa8c44b4a7da5c`。

```text
@workmesh/web:lint: playwright.d0.config.ts(18,5): error TS2769: No overload matches this call.
 Tasks:    15 successful, 18 total
Failed:    @workmesh/web#lint
```

## d0-lint.log

完整原始日志 SHA-256：`9137258dc3eb8ed3a0fe4b1513c4b30fc58926344b04d558948f594ca7a95842`。

```text
 Tasks:    18 successful, 18 total
```

## d0-png-capture.log

完整原始日志 SHA-256：`243a9b01cd6521c0a00bcfc67e1cd166eec9488f825bc625ac4e3308cdd321e7`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: 两个独立上下文的 PNG 必须逐字节一致
  1 failed
  8 did not run
  5 passed (41.0s)
```

## d0-recovery-configured.log

完整原始日志 SHA-256：`47169ca1b335e94b4565109dcaff0d5c034dd4757e5553470dc96953242d76bb`。

```text
      Tests  1 passed (1)
```

## d0-recovery.log

完整原始日志 SHA-256：`8dc9174798dd5db567116f4b26fd4f7e1179bca1cd2dd6c6c80cbf1d56aa8fd5`。

```text
Error: Integration tests require an explicit WORKMESH_BOOTSTRAP_TOKEN test fixture.
```

## d0-renderer-capture.log

完整原始日志 SHA-256：`f58012eb76b81e04c64a6081dfcb1a548bf59ff58626c3d76b9c88c919d645dc`。

```text
  14 passed (1.2m)
```

## d0-renderer-replay.log

完整原始日志 SHA-256：`b673f9166de352e64da520eeb3fb9da6a97111753928ba7ae4ad890fddc3ce82`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: expect(page).toHaveScreenshot(expected) failed
  1 failed
  7 did not run
  6 passed (40.9s)
```

## d0-replay-final.log

完整原始日志 SHA-256：`34d21357912f4cccc58830aa08e9d5af0c488fa744720dd755c81866d5dc862a`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: expect(page).toHaveScreenshot(expected) failed
  1 failed
  8 did not run
  5 passed (35.2s)
```

## d0-retention-upgrade.log

完整原始日志 SHA-256：`40d4bc5dca9d59cac8a3ef885a34df3d4f46336d2fae7494e40eb1beebf58446`。

```text
      Tests  1 passed (1)
```

## d0-stable-capture.log

完整原始日志 SHA-256：`c8858b548d6ab2829f6360f7db15cb56d51f3256c61fc6c200a047711201d8de`。

```text
  14 passed (1.4m)
```

## d0-stable-replay.log

完整原始日志 SHA-256：`b91d1a4897f539adce223f367a0d71f7da693feb5f3db2a2ecc4af78d84af074`。

```text
Testing stopped early after 1 maximum allowed failures.
    Error: expect(page).toHaveScreenshot(expected) failed
  1 failed
  1 did not run
  12 passed (1.2m)
```

## d0-test.log

完整原始日志 SHA-256：`70e82eb8558d847eb2f6d939563054dbd8a8110694d81da0e0ce12db52801773`。

```text
@workmesh/contracts:test:       Tests  180 passed (180)
@workmesh/git-provider:test:       Tests  13 passed (13)
@workmesh/observability:test:       Tests  16 passed (16)
@workmesh/artifact-storage:test:       Tests  22 passed (22)
@workmesh/ui:test:       Tests  50 passed (50)
@workmesh/domain:test:       Tests  65 passed (65)
@workmesh/a2a-adapter:test:       Tests  4 passed (4)
@workmesh/agent-runner:test:       Tests  48 passed (48)
@workmesh/config:test:       Tests  33 passed (33)
@workmesh/agent-sdk:test:       Tests  33 passed (33)
@workmesh/db:test:       Tests  28 passed (28)
@workmesh/mcp:test:       Tests  38 passed (38)
@workmesh/conformance:test:       Tests  1 passed (1)
@workmesh/fake-agent:test:       Tests  4 passed (4)
@workmesh/web:test:       Tests  776 passed (776)
@workmesh/recovery:test:       Tests  7 passed (7)
@workmesh/worker:test:       Tests  163 passed | 2 skipped (165)
@workmesh/api:test:       Tests  174 passed (174)
 Tasks:    29 successful, 29 total
```

## d0-typecheck-final.log

完整原始日志 SHA-256：`788df6fc1c804edc4ef4dd07b560c9ea952c677206569e633f7dd43c07b9c1ee`。

```text
 Tasks:    18 successful, 18 total
```

## d0-typecheck-first.log

完整原始日志 SHA-256：`52a859995c5f23d9ab43799e86e261e681a00797a90facf2d1c8958acca79c9f`。

```text
@workmesh/web:typecheck: playwright.d0.config.ts(18,5): error TS2769: No overload matches this call.
 Tasks:    15 successful, 18 total
Failed:    @workmesh/web#typecheck
```

## d0-typecheck.log

完整原始日志 SHA-256：`9fb06c7fb3811269b917240b8734f04e6cff435b2017c9bd422a1dceb5e0821b`。

```text
 Tasks:    18 successful, 18 total
```

## d0-verified-replay.log

完整原始日志 SHA-256：`26112b1ad4740c0b604285a566e45415270a2e6b8ad4fd28771c1c8a4b5a0d52`。

```text
  14 passed (1.2m)
```
