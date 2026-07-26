# Usage and Cost Normalization

Status

Accepted for Stage 4.

Context

Providers report tokens, runtime, tool calls, and money in different shapes and at different times. Treating a missing provider price as zero would understate cost and make budget decisions unsafe.

Decision

Usage is an append-only, deduplicated fact scoped to an Agent and Session, with optional Project attribution and an observation timestamp. Every write first locks the Session and binds the supplied Agent and Project to that Session: Project attribution must equal the Session Project or the Project of its scoped Work Item, and project-less Sessions must remain project-less. Humans require write membership in the Session Team. Agents additionally require their live Session token and the normal delegation, capability, Team grant, resource-scope, stop-state, and idempotency checks. Ordinary Service Actors have no Usage HTTP admission path; any future trusted internal ingestion path must expose and enforce an explicit capability rather than treating actor kind as authority. Token counts, runtime, and tool calls remain independent nullable metrics. Monetary amounts use integer minor units plus an ISO-style three-letter currency and a source of `provider_reported`, `rate_card`, `manual`, or `unknown`. Every Stage 4 API minor-unit field is a canonical decimal string bounded by PostgreSQL `bigint`; SQL transport reads remain strings, Drizzle monetary columns use `mode: 'bigint'`, and domain aggregation and budget comparison use `BigInt`, never JavaScript `number`.

`unknown` cost requires a null amount; every known source requires an amount. Aggregation reports known totals and an explicit unknown-cost count in separate currency buckets. Initiative rollups return the same buckets. An Advanced View that exposes, filters, or orders cost must select one explicit currency; its Issue, Project, and Session projections aggregate only that currency. Budget policies are revisioned and support soft notification thresholds and hard admission cutoffs across Workspace, Team, Project, Agent, Session, and Loop scopes. A cost policy applies only to usage and reservations in the same currency. Currency conversion and cross-currency summation are never implicit.

Alternatives

Normalizing unknown to zero and converting currencies using a hidden live rate were rejected because both manufacture certainty. Mutable cumulative counters were rejected because they lose traceability and are difficult to repair.

Consequences

Reports may be incomplete but never silently optimistic. Multi-currency views remain separated until an explicit rate-card/conversion policy is introduced.

Migration

Migration `0016_stage4_usage_notifications.sql` adds usage, budget, notification preference, notification, and delivery facts.

Spec changes

Usage recording/summary and budget-policy endpoints are defined in `OPENAPI.yaml`.
