# Exact-head pull request review and merge approval

Status: Accepted

## Context

A generic approval or review becomes unsafe when a pull-request head changes. Reviewers must not approve their own produced change, and a lease is not merge authorization.

## Decision

The canonical merge payload binds provider, connection, repository, provider pull-request ID, exact head SHA, and merge method. Only action `provider.pull_request.merge` is accepted. Generic approval consumption rejects merge approvals; the provider worker alone consumes one after a live provider head recheck and successful merge.

Default merge policy requires at least one independent structured approval on the current head, no current-head structured review with verdict `changes_requested`, no Blocking or High finding from any current-head structured review, and every repository-configured required check passed on that head. The worker repeats the complete review, finding, check, approval, authorization, projection, and provider-head gate immediately before the provider merge. A webhook head change invalidates the binding and cancels an unconsumed approval. Provider expected-head semantics remain mandatory. Merge never triggers deployment or closes a work item.

Structured findings expose the stable public fields `severity`, `file`, `line`, `summary`, `evidence`, and `recommendation`. Provider-native review projections remain clearly labelled observations; only provenance-bearing WorkMesh structured reviews participate in WorkMesh merge authority.

CI check retry uses the same provider-action boundary. It requires live `ci:run`, repository context permission `ci`, a failed or skipped check on the current PR head, and a human approval bound to the exact provider, connection, repository, pull request, check run, and head. The worker repeats those gates immediately before asking the provider to re-run the check and consumes the approval only after a successful provider result or checkpoint reconciliation.

The project delivery view renders each merge approval as an exact-action card showing provider, repository, pull request, head SHA, merge method, and current approval/invalidation status so the responsible human can inspect what is authorized.

## Alternatives

Approval by PR number; review from any prior head; generic consume followed by merge; automatic deployment or issue closure.

## Consequences

Every new head needs a current review and approval. Merge retries are safe only when the provider adapter preserves expected-head/idempotent semantics.

## Migration

Migration 0008 adds PR/check/review projections and merge approval bindings. Migration 0013 adds the explicit structured-finding fields.

## Spec changes

Structured review and exact-head merge endpoints are added.
