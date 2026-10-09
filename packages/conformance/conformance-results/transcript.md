# WorkMesh Agent Collaboration Client Profile conformance transcript

## native-http / codex-style

Result: passed. Checks: 9 passed, 0 failed.

1. [passed] profile.negotiation: Negotiated 1.0 from route_policy_manifest; authorization remains live per request.
2. [passed] lifecycle.assignment-ack: Acknowledged Session 00000000-0000-4000-8000-000000000001 at revision 8.
3. [passed] lifecycle.transition-executing: Transitioned Session to executing at revision 9.
4. [passed] lifecycle.context-inbox: Retrieved exact Context and acknowledged the durable Inbox item.
5. [passed] lifecycle.collaborate-evidence-handoff: Collaborated visibly, published Artifact 00000000-0000-4000-8000-000000000200, and offered a scoped Handoff.
6. [passed] idempotency.duplicate-mutation: Duplicate delivery replayed effect 00000000-0000-4000-8000-000000000106 without a second commit.
7. [passed] reconnect.cursor-recovery: Recovered 2 unique events from cursor 40.
8. [passed] hostile.revoked-delegation: Observed DELEGATION_NOT_ACTIVE; fail closed: discard_session_credentials. (code=DELEGATION_NOT_ACTIVE)
9. [passed] hostile.expired-session-token: Observed UNAUTHENTICATED; fail closed: refresh_credentials_or_stop. (code=UNAUTHENTICATED)
10. [passed] hostile.stopped-session: Observed SESSION_STOPPED; fail closed: stop_and_acknowledge. (code=SESSION_STOPPED)
11. [passed] hostile.out-of-scope-resource: Observed RESOURCE_SCOPE_DENIED; fail closed: do_not_retry_out_of_scope. (code=RESOURCE_SCOPE_DENIED)
12. [passed] hostile.stale-revision: Observed REVISION_CONFLICT; fail closed: refetch_and_rebase. (code=REVISION_CONFLICT)
13. [passed] hostile.lost-lease: Observed LEASE_EXPIRED; fail closed: stop_protected_action. (code=LEASE_EXPIRED)
14. [passed] hostile.approval-required: Observed APPROVAL_REQUIRED; fail closed: request_or_wait_for_approval. (code=APPROVAL_REQUIRED)
15. [passed] hostile.feature-disabled: Observed FEATURE_DISABLED; fail closed: disable_optional_capability. (code=FEATURE_DISABLED)
16. [passed] hostile.cursor-gap: Observed CURSOR_EXPIRED; fail closed: resync_from_server_cursor. (code=CURSOR_EXPIRED)
17. [passed] hostile.fail-closed-matrix: Verified 9 hostile states with actionable fail-closed reactions.
18. [passed] lifecycle.complete: Refreshed revision 11 and completed Session with Artifact 00000000-0000-4000-8000-000000000200.

## mcp / codex-style

Result: passed. Checks: 9 passed, 0 failed.

1. [passed] profile.negotiation: Negotiated 1.0 from route_policy_manifest; authorization remains live per request.
2. [passed] lifecycle.assignment-ack: Acknowledged Session 00000000-0000-4000-8000-000000000001 at revision 8.
3. [passed] lifecycle.transition-executing: Transitioned Session to executing at revision 9.
4. [passed] lifecycle.context-inbox: Retrieved exact Context and acknowledged the durable Inbox item.
5. [passed] lifecycle.collaborate-evidence-handoff: Collaborated visibly, published Artifact 00000000-0000-4000-8000-000000000200, and offered a scoped Handoff.
6. [passed] idempotency.duplicate-mutation: Duplicate delivery replayed effect 00000000-0000-4000-8000-000000000106 without a second commit.
7. [passed] reconnect.cursor-recovery: Recovered 2 unique events from cursor 40.
8. [passed] hostile.revoked-delegation: Observed DELEGATION_NOT_ACTIVE; fail closed: discard_session_credentials. (code=DELEGATION_NOT_ACTIVE)
9. [passed] hostile.expired-session-token: Observed UNAUTHENTICATED; fail closed: refresh_credentials_or_stop. (code=UNAUTHENTICATED)
10. [passed] hostile.stopped-session: Observed SESSION_STOPPED; fail closed: stop_and_acknowledge. (code=SESSION_STOPPED)
11. [passed] hostile.out-of-scope-resource: Observed RESOURCE_SCOPE_DENIED; fail closed: do_not_retry_out_of_scope. (code=RESOURCE_SCOPE_DENIED)
12. [passed] hostile.stale-revision: Observed REVISION_CONFLICT; fail closed: refetch_and_rebase. (code=REVISION_CONFLICT)
13. [passed] hostile.lost-lease: Observed LEASE_EXPIRED; fail closed: stop_protected_action. (code=LEASE_EXPIRED)
14. [passed] hostile.approval-required: Observed APPROVAL_REQUIRED; fail closed: request_or_wait_for_approval. (code=APPROVAL_REQUIRED)
15. [passed] hostile.feature-disabled: Observed FEATURE_DISABLED; fail closed: disable_optional_capability. (code=FEATURE_DISABLED)
16. [passed] hostile.cursor-gap: Observed CURSOR_EXPIRED; fail closed: resync_from_server_cursor. (code=CURSOR_EXPIRED)
17. [passed] hostile.fail-closed-matrix: Verified 9 hostile states with actionable fail-closed reactions.
18. [passed] lifecycle.complete: Refreshed revision 11 and completed Session with Artifact 00000000-0000-4000-8000-000000000200.

## native-http / opencode-style

Result: passed. Checks: 9 passed, 0 failed.

1. [passed] profile.negotiation: Negotiated 1.0 from route_policy_manifest; authorization remains live per request.
2. [passed] lifecycle.assignment-ack: Acknowledged Session 00000000-0000-4000-8000-000000000001 at revision 8.
3. [passed] lifecycle.transition-executing: Transitioned Session to executing at revision 9.
4. [passed] lifecycle.context-inbox: Retrieved exact Context and acknowledged the durable Inbox item.
5. [passed] lifecycle.collaborate-evidence-handoff: Collaborated visibly, published Artifact 00000000-0000-4000-8000-000000000200, and offered a scoped Handoff.
6. [passed] idempotency.duplicate-mutation: Duplicate delivery replayed effect 00000000-0000-4000-8000-000000000106 without a second commit.
7. [passed] reconnect.cursor-recovery: Recovered 2 unique events from cursor 40.
8. [passed] hostile.revoked-delegation: Observed DELEGATION_NOT_ACTIVE; fail closed: discard_session_credentials. (code=DELEGATION_NOT_ACTIVE)
9. [passed] hostile.expired-session-token: Observed UNAUTHENTICATED; fail closed: refresh_credentials_or_stop. (code=UNAUTHENTICATED)
10. [passed] hostile.stopped-session: Observed SESSION_STOPPED; fail closed: stop_and_acknowledge. (code=SESSION_STOPPED)
11. [passed] hostile.out-of-scope-resource: Observed RESOURCE_SCOPE_DENIED; fail closed: do_not_retry_out_of_scope. (code=RESOURCE_SCOPE_DENIED)
12. [passed] hostile.stale-revision: Observed REVISION_CONFLICT; fail closed: refetch_and_rebase. (code=REVISION_CONFLICT)
13. [passed] hostile.lost-lease: Observed LEASE_EXPIRED; fail closed: stop_protected_action. (code=LEASE_EXPIRED)
14. [passed] hostile.approval-required: Observed APPROVAL_REQUIRED; fail closed: request_or_wait_for_approval. (code=APPROVAL_REQUIRED)
15. [passed] hostile.feature-disabled: Observed FEATURE_DISABLED; fail closed: disable_optional_capability. (code=FEATURE_DISABLED)
16. [passed] hostile.cursor-gap: Observed CURSOR_EXPIRED; fail closed: resync_from_server_cursor. (code=CURSOR_EXPIRED)
17. [passed] hostile.fail-closed-matrix: Verified 9 hostile states with actionable fail-closed reactions.
18. [passed] lifecycle.complete: Refreshed revision 11 and completed Session with Artifact 00000000-0000-4000-8000-000000000200.

## mcp / opencode-style

Result: passed. Checks: 9 passed, 0 failed.

1. [passed] profile.negotiation: Negotiated 1.0 from route_policy_manifest; authorization remains live per request.
2. [passed] lifecycle.assignment-ack: Acknowledged Session 00000000-0000-4000-8000-000000000001 at revision 8.
3. [passed] lifecycle.transition-executing: Transitioned Session to executing at revision 9.
4. [passed] lifecycle.context-inbox: Retrieved exact Context and acknowledged the durable Inbox item.
5. [passed] lifecycle.collaborate-evidence-handoff: Collaborated visibly, published Artifact 00000000-0000-4000-8000-000000000200, and offered a scoped Handoff.
6. [passed] idempotency.duplicate-mutation: Duplicate delivery replayed effect 00000000-0000-4000-8000-000000000106 without a second commit.
7. [passed] reconnect.cursor-recovery: Recovered 2 unique events from cursor 40.
8. [passed] hostile.revoked-delegation: Observed DELEGATION_NOT_ACTIVE; fail closed: discard_session_credentials. (code=DELEGATION_NOT_ACTIVE)
9. [passed] hostile.expired-session-token: Observed UNAUTHENTICATED; fail closed: refresh_credentials_or_stop. (code=UNAUTHENTICATED)
10. [passed] hostile.stopped-session: Observed SESSION_STOPPED; fail closed: stop_and_acknowledge. (code=SESSION_STOPPED)
11. [passed] hostile.out-of-scope-resource: Observed RESOURCE_SCOPE_DENIED; fail closed: do_not_retry_out_of_scope. (code=RESOURCE_SCOPE_DENIED)
12. [passed] hostile.stale-revision: Observed REVISION_CONFLICT; fail closed: refetch_and_rebase. (code=REVISION_CONFLICT)
13. [passed] hostile.lost-lease: Observed LEASE_EXPIRED; fail closed: stop_protected_action. (code=LEASE_EXPIRED)
14. [passed] hostile.approval-required: Observed APPROVAL_REQUIRED; fail closed: request_or_wait_for_approval. (code=APPROVAL_REQUIRED)
15. [passed] hostile.feature-disabled: Observed FEATURE_DISABLED; fail closed: disable_optional_capability. (code=FEATURE_DISABLED)
16. [passed] hostile.cursor-gap: Observed CURSOR_EXPIRED; fail closed: resync_from_server_cursor. (code=CURSOR_EXPIRED)
17. [passed] hostile.fail-closed-matrix: Verified 9 hostile states with actionable fail-closed reactions.
18. [passed] lifecycle.complete: Refreshed revision 11 and completed Session with Artifact 00000000-0000-4000-8000-000000000200.

## native-http / pi-style

Result: passed. Checks: 9 passed, 0 failed.

1. [passed] profile.negotiation: Negotiated 1.0 from route_policy_manifest; authorization remains live per request.
2. [passed] lifecycle.assignment-ack: Acknowledged Session 00000000-0000-4000-8000-000000000001 at revision 8.
3. [passed] lifecycle.transition-executing: Transitioned Session to executing at revision 9.
4. [passed] lifecycle.context-inbox: Retrieved exact Context and acknowledged the durable Inbox item.
5. [passed] lifecycle.collaborate-evidence-handoff: Collaborated visibly, published Artifact 00000000-0000-4000-8000-000000000200, and offered a scoped Handoff.
6. [passed] idempotency.duplicate-mutation: Duplicate delivery replayed effect 00000000-0000-4000-8000-000000000106 without a second commit.
7. [passed] reconnect.cursor-recovery: Recovered 2 unique events from cursor 40.
8. [passed] hostile.revoked-delegation: Observed DELEGATION_NOT_ACTIVE; fail closed: discard_session_credentials. (code=DELEGATION_NOT_ACTIVE)
9. [passed] hostile.expired-session-token: Observed UNAUTHENTICATED; fail closed: refresh_credentials_or_stop. (code=UNAUTHENTICATED)
10. [passed] hostile.stopped-session: Observed SESSION_STOPPED; fail closed: stop_and_acknowledge. (code=SESSION_STOPPED)
11. [passed] hostile.out-of-scope-resource: Observed RESOURCE_SCOPE_DENIED; fail closed: do_not_retry_out_of_scope. (code=RESOURCE_SCOPE_DENIED)
12. [passed] hostile.stale-revision: Observed REVISION_CONFLICT; fail closed: refetch_and_rebase. (code=REVISION_CONFLICT)
13. [passed] hostile.lost-lease: Observed LEASE_EXPIRED; fail closed: stop_protected_action. (code=LEASE_EXPIRED)
14. [passed] hostile.approval-required: Observed APPROVAL_REQUIRED; fail closed: request_or_wait_for_approval. (code=APPROVAL_REQUIRED)
15. [passed] hostile.feature-disabled: Observed FEATURE_DISABLED; fail closed: disable_optional_capability. (code=FEATURE_DISABLED)
16. [passed] hostile.cursor-gap: Observed CURSOR_EXPIRED; fail closed: resync_from_server_cursor. (code=CURSOR_EXPIRED)
17. [passed] hostile.fail-closed-matrix: Verified 9 hostile states with actionable fail-closed reactions.
18. [passed] lifecycle.complete: Refreshed revision 11 and completed Session with Artifact 00000000-0000-4000-8000-000000000200.

## mcp / pi-style

Result: passed. Checks: 9 passed, 0 failed.

1. [passed] profile.negotiation: Negotiated 1.0 from route_policy_manifest; authorization remains live per request.
2. [passed] lifecycle.assignment-ack: Acknowledged Session 00000000-0000-4000-8000-000000000001 at revision 8.
3. [passed] lifecycle.transition-executing: Transitioned Session to executing at revision 9.
4. [passed] lifecycle.context-inbox: Retrieved exact Context and acknowledged the durable Inbox item.
5. [passed] lifecycle.collaborate-evidence-handoff: Collaborated visibly, published Artifact 00000000-0000-4000-8000-000000000200, and offered a scoped Handoff.
6. [passed] idempotency.duplicate-mutation: Duplicate delivery replayed effect 00000000-0000-4000-8000-000000000106 without a second commit.
7. [passed] reconnect.cursor-recovery: Recovered 2 unique events from cursor 40.
8. [passed] hostile.revoked-delegation: Observed DELEGATION_NOT_ACTIVE; fail closed: discard_session_credentials. (code=DELEGATION_NOT_ACTIVE)
9. [passed] hostile.expired-session-token: Observed UNAUTHENTICATED; fail closed: refresh_credentials_or_stop. (code=UNAUTHENTICATED)
10. [passed] hostile.stopped-session: Observed SESSION_STOPPED; fail closed: stop_and_acknowledge. (code=SESSION_STOPPED)
11. [passed] hostile.out-of-scope-resource: Observed RESOURCE_SCOPE_DENIED; fail closed: do_not_retry_out_of_scope. (code=RESOURCE_SCOPE_DENIED)
12. [passed] hostile.stale-revision: Observed REVISION_CONFLICT; fail closed: refetch_and_rebase. (code=REVISION_CONFLICT)
13. [passed] hostile.lost-lease: Observed LEASE_EXPIRED; fail closed: stop_protected_action. (code=LEASE_EXPIRED)
14. [passed] hostile.approval-required: Observed APPROVAL_REQUIRED; fail closed: request_or_wait_for_approval. (code=APPROVAL_REQUIRED)
15. [passed] hostile.feature-disabled: Observed FEATURE_DISABLED; fail closed: disable_optional_capability. (code=FEATURE_DISABLED)
16. [passed] hostile.cursor-gap: Observed CURSOR_EXPIRED; fail closed: resync_from_server_cursor. (code=CURSOR_EXPIRED)
17. [passed] hostile.fail-closed-matrix: Verified 9 hostile states with actionable fail-closed reactions.
18. [passed] lifecycle.complete: Refreshed revision 11 and completed Session with Artifact 00000000-0000-4000-8000-000000000200.
