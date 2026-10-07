# ADR 索引

本目录共 **79** 份 ADR，编号 `0001` – `0077`。

> **注意 `docs/adr/.gitignore` 的内容是 `*`。** 新增的 ADR 与本索引默认被 git
> 忽略，`git status` 看不到它们。历史 **75** 份是靠 `git add -f` 强制入库的，因此
> **新增 ADR 必须同样 `git add -f`**，否则等于没写。
>
> 当前状态：磁盘上 80 个 `.md`（79 份 ADR + 本索引），git 已跟踪 75 份，
> **未入库的正是 `0074`–`0077` 四份新 ADR 与本索引**。

状态分布：`Accepted` 61、`Accepted for Stage 4` 5、`Proposed, revision 2, for the repaired GEN-9 contract Gate. Implementation remains blocked until an independent Gate accepts the machine contract. No editor dependency is selected in this slice` 1、`Accepted for v1.1 (Agent-first coordination)` 1、`Proposed` 9、`Accepted for implementation` 1、`Accepted for W12 partial implementation; public Skill release remains open` 1

## 重复编号（既有缺陷，未擅自重编号）

以下编号各有两份文件。**重编号不是安全操作**：全仓 80 份 ADR、27 份 plan 与
多份 spec 都按编号交叉引用，改号会让这些引用静默失效。因此本索引只**记录**
现状，处置方案（重编号 + 全量引用更新，作为独立任务）留给决定。

- `0028` → `0028-declarative-route-policy-and-event-audience.md` — Declarative route policy and event audience
- `0028` → `0028-kaneo-frontend-architecture-and-dependency-policy.md` — Kaneo frontend architecture and dependency policy
- `0029` → `0029-rich-content-sanitization-and-editor-boundary.md` — Rich-content sanitization and editor boundary
- `0029` → `0029-secret-aware-authentication-idempotency.md` — Secret-aware authentication idempotency

## 全部 ADR

| 编号 | 标题 | 状态 | 文件 |
|---|---|---|---|
| 0001 | Monorepo and runtime split | Accepted | [`0001-monorepo-runtime-split.md`](./0001-monorepo-runtime-split.md) |
| 0002 | REST and SSE transport | Accepted | [`0002-rest-sse.md`](./0002-rest-sse.md) |
| 0003 | PostgreSQL transaction and outbox | Accepted | [`0003-postgresql-transaction-outbox.md`](./0003-postgresql-transaction-outbox.md) |
| 0004 | Actor model | Accepted | [`0004-actor-model.md`](./0004-actor-model.md) |
| 0005 | Authentication choice | Accepted | [`0005-authentication-choice.md`](./0005-authentication-choice.md) |
| 0006 | Stage 0 authorization and event scope integrity | Accepted | [`0006-stage0-authorization-and-event-scope.md`](./0006-stage0-authorization-and-event-scope.md) |
| 0007 | Redis Stream outbox delivery | Accepted | [`0007-redis-outbox-delivery.md`](./0007-redis-outbox-delivery.md) |
| 0008 | Agent session token format and revocation | Accepted | [`0008-agent-session-token-revocation.md`](./0008-agent-session-token-revocation.md) |
| 0009 | Agent session transition table and server-side stop gate | Accepted | [`0009-agent-session-transition-table.md`](./0009-agent-session-transition-table.md) |
| 0010 | Agent activity immutability and redaction | Accepted | [`0010-agent-activity-immutability-and-redaction.md`](./0010-agent-activity-immutability-and-redaction.md) |
| 0011 | Agent plan versioning and conflict handling | Accepted | [`0011-agent-plan-versioning-and-conflict.md`](./0011-agent-plan-versioning-and-conflict.md) |
| 0012 | MCP transport boundary | Accepted | [`0012-mcp-domain-boundary.md`](./0012-mcp-domain-boundary.md) |
| 0013 | Lease semantics | Accepted | [`0013-lease-semantics.md`](./0013-lease-semantics.md) |
| 0014 | Handoff transaction | Accepted | [`0014-handoff-transaction.md`](./0014-handoff-transaction.md) |
| 0015 | Agent routing | Accepted | [`0015-agent-routing.md`](./0015-agent-routing.md) |
| 0016 | Work Room projection | Accepted | [`0016-work-room-projection.md`](./0016-work-room-projection.md) |
| 0017 | Parent child completion policy | Accepted | [`0017-parent-child-completion-policy.md`](./0017-parent-child-completion-policy.md) |
| 0018 | Provider abstraction, webhook verification, and recovery | Accepted | [`0018-provider-abstraction-webhook-recovery.md`](./0018-provider-abstraction-webhook-recovery.md) |
| 0019 | Repository context and AGENTS scope | Accepted | [`0019-repository-context-and-agents-scope.md`](./0019-repository-context-and-agents-scope.md) |
| 0020 | Exact-head pull request review and merge approval | Accepted | [`0020-exact-head-pull-request-approval.md`](./0020-exact-head-pull-request-approval.md) |
| 0021 | Artifact upload and provenance | Accepted | [`0021-artifact-upload-and-provenance.md`](./0021-artifact-upload-and-provenance.md) |
| 0022 | Completion suggestion and project progress policy | Accepted | [`0022-completion-suggestion-and-project-progress.md`](./0022-completion-suggestion-and-project-progress.md) |
| 0023 | Automation Versioning and Effect Execution | Accepted for Stage 4. | [`0023-automation-versioning-and-effect-execution.md`](./0023-automation-versioning-and-effect-execution.md) |
| 0024 | Loop Admission, Overlap, and Retry | Accepted for Stage 4. | [`0024-loop-admission-overlap-and-retry.md`](./0024-loop-admission-overlap-and-retry.md) |
| 0025 | Source-linked Project Forecast | Accepted for Stage 4. | [`0025-source-linked-project-forecast.md`](./0025-source-linked-project-forecast.md) |
| 0026 | Usage and Cost Normalization | Accepted for Stage 4. | [`0026-usage-and-cost-normalization.md`](./0026-usage-and-cost-normalization.md) |
| 0027 | A2A Version Boundary | Accepted for Stage 4. | [`0027-a2a-version-boundary.md`](./0027-a2a-version-boundary.md) |
| 0028 | Declarative route policy and event audience | Accepted | [`0028-declarative-route-policy-and-event-audience.md`](./0028-declarative-route-policy-and-event-audience.md) |
| 0028 | Kaneo frontend architecture and dependency policy | Accepted | [`0028-kaneo-frontend-architecture-and-dependency-policy.md`](./0028-kaneo-frontend-architecture-and-dependency-policy.md) |
| 0029 | Rich-content sanitization and editor boundary | Proposed, revision 2, for the repaired GEN-9 contract Gate. Implementation remains blocked until an independent Gate accepts the machine contract. No editor dependency is selected in this slice. | [`0029-rich-content-sanitization-and-editor-boundary.md`](./0029-rich-content-sanitization-and-editor-boundary.md) |
| 0029 | Secret-aware authentication idempotency | Accepted. | [`0029-secret-aware-authentication-idempotency.md`](./0029-secret-aware-authentication-idempotency.md) |
| 0030 | Shared authentication rate limits | Accepted. | [`0030-shared-authentication-rate-limits.md`](./0030-shared-authentication-rate-limits.md) |
| 0031 | Authenticated single-use installation bootstrap | Accepted. | [`0031-authenticated-single-use-bootstrap.md`](./0031-authenticated-single-use-bootstrap.md) |
| 0032 | Signed, authorization-aware keyset pagination | Accepted | [`0032-signed-keyset-pagination.md`](./0032-signed-keyset-pagination.md) |
| 0033 | PostgreSQL-authoritative realtime replay | Accepted | [`0033-postgres-authoritative-realtime-replay.md`](./0033-postgres-authoritative-realtime-replay.md) |
| 0034 | Production runtime images and lifecycle | Accepted | [`0034-production-runtime-images.md`](./0034-production-runtime-images.md) |
| 0035 | Retention archive and bounded heartbeat projections | Accepted | [`0035-retention-archive-and-heartbeat-projections.md`](./0035-retention-archive-and-heartbeat-projections.md) |
| 0036 | Exact archive membership | Accepted | [`0036-exact-archive-membership.md`](./0036-exact-archive-membership.md) |
| 0037 | Agent Inbox recipients, claims, and receipts | Accepted | [`0037-agent-inbox-recipients-claims-and-receipts.md`](./0037-agent-inbox-recipients-claims-and-receipts.md) |
| 0038 | Atomic checksummed v1 migrations | Accepted | [`0038-atomic-checksummed-v1-migrations.md`](./0038-atomic-checksummed-v1-migrations.md) |
| 0039 | Authenticated complete recovery bundles | Accepted | [`0039-authenticated-complete-recovery-bundles.md`](./0039-authenticated-complete-recovery-bundles.md) |
| 0040 | Transactional active executor projection | Accepted | [`0040-transactional-active-executor-projection.md`](./0040-transactional-active-executor-projection.md) |
| 0041 | Versioned Guidance and context pinning | Accepted | [`0041-versioned-guidance-and-context-pinning.md`](./0041-versioned-guidance-and-context-pinning.md) |
| 0042 | Agent Client Profile and derived capability manifest | Accepted | [`0042-agent-client-profile-and-derived-capability-manifest.md`](./0042-agent-client-profile-and-derived-capability-manifest.md) |
| 0043 | Agent Connection & Coordination MCP | Accepted for v1.1 (Agent-first coordination). | [`0043-agent-connection-and-coordination-mcp.md`](./0043-agent-connection-and-coordination-mcp.md) |
| 0044 | Structured planning domain parity | Accepted | [`0044-structured-planning-domain-parity.md`](./0044-structured-planning-domain-parity.md) |
| 0045 | WebUI i18n entry consolidation and single-token theme unification | Proposed | [`0045-webui-redesign-i18n-theme-unification.md`](./0045-webui-redesign-i18n-theme-unification.md) |
| 0046 | Agent Connection recovery, execution capacity, and credential proof | Accepted | [`0046-agent-connection-recovery-and-execution-capacity.md`](./0046-agent-connection-recovery-and-execution-capacity.md) |
| 0047 | Agent task admission and forced delegation | Accepted for implementation. | [`0047-agent-task-admission-and-forced-delegation.md`](./0047-agent-task-admission-and-forced-delegation.md) |
| 0048 | Stale self-claim recovery | Accepted | [`0048-stale-self-claim-recovery.md`](./0048-stale-self-claim-recovery.md) |
| 0049 | Terminal-only self-claim recovery | Accepted | [`0049-terminal-only-self-claim-recovery.md`](./0049-terminal-only-self-claim-recovery.md) |
| 0050 | Human Attention authorized projection | Accepted | [`0050-human-attention-authorized-projection.md`](./0050-human-attention-authorized-projection.md) |
| 0051 | Human Control Plane authorized read models | Accepted | [`0051-human-control-plane-read-models.md`](./0051-human-control-plane-read-models.md) |
| 0052 | Human Control Plane information architecture | Accepted | [`0052-human-control-plane-information-architecture.md`](./0052-human-control-plane-information-architecture.md) |
| 0053 | Human Attention governed responses | Accepted | [`0053-human-attention-governed-responses.md`](./0053-human-attention-governed-responses.md) |
| 0054 | Causal Agent Run explanation | Accepted | [`0054-causal-agent-run-explanation.md`](./0054-causal-agent-run-explanation.md) |
| 0055 | Governed Agent Session controls | Accepted | [`0055-governed-agent-session-controls.md`](./0055-governed-agent-session-controls.md) |
| 0056 | Work Item execution and decision workspace | Accepted | [`0056-work-item-execution-workspace.md`](./0056-work-item-execution-workspace.md) |
| 0057 | Actionable collaboration queues and contextual threads | Accepted | [`0057-actionable-collaboration-queues.md`](./0057-actionable-collaboration-queues.md) |
| 0058 | Authorized Recovery and freshness projection | Accepted | [`0058-authorized-recovery-and-freshness-projection.md`](./0058-authorized-recovery-and-freshness-projection.md) |
| 0059 | Canonical navigation and Evidence Drawer | Accepted | [`0059-canonical-navigation-and-evidence-drawer.md`](./0059-canonical-navigation-and-evidence-drawer.md) |
| 0060 | Optional Graph integration boundary | Accepted | [`0060-optional-graph-integration-boundary.md`](./0060-optional-graph-integration-boundary.md) |
| 0061 | Human Control Plane final acceptance and product telemetry | Accepted | [`0061-human-control-plane-final-acceptance-and-telemetry.md`](./0061-human-control-plane-final-acceptance-and-telemetry.md) |
| 0062 | Autonomous control plane and Agent lifecycle | Accepted | [`0062-autonomous-control-plane-and-agent-lifecycle.md`](./0062-autonomous-control-plane-and-agent-lifecycle.md) |
| 0063 | Multica-inspired authority-first Human-Agent workspace | Accepted | [`0063-multica-inspired-authority-first-human-agent-workspace.md`](./0063-multica-inspired-authority-first-human-agent-workspace.md) |
| 0064 | Unified Human Control Plane Web experience | Accepted | [`0064-unified-human-control-plane-web-experience.md`](./0064-unified-human-control-plane-web-experience.md) |
| 0065 | Prototype Web UI, Pi Workbench, and user-configured LLM connections | Proposed | [`0065-prototype-web-pi-workbench-and-llm-connections.md`](./0065-prototype-web-pi-workbench-and-llm-connections.md) |
| 0066 | Versioned Project and Issue Documents | Accepted | [`0066-versioned-project-and-issue-documents.md`](./0066-versioned-project-and-issue-documents.md) |
| 0067 | Governed WorkMesh Tools for Pi Runner | Accepted | [`0067-governed-pi-workmesh-tools.md`](./0067-governed-pi-workmesh-tools.md) |
| 0068 | Atomic Workbench Turn and Agent Session Completion | Accepted | [`0068-atomic-workbench-turn-session-completion.md`](./0068-atomic-workbench-turn-session-completion.md) |
| 0069 | Embedded Pi Workbench Skill pin | Accepted for W12 partial implementation; public Skill release remains open. | [`0069-embedded-pi-workbench-skill-pin.md`](./0069-embedded-pi-workbench-skill-pin.md) |
| 0070 | Artifact storage on RustFS and header-signed uploads | Accepted | [`0070-artifact-storage-on-rustfs-and-header-signed-uploads.md`](./0070-artifact-storage-on-rustfs-and-header-signed-uploads.md) |
| 0071 | Lite single-node self-hosted deployment class | Proposed | [`0071-lite-single-node-self-hosted-deployment.md`](./0071-lite-single-node-self-hosted-deployment.md) |
| 0072 | Redis-free and object-store-free runtime profiles, and the SQLite assessment | Proposed | [`0072-redis-free-and-object-store-free-runtime-profiles.md`](./0072-redis-free-and-object-store-free-runtime-profiles.md) |
| 0073 | A Human-ordered position within a status column | Proposed | [`0073-human-ordered-position-within-a-status-column.md`](./0073-human-ordered-position-within-a-status-column.md) |
| 0074 | Workspace configuration readiness check and the first-run surface | Proposed | [`0074-workspace-configuration-readiness-check-and-first-run-surface.md`](./0074-workspace-configuration-readiness-check-and-first-run-surface.md) |
| 0075 | Verifiable and simplified agent connection onboarding | Proposed | [`0075-verifiable-and-simplified-agent-connection-onboarding.md`](./0075-verifiable-and-simplified-agent-connection-onboarding.md) |
| 0076 | China-ecosystem ingress, channel delivery contract, and model presets | Proposed | [`0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md`](./0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md) |
| 0077 | Reference-derived visual system, card anatomy, and workbench layout | Proposed | [`0077-reference-derived-visual-system-and-workbench-layout.md`](./0077-reference-derived-visual-system-and-workbench-layout.md) |

## 标记了继承/扩展关系的新 ADR

- `0018` Provider abstraction, webhook verification, and recovery — `0018-provider-abstraction-webhook-recovery.md`
- `0029` Rich-content sanitization and editor boundary — `0029-rich-content-sanitization-and-editor-boundary.md`
- `0050` Human Attention authorized projection — `0050-human-attention-authorized-projection.md`
- `0058` Authorized Recovery and freshness projection — `0058-authorized-recovery-and-freshness-projection.md`
- `0063` Multica-inspired authority-first Human-Agent workspace — `0063-multica-inspired-authority-first-human-agent-workspace.md`
- `0067` Governed WorkMesh Tools for Pi Runner — `0067-governed-pi-workmesh-tools.md`
- `0071` Lite single-node self-hosted deployment class — `0071-lite-single-node-self-hosted-deployment.md`
- `0075` Verifiable and simplified agent connection onboarding — `0075-verifiable-and-simplified-agent-connection-onboarding.md`
- `0077` Reference-derived visual system, card anatomy, and workbench layout — `0077-reference-derived-visual-system-and-workbench-layout.md`

---

格式约定见根目录 `AGENTS.md`：
`# Title` → `Status` → `Context` → `Decision` → `Alternatives` → `Consequences` → `Migration` → `Spec changes`。

新增 ADR 触发条件：改动核心不变量、服务边界、持久化/事件语义、协议行为、
安全策略或主要依赖。
