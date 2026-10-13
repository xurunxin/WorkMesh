# 准确主线源码与 Git 回执

基线 `104f7afb8e89859549aa16af7a3114e90dea7f9b`。只读操作，无 fetch、分支切换、锁删除或远端写入。

## `git ls-remote origin refs/heads/main`

```text
104f7afb8e89859549aa16af7a3114e90dea7f9b	refs/heads/main
```

## `git show -s --format=%H%n%P%n%T%n%s 104f7afb8e89859549aa16af7a3114e90dea7f9b`

```text
104f7afb8e89859549aa16af7a3114e90dea7f9b
f6faf54f80850ecee9118d87401e6b5ce73216f1 fff06af6ccb99c24a62035f418e850914f37a712
7b30bc971748a0b3ebc5505bd9dd83fba9521275
Merge pull request #225 from xurunxin/tds/conv-01a12fd9-e1d0-76a4-aae1-e6b7869c6947
```

## `git log 104f7afb8e89859549aa16af7a3114e90dea7f9b --first-parent -24 --format=%H %s`

```text
104f7afb8e89859549aa16af7a3114e90dea7f9b Merge pull request #225 from xurunxin/tds/conv-01a12fd9-e1d0-76a4-aae1-e6b7869c6947
f6faf54f80850ecee9118d87401e6b5ce73216f1 Merge pull request #224 from xurunxin/tds/conv-01a12c00-1787-7983-b548-6aa804602e54
abf6813a439feab4b17b0602cc9295216634586e Merge pull request #223 from xurunxin/tds/conv-01a12dcd-2746-75df-b468-8c4022c5a933
9dcc8c4c469997626ebb62fc12b8f8e7c1551dc0 Merge pull request #222 from xurunxin/tds/conv-01a12c22-01d6-7eb1-a3c1-592edda7d055
f2591a3bebeca9640b0d828ac3ad07fb5daf8e3c Merge pull request #221 from xurunxin/tds/conv-01a12a8e-cadc-7c05-a07a-1d6a77c8f64c
20fb7358f6c6818a452e78c1fd3da096cdc31286 Merge pull request #220 from xurunxin/tds/conv-01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5
6a06ce338f90bf16ce27e3cca1a76771eba42e6e Merge pull request #219 from xurunxin/tds/conv-01a127d4-e047-7e57-81c2-3d054851fc88
c2b3d363c037157df13beb82799d99d07a9b7db8 Merge pull request #218 from xurunxin/tds/conv-01a1264e-bd35-76d4-b328-03e9b91301f3
996c940eb6c725fdfe408976ff9570997d1d5bdb Merge pull request #217 from xurunxin/tds/conv-01a12766-4132-7d8c-a542-dcbfb2008b49
2da4918682f5238499131cff2c71ab465fcc080e Merge pull request #216 from xurunxin/tds/conv-01a126be-7aba-7b1d-a57a-f58317f89a67
87f88b89297c5c1e346f7ef99118c410f4b4a905 Merge pull request #215 from xurunxin/tds/conv-01a1246e-406c-7593-ada6-66996634434b
ef4cb5e1458d911d98433c443dba46e6c224caa0 Merge pull request #214 from xurunxin/tds/conv-01a121fb-781b-7b58-9bca-a596b92a8cbe
cfce77546b64c2a8d7d12949261c38e2f666d5ae Merge pull request #213 from xurunxin/tds/conv-01a12031-e9de-75c4-ab40-b44affcd71f6
e49eda142d61bdd248ddc42ec16f5563abd4bbc6 Merge pull request #212 from xurunxin/tds/conv-01a11ed4-1e73-7802-8bf8-4899c5405f61
69085317c88d84b702af727dc0ac7152589626d8 Merge pull request #211 from xurunxin/tds/conv-01a11b27-cfac-7ea4-a461-8eef51b750fe
add4340e9c52575c2fd9615b3b114ac9acd3e30e Merge pull request #210 from xurunxin/tds/conv-01a11b85-41f9-74f5-b456-7083d4d83e5e
c768e1e3db297d8b91b53dd68b60e723a8a40e7d Merge pull request #209 from xurunxin/tds/conv-01a11e5e-9e0c-704b-a590-3fee492f4f6a
74f247f9240eaf21e74ef248f71a445c1d4276d7 Merge pull request #208 from xurunxin/tds/conv-01a11acb-1a68-7fba-a359-7119603cde7d
18252ba8761aa810c3fd12d31ecae83e8b24d985 Merge pull request #207 from xurunxin/tds/conv-01a11890-f4de-7106-b64d-e1b2c0d4608e
5b9c76b5f79917697906520edcd6947bfbfa925f Merge pull request #206 from xurunxin/tds/conv-01a1187a-f0f0-76d8-8f5b-b954ee399cdc
96e724858e692d262107c34db50b40c3ae7c122c Merge pull request #205 from xurunxin/tds/conv-01a11ac2-7634-752e-8d81-764c9776f801
1078bbcd527550bfabee73093b7ffd0032d3fd24 Merge pull request #204 from xurunxin/tds/conv-01a1187a-f4ff-735d-814f-a7b26f8cfdc5
9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7 Merge pull request #203 from xurunxin/tds/conv-01a116f8-8172-7082-8d61-867bd9f0b749
5743f027ec86e8726d2cfdd38e0e038bdebeae49 fix(ci): complete static cache inputs and bound browser preparation (#202)
```

## `git ls-tree 104f7afb8e89859549aa16af7a3114e90dea7f9b docs/plan/2026-10-08-todos-functional-alignment.md docs/plan/todos-alignment-20261008`

```text
```

## `git log --all --format=%H %s -- docs/plan/2026-10-08-todos-functional-alignment.md docs/plan/todos-alignment-20261008`

```text
```

## 产品文件指纹

可达文件不代表组合实测通过。工作树字节保留 Windows 行尾差异。

| 文件 | Git blob／Git 字节 SHA-256 | 工作树字节 SHA-256 |
| --- | --- | --- |
| [CONTEXT.md](../../../../../CONTEXT.md) | `c6b6544e2c80ebb207bceb19eb45b48ff5855ac6`<br>`d67c4bb38a57877354e8968747ad0ed3890108cb81feca53e24af97a4593f238` | `d67c4bb38a57877354e8968747ad0ed3890108cb81feca53e24af97a4593f238` |
| [AGENT_PROTOCOL.md](../../../../../AGENT_PROTOCOL.md) | `8c64e53d6968250a63bd6107b7b646d8b99e85cc`<br>`31d8d78e79404d8f2199c686aec4294c0d4a73e7d46ece282725c42e38bbe563` | `31d8d78e79404d8f2199c686aec4294c0d4a73e7d46ece282725c42e38bbe563` |
| [OPENAPI.yaml](../../../../../OPENAPI.yaml) | `01b63733c9314efe1551d676c315ea8cb9377bc1`<br>`9bb63b5952ce400b71b5a028027b7fec086147bf909030c2e44a634b3460f57a` | `9bb63b5952ce400b71b5a028027b7fec086147bf909030c2e44a634b3460f57a` |
| [SCHEMA.sql](../../../../../SCHEMA.sql) | `6b4d99d910c7db0a6547bf7e4cf88c38ea01c563`<br>`3836495ed9355c19262de2eca2a0f0a02b9ca85e7d7bbc21b11aacd30784dd08` | `3836495ed9355c19262de2eca2a0f0a02b9ca85e7d7bbc21b11aacd30784dd08` |
| [package.json](../../../../../package.json) | `11ef0758a7c9fc89950fbd4afd25e419d7006652`<br>`a324b78823983f90dbd8ce68bf8213c28a121fb879d74c9f8a2e28385758c0de` | `a324b78823983f90dbd8ce68bf8213c28a121fb879d74c9f8a2e28385758c0de` |
| [scripts/ci-policy.mjs](../../../../../scripts/ci-policy.mjs) | `4c766592c8100edf432823c16305fe40be49e928`<br>`ab8682ea043968a11960bd5855f61add89fff9049ba92eec3b10326264819537` | `ab8682ea043968a11960bd5855f61add89fff9049ba92eec3b10326264819537` |
| [scripts/check-integration-docs.mjs](../../../../../scripts/check-integration-docs.mjs) | `674a871125083b6696910e66139a26e9b5803d94`<br>`86868ff4e67e5251cce2457048ad94d68bd7a3dbe2fc7e6daf0c0a134f5ea89d` | `86868ff4e67e5251cce2457048ad94d68bd7a3dbe2fc7e6daf0c0a134f5ea89d` |
| [packages/db/src/schema.ts](../../../../../packages/db/src/schema.ts) | `200df9f3c7c1a7c39a196946c3fe9f2dba4f0e7b`<br>`ea3ffdb43264576b5bf938815b7d6418843bca207b2a24705f536d790d75bc08` | `ea3ffdb43264576b5bf938815b7d6418843bca207b2a24705f536d790d75bc08` |
| [packages/contracts/src/index.ts](../../../../../packages/contracts/src/index.ts) | `6e8dc2957068d06667f0a4a634e46527f88e9c73`<br>`2606cd728ecb24335818f663f4230130490f825e49769e8677f73dfd5acca9ad` | `2606cd728ecb24335818f663f4230130490f825e49769e8677f73dfd5acca9ad` |
| [packages/contracts/src/agent-discovery.ts](../../../../../packages/contracts/src/agent-discovery.ts) | `e49e9a3f55cd9c445ab6d47794d8ed3885e17ffc`<br>`171c6625ea294162cd8f19cac023aeeed5bb3acfc6a53903308afe885a0e4334` | `171c6625ea294162cd8f19cac023aeeed5bb3acfc6a53903308afe885a0e4334` |
| [packages/contracts/src/agent-discovery-rules.ts](../../../../../packages/contracts/src/agent-discovery-rules.ts) | `6b73ac8e88ad47adbb8956b32fb551a1604c5173`<br>`2fb3f51f86190aac7e4816cb09ca29a3cc20fa55c26fd4782e6e0a7b84c1dd60` | `2fb3f51f86190aac7e4816cb09ca29a3cc20fa55c26fd4782e6e0a7b84c1dd60` |
| [packages/domain/src/authorization.ts](../../../../../packages/domain/src/authorization.ts) | `03a101405a92263d10555cea94c8ea01289942ab`<br>`94c680b6f7ed884eba89e07ba9ff574091ca32043e80861532fec05d95d4f74e` | `94c680b6f7ed884eba89e07ba9ff574091ca32043e80861532fec05d95d4f74e` |
| [apps/api/src/agent/commands.ts](../../../../../apps/api/src/agent/commands.ts) | `642b961b54c436c0aff296fea3613eac092606c7`<br>`64766a3cf06dab503344939d9f28ed9c46076b0f17f2d4f81360abc0c2c44204` | `64766a3cf06dab503344939d9f28ed9c46076b0f17f2d4f81360abc0c2c44204` |
| [apps/api/src/authz/route-policy.ts](../../../../../apps/api/src/authz/route-policy.ts) | `08707b2731cbff510e51e136158a99bb26666cc6`<br>`e95e8f91af35542ff60fefe9132485306b36a20348a2e9a6bb8968ad5132ee64` | `e95e8f91af35542ff60fefe9132485306b36a20348a2e9a6bb8968ad5132ee64` |
| [apps/mcp/src/index.ts](../../../../../apps/mcp/src/index.ts) | `33d39762a8de98f0f71c286d03435ebded6ab503`<br>`0e4ce3f296b5368592ccdb9000facdc0381ae1879de2d6c0b2671b63cedb76cf` | `0e4ce3f296b5368592ccdb9000facdc0381ae1879de2d6c0b2671b63cedb76cf` |
| [apps/mcp/src/discovery.ts](../../../../../apps/mcp/src/discovery.ts) | `9084eaed52c4acc54f8c806a111197525b6de587`<br>`ac10ab24cc3080f254deb6396b60d7c16b66a3afb7b9c43927db740f984fc9b9` | `ac10ab24cc3080f254deb6396b60d7c16b66a3afb7b9c43927db740f984fc9b9` |
| [packages/agent-sdk/src/index.ts](../../../../../packages/agent-sdk/src/index.ts) | `749b0ebc33c14a88a6b0c795eff823a03935642f`<br>`edf8e70ed976fb79fd767d1d658858c2aa263f54ea6ab75945f8c32ec593fd5f` | `edf8e70ed976fb79fd767d1d658858c2aa263f54ea6ab75945f8c32ec593fd5f` |
| [apps/agent-runner/src/workmesh-tools.ts](../../../../../apps/agent-runner/src/workmesh-tools.ts) | `6691afc7ba6e1657f61b8b9fcef45cb6aa66a9f9`<br>`4953952d676db10eb41432861a724340264e49d5f7866ce5d9283084f82723af` | `4953952d676db10eb41432861a724340264e49d5f7866ce5d9283084f82723af` |
| [apps/agent-runner/src/run-session.ts](../../../../../apps/agent-runner/src/run-session.ts) | `6777938c8f7c14802b7be07aab34cc0e7cea3374`<br>`ec242238ff5317d1ff571fc12c91b6066a2bbeb25d7768525f48c07efa5a2d2a` | `ec242238ff5317d1ff571fc12c91b6066a2bbeb25d7768525f48c07efa5a2d2a` |
| [apps/agent-runner/src/execution-lifecycle.ts](../../../../../apps/agent-runner/src/execution-lifecycle.ts) | `0172824637cf6fac5f8eb3bd5aeedad647a901b9`<br>`cc6e9da653a2d83dbafaab923bdbb41f7e296707f8305fb573ddd361a28a2f03` | `cc6e9da653a2d83dbafaab923bdbb41f7e296707f8305fb573ddd361a28a2f03` |
| [packages/git-provider/src/index.ts](../../../../../packages/git-provider/src/index.ts) | `2bcbc20ccab8cdb6b9fc9f0de4d027f12191ba8c`<br>`55b9c5245b39d547b252f19a04fe2a8469851541fcc63033ab848a2d11302d3d` | `55b9c5245b39d547b252f19a04fe2a8469851541fcc63033ab848a2d11302d3d` |
| [apps/worker/src/provider-actions.ts](../../../../../apps/worker/src/provider-actions.ts) | `e02cdf4768e69f6d3fe2de315a2f98d2b4f78b6f`<br>`d74000b9884bb5856b98eaf44fa8efe30419ace4bf6bfdf3db07b7014ba0fae1` | `d74000b9884bb5856b98eaf44fa8efe30419ace4bf6bfdf3db07b7014ba0fae1` |
| [apps/worker/src/automation.ts](../../../../../apps/worker/src/automation.ts) | `86957737be3e756d7c988f28120b188f356c56fe`<br>`87dc3408592241cca5d1cadf4282b2fee9694026c6d70d3180233936bec3f394` | `87dc3408592241cca5d1cadf4282b2fee9694026c6d70d3180233936bec3f394` |
| [apps/api/src/workbench-conversations.ts](../../../../../apps/api/src/workbench-conversations.ts) | `7d77eec3984728be59bffe43a2738bfb6edef909`<br>`8a8a98ac1c1deebca96b1ad53a8c097f92a34c1b223fad6fbfa9100ef89102f4` | `8a8a98ac1c1deebca96b1ad53a8c097f92a34c1b223fad6fbfa9100ef89102f4` |
| [apps/api/src/workbench-runner.ts](../../../../../apps/api/src/workbench-runner.ts) | `2d2dc515f3ed8db97b001b84309b3d52122278eb`<br>`9ceda3fa3f3d0daf931c749495fe597ba834c0718857c204f33178180a8a923e` | `9ceda3fa3f3d0daf931c749495fe597ba834c0718857c204f33178180a8a923e` |
| [apps/api/src/workbench-llm-connections.ts](../../../../../apps/api/src/workbench-llm-connections.ts) | `e682d4fe74a382547611dda0ccab9b6f302a55ff`<br>`e8a91e6e169bc7f2d9dcd2080cc050ebee87d73d6b768f729fe81d4f5ccc3ba0` | `e8a91e6e169bc7f2d9dcd2080cc050ebee87d73d6b768f729fe81d4f5ccc3ba0` |
| [packages/config/src/index.ts](../../../../../packages/config/src/index.ts) | `79ecc76cd2cc164ff8e01550f1a82d483e7cb023`<br>`4983be8413442ba94de69c16771c784c04461e9f5cfb4845bf535531703a85d2` | `4983be8413442ba94de69c16771c784c04461e9f5cfb4845bf535531703a85d2` |
| [packages/artifact-storage/src/index.ts](../../../../../packages/artifact-storage/src/index.ts) | `9055ad59ccd728951b9ad7d7c1beb1449496d6fe`<br>`199e8e0ec003062a3fa573b9746b07e7ec56943af731bb58daeeeaa42ec3a376` | `199e8e0ec003062a3fa573b9746b07e7ec56943af731bb58daeeeaa42ec3a376` |
| [packages/domain/src/session-budget.ts](../../../../../packages/domain/src/session-budget.ts) | `7514e84cd2f9bc14287f441e6faf6d3e57582b83`<br>`603e4b012894ac5b3cd69b63c1b7b753ba8ab97b263d5ff33c5b457b949fa8a1` | `603e4b012894ac5b3cd69b63c1b7b753ba8ab97b263d5ff33c5b457b949fa8a1` |
| [docs/skills/zh-tech-writing/source.json](../../../../../docs/skills/zh-tech-writing/source.json) | `230fe627c6c1e9c12f817ce58a6829d02f383e9a`<br>`c4fcb08cd6e65a95a15b03b8ce70897414b42b03ebded3880eb17eb57b785676` | `c4fcb08cd6e65a95a15b03b8ce70897414b42b03ebded3880eb17eb57b785676` |

## ADR 当前状态

按实际文件读取，未使用过时 README 状态统计。实现或卡 Done 不倒填 Accepted。UI 历史状态保留，当前范围按 ADR 0087。

| ADR | 原 Status 附近文本／blob |
| --- | --- |
| [0001-monorepo-runtime-split.md](../../../../../docs/adr/0001-monorepo-runtime-split.md) | Accepted<br>`2ffd88783309df50da8a76cbe8b37c46f4d689ce` |
| [0002-rest-sse.md](../../../../../docs/adr/0002-rest-sse.md) | Accepted<br>`39975e9a8c6087e8052d10a7623d1e49602f34e7` |
| [0003-postgresql-transaction-outbox.md](../../../../../docs/adr/0003-postgresql-transaction-outbox.md) | Accepted<br>`a12d8990dd423245198f9a680c0c3ea07e98e9de` |
| [0004-actor-model.md](../../../../../docs/adr/0004-actor-model.md) | Accepted<br>`43854ec7fe0f0dbcf945da0373b0e8db4a4c0467` |
| [0005-authentication-choice.md](../../../../../docs/adr/0005-authentication-choice.md) | Accepted<br>`f364ef4ac701272a9e99c3afe55df929db2bf808` |
| [0006-stage0-authorization-and-event-scope.md](../../../../../docs/adr/0006-stage0-authorization-and-event-scope.md) | Accepted<br>`e60141cb75f5eb8daccd6aebd5b891a74f8ae8ce` |
| [0007-redis-outbox-delivery.md](../../../../../docs/adr/0007-redis-outbox-delivery.md) | Accepted<br>`2027d6866f6c6612a9332c253a5c476f797cf55b` |
| [0008-agent-session-token-revocation.md](../../../../../docs/adr/0008-agent-session-token-revocation.md) | Accepted<br>`bfe71633629746d09f99bd034b077a35bfac5822` |
| [0009-agent-session-transition-table.md](../../../../../docs/adr/0009-agent-session-transition-table.md) | Accepted<br>`20fca408100ef54aacc5d3e337fe0c8622e4b64c` |
| [0010-agent-activity-immutability-and-redaction.md](../../../../../docs/adr/0010-agent-activity-immutability-and-redaction.md) | Accepted<br>`c327215d639abdb42a38a72bd5d92a12955ac90b` |
| [0011-agent-plan-versioning-and-conflict.md](../../../../../docs/adr/0011-agent-plan-versioning-and-conflict.md) | Accepted<br>`e676ad5c21c87d00a8d976f2719a7d6c5c4fe070` |
| [0012-mcp-domain-boundary.md](../../../../../docs/adr/0012-mcp-domain-boundary.md) | Accepted<br>`f9a0719a326538023e462e546a2f5ef869fa8dd6` |
| [0013-lease-semantics.md](../../../../../docs/adr/0013-lease-semantics.md) | Accepted<br>`4dff7bd367d37e5545053f2c087c2b0983b0050a` |
| [0014-handoff-transaction.md](../../../../../docs/adr/0014-handoff-transaction.md) | Accepted<br>`812ae9ebf89251c36db122d4159c58ba5dc129eb` |
| [0015-agent-routing.md](../../../../../docs/adr/0015-agent-routing.md) | Accepted<br>`1ff38d18995699112b149bdac46feee6d61f67ce` |
| [0016-work-room-projection.md](../../../../../docs/adr/0016-work-room-projection.md) | Accepted<br>`720011a4bab1b7ca5b9d20152f2ac3889f459b4a` |
| [0017-parent-child-completion-policy.md](../../../../../docs/adr/0017-parent-child-completion-policy.md) | Accepted<br>`de45cb4c3ff1a392dfb8fca96306ffedd73d799a` |
| [0018-provider-abstraction-webhook-recovery.md](../../../../../docs/adr/0018-provider-abstraction-webhook-recovery.md) | Accepted<br>`9b499ffdf5a06f4376228d2db1d4c95fa846ef67` |
| [0019-repository-context-and-agents-scope.md](../../../../../docs/adr/0019-repository-context-and-agents-scope.md) | Accepted<br>`668316d34cd4357982eb8841032c6dc9d60fc210` |
| [0020-exact-head-pull-request-approval.md](../../../../../docs/adr/0020-exact-head-pull-request-approval.md) | Accepted<br>`26495e0a45229cea02610ae98e46ecb7e04c981f` |
| [0021-artifact-upload-and-provenance.md](../../../../../docs/adr/0021-artifact-upload-and-provenance.md) | Accepted<br>`dfd2e986835c5b363eec2415394e5dcba07f86b7` |
| [0022-completion-suggestion-and-project-progress.md](../../../../../docs/adr/0022-completion-suggestion-and-project-progress.md) | Accepted<br>`966b29d8c5ae22f79abd1367d752e9aa48f5b287` |
| [0023-automation-versioning-and-effect-execution.md](../../../../../docs/adr/0023-automation-versioning-and-effect-execution.md) | Accepted for Stage 4.<br>`f678e20b48c246e1470d04614e1b615e9acb2299` |
| [0024-loop-admission-overlap-and-retry.md](../../../../../docs/adr/0024-loop-admission-overlap-and-retry.md) | Accepted for Stage 4.<br>`e64a2d8060ac506b9690cb9ae64471916e75cff3` |
| [0025-source-linked-project-forecast.md](../../../../../docs/adr/0025-source-linked-project-forecast.md) | Accepted for Stage 4.<br>`29503b301ad132ccd95889bad0b7d68566691be0` |
| [0026-usage-and-cost-normalization.md](../../../../../docs/adr/0026-usage-and-cost-normalization.md) | Accepted for Stage 4.<br>`b7918f41e5e36210ff673d428435831230f99e44` |
| [0027-a2a-version-boundary.md](../../../../../docs/adr/0027-a2a-version-boundary.md) | Accepted for Stage 4.<br>`da84d8e51f0ee08bf6b9c3edb97c420947461260` |
| [0028-declarative-route-policy-and-event-audience.md](../../../../../docs/adr/0028-declarative-route-policy-and-event-audience.md) | Accepted<br>`250f6580b7a536196c8560d7d98899484a91696e` |
| [0028-kaneo-frontend-architecture-and-dependency-policy.md](../../../../../docs/adr/0028-kaneo-frontend-architecture-and-dependency-policy.md) | Accepted<br>`62b990aac7d68e0737a7ca4f23b6d5c2939ea7e8` |
| [0029-rich-content-sanitization-and-editor-boundary.md](../../../../../docs/adr/0029-rich-content-sanitization-and-editor-boundary.md) | Proposed, revision 2, for the repaired GEN-9 contract Gate. Implementation remains blocked until an independent Gate accepts the machine contract. No editor dependency is selected in this slice.<br>`d4d95409f30820d0fff6427e8b74962fa78b8b4a` |
| [0029-secret-aware-authentication-idempotency.md](../../../../../docs/adr/0029-secret-aware-authentication-idempotency.md) | Accepted.<br>`fed737f236984bfb171046fe2afe7a79c74bfc9a` |
| [0030-shared-authentication-rate-limits.md](../../../../../docs/adr/0030-shared-authentication-rate-limits.md) | Accepted.<br>`b6be135cf8c8ec43d420912b5267b0e8396cef7b` |
| [0031-authenticated-single-use-bootstrap.md](../../../../../docs/adr/0031-authenticated-single-use-bootstrap.md) | Accepted.<br>`76f322c61dc1f833c5ba9f59d5d11f2efa3de920` |
| [0032-signed-keyset-pagination.md](../../../../../docs/adr/0032-signed-keyset-pagination.md) | Accepted<br>`90dc653dfb9398364d7626800b0981564c26d751` |
| [0033-postgres-authoritative-realtime-replay.md](../../../../../docs/adr/0033-postgres-authoritative-realtime-replay.md) | Accepted<br>`af861f34c179ccc1b6dc579bcc615b4a05464327` |
| [0034-production-runtime-images.md](../../../../../docs/adr/0034-production-runtime-images.md) | Accepted<br>`50be9941752f1bb2049cc3ee518741bb1f37a302` |
| [0035-retention-archive-and-heartbeat-projections.md](../../../../../docs/adr/0035-retention-archive-and-heartbeat-projections.md) | Accepted<br>`c0a51a1289923b0d9d5fb78f4bfdefbf9ba1cd3e` |
| [0036-exact-archive-membership.md](../../../../../docs/adr/0036-exact-archive-membership.md) | Accepted<br>`0267132783bc6675f5c17062c27a91605c39bc65` |
| [0037-agent-inbox-recipients-claims-and-receipts.md](../../../../../docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md) | Accepted<br>`bc5e363348525c1adadc616590f5ce96c60982c3` |
| [0038-atomic-checksummed-v1-migrations.md](../../../../../docs/adr/0038-atomic-checksummed-v1-migrations.md) | Accepted<br>`fe08050353b30de8a4efb8f69567bf024c599ac5` |
| [0039-authenticated-complete-recovery-bundles.md](../../../../../docs/adr/0039-authenticated-complete-recovery-bundles.md) | Accepted<br>`d668adaa61e50092fd5d1dfa1e7a65d4540288d5` |
| [0040-transactional-active-executor-projection.md](../../../../../docs/adr/0040-transactional-active-executor-projection.md) | Accepted<br>`9981b8317fdb93e823f08dd40d06d8ccf2bc10aa` |
| [0041-versioned-guidance-and-context-pinning.md](../../../../../docs/adr/0041-versioned-guidance-and-context-pinning.md) | Accepted<br>`1e4a9afef01fb517912f9efeade09e6f590bde44` |
| [0042-agent-client-profile-and-derived-capability-manifest.md](../../../../../docs/adr/0042-agent-client-profile-and-derived-capability-manifest.md) | Accepted<br>`5ad4e5434603fe83555cda3df4e6f507f51d8f7a` |
| [0043-agent-connection-and-coordination-mcp.md](../../../../../docs/adr/0043-agent-connection-and-coordination-mcp.md) | Accepted for v1.1 (Agent-first coordination).<br>`c57ff2216307a7c21940dd9fc0278954489f30cf` |
| [0044-structured-planning-domain-parity.md](../../../../../docs/adr/0044-structured-planning-domain-parity.md) | Accepted<br>`2c53ac07cfc9493963011b219f5d88b74e093744` |
| [0045-webui-redesign-i18n-theme-unification.md](../../../../../docs/adr/0045-webui-redesign-i18n-theme-unification.md) | Proposed<br>`68abe4588d1257ad0ece6b7807e06a0ec5d15d0b` |
| [0046-agent-connection-recovery-and-execution-capacity.md](../../../../../docs/adr/0046-agent-connection-recovery-and-execution-capacity.md) | Accepted<br>`81f20d769bc2040f8d7de986bc91a5bc0f12d8e5` |
| [0047-agent-task-admission-and-forced-delegation.md](../../../../../docs/adr/0047-agent-task-admission-and-forced-delegation.md) | Accepted for implementation.<br>`50419b6291efddc8eabbd754bc6dbd3ce108e030` |
| [0048-stale-self-claim-recovery.md](../../../../../docs/adr/0048-stale-self-claim-recovery.md) | Accepted<br>`dcc2aa14ad3b060eec0394b4894adf51d3e0de8c` |
| [0049-terminal-only-self-claim-recovery.md](../../../../../docs/adr/0049-terminal-only-self-claim-recovery.md) | Accepted<br>`54e336506bd2853e71087364d38a16c8de2a5403` |
| [0050-human-attention-authorized-projection.md](../../../../../docs/adr/0050-human-attention-authorized-projection.md) | Accepted<br>`7ddad5687de2d8cd02aece2a1242ee85307997ed` |
| [0051-human-control-plane-read-models.md](../../../../../docs/adr/0051-human-control-plane-read-models.md) | Accepted<br>`c3a0a9b23b79183fae7ebc6bf892de1f1390719a` |
| [0052-human-control-plane-information-architecture.md](../../../../../docs/adr/0052-human-control-plane-information-architecture.md) | Accepted<br>`cecf4709f229b60bdc171a82a13ad5add21198b3` |
| [0053-human-attention-governed-responses.md](../../../../../docs/adr/0053-human-attention-governed-responses.md) | Accepted<br>`6459e59f1b94c1df069bc6b435fc20fd4720c538` |
| [0054-causal-agent-run-explanation.md](../../../../../docs/adr/0054-causal-agent-run-explanation.md) | Accepted<br>`a55f0dcd3cc08d37ca12a0d0975a33f50b179e3a` |
| [0055-governed-agent-session-controls.md](../../../../../docs/adr/0055-governed-agent-session-controls.md) | Accepted<br>`08834e00284b492769c1a475c604155dda7f8547` |
| [0056-work-item-execution-workspace.md](../../../../../docs/adr/0056-work-item-execution-workspace.md) | Accepted<br>`6118c8b6ad2b9df93ef632099879194b810d7c15` |
| [0057-actionable-collaboration-queues.md](../../../../../docs/adr/0057-actionable-collaboration-queues.md) | Accepted<br>`3775663746bd3a812f242e49f0971ee4eed85c21` |
| [0058-authorized-recovery-and-freshness-projection.md](../../../../../docs/adr/0058-authorized-recovery-and-freshness-projection.md) | Accepted<br>`c404428a9d77135607c0b397cac8fb1303b94027` |
| [0059-canonical-navigation-and-evidence-drawer.md](../../../../../docs/adr/0059-canonical-navigation-and-evidence-drawer.md) | Accepted<br>`77159f3bded074617f9ad6cb5f34e5f61414d180` |
| [0060-optional-graph-integration-boundary.md](../../../../../docs/adr/0060-optional-graph-integration-boundary.md) | Accepted<br>`00ee9dfb882beefa9bc1a5149dd89dea619863b0` |
| [0061-human-control-plane-final-acceptance-and-telemetry.md](../../../../../docs/adr/0061-human-control-plane-final-acceptance-and-telemetry.md) | Accepted<br>`b7a55fd8fe453ae939bad75308e27f99bd4ce6da` |
| [0062-autonomous-control-plane-and-agent-lifecycle.md](../../../../../docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md) | Accepted<br>`c014760b7d8d03d1ca30b81b662e371d13370ec4` |
| [0063-multica-inspired-authority-first-human-agent-workspace.md](../../../../../docs/adr/0063-multica-inspired-authority-first-human-agent-workspace.md) | Accepted<br>`65609aa810b9c0869e95720d92ea52b5b0d46708` |
| [0064-unified-human-control-plane-web-experience.md](../../../../../docs/adr/0064-unified-human-control-plane-web-experience.md) | Accepted<br>`de55fdb6653a9a223bd991be5ae8348957a09a15` |
| [0065-prototype-web-pi-workbench-and-llm-connections.md](../../../../../docs/adr/0065-prototype-web-pi-workbench-and-llm-connections.md) | Proposed — 2026-09-24. 本 ADR 是实施路线图的设计输入。W01 已完成兼容性 Spike（5/5 通过）、Node 基线升级与传输契约冻结，钉住结果见下文"W01 验证结果与钉住基线"；实现版本以此为准。W07–W10 与 W13 的纵向路径正在实装，尚未满足整项路线图的发布门槛。<br>`b7ae31353dbf05d0ca5191c3d84e62820177aecf` |
| [0066-versioned-project-and-issue-documents.md](../../../../../docs/adr/0066-versioned-project-and-issue-documents.md) | Accepted — 2026-09-25. Implements W06 of docs/plan/2026-09-24-prototype-pi-agent-workbench.md under GitHub issue #128. The isolated Docker stage tracks this ADR in Project f5884215-8b1c-48bb-9b7f-717fa9994cd5 and WorkItem 900<br>`796cdee05bd67937f580696b9513725ae494a194` |
| [0067-governed-pi-workmesh-tools.md](../../../../../docs/adr/0067-governed-pi-workmesh-tools.md) | Accepted — 2026-09-25. This records the first W11 implementation slice. The remaining operation families stay open in W11. The isolated Docker WorkMesh tracks this ADR in Project 19a58123-88c7-4d5e-9bc7-619165bfc818 and WorkItem<br>`b80b176e8688c0269204a4f165e46a281c77fd6f` |
| [0068-atomic-workbench-turn-session-completion.md](../../../../../docs/adr/0068-atomic-workbench-turn-session-completion.md) | Accepted — 2026-09-25. W11 implementation; Docker test control plane Project 19a58123-88c7-4d5e-9bc7-619165bfc818, WorkItem ee2e9dbd-a657-47e5-8cb1-0b488df99ab3.<br>`ff826704199e38904d66b3875ec25b49e6210c6c` |
| [0069-embedded-pi-workbench-skill-pin.md](../../../../../docs/adr/0069-embedded-pi-workbench-skill-pin.md) | Accepted for W12 partial implementation; public Skill release remains open.<br>`234fc3b95629f858190653ba41918ab8930b53a1` |
| [0070-artifact-storage-on-rustfs-and-header-signed-uploads.md](../../../../../docs/adr/0070-artifact-storage-on-rustfs-and-header-signed-uploads.md) | Accepted<br>`011b906c23a593f2e95a29d7e39959afb3893b90` |
| [0071-lite-single-node-self-hosted-deployment.md](../../../../../docs/adr/0071-lite-single-node-self-hosted-deployment.md) | Proposed<br>`5309c6e3e4f78cdbe5846bac859e34cd9ff6ac6a` |
| [0072-redis-free-and-object-store-free-runtime-profiles.md](../../../../../docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md) | Proposed<br>`fbfb4c866a00d6541c51b17228fe5de715d934d5` |
| [0073-human-ordered-position-within-a-status-column.md](../../../../../docs/adr/0073-human-ordered-position-within-a-status-column.md) | Proposed<br>`a1dba01400d405b269d107d94e38ceb88779114b` |
| [0074-workspace-configuration-readiness-check-and-first-run-surface.md](../../../../../docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md) | Proposed<br>`63c3f0aa59402558fa03c5a5ad5e8f5342c79c6f` |
| [0075-verifiable-and-simplified-agent-connection-onboarding.md](../../../../../docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md) | Proposed<br>`b0bc283a676fbd80eea302bf0b0600102db309a0` |
| [0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md](../../../../../docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md) | Proposed<br>`9c6b4ccd48932edd0e12406b931e01c50aa2761c` |
| [0077-reference-derived-visual-system-and-workbench-layout.md](../../../../../docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md) | Proposed<br>`2f9d700414fc9f6701456a2ee921a8ac9726d07b` |
| [0078-designated-coordinating-chief-over-an-agent-graph.md](../../../../../docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md) | Proposed<br>`2fa6fcfc3862fd89bf72ea262fbddd038272c84b` |
| [0079-connector-local-security-and-commit.md](../../../../../docs/adr/0079-connector-local-security-and-commit.md) | Accepted（B1/B2 已审计划与实施授权范围；平台验证仍以实际结果为准）<br>`fa2e646b4273a6ecda06327d764306e4f7f45815` |
| [0079-qualified-agent-discovery-and-recovery.md](../../../../../docs/adr/0079-qualified-agent-discovery-and-recovery.md) | Proposed。受控方案已独审通过并获本轮实施指令；本 ADR 记录实现合同，保留独立合同复核及最终验收门禁。<br>`26cf2b41304385b3ddbfd45e192b6ea0d4b90807` |
| [0080-exact-session-execution-result-confirmation.md](../../../../../docs/adr/0080-exact-session-execution-result-confirmation.md) | Proposed。本轮为方案修订，未产品实施，须平台另一 Agent 完整独审两项 blocking 并由 Chief confirm。旧候选在 docs/plan/agent-mcp-m1/history 保全，旧错误证明不再作为当前合同。<br>`1d0df21b4f2e7301af84fde822fc49955725d291` |
| [0081-pi-execution-wait-continuation.md](../../../../../docs/adr/0081-pi-execution-wait-continuation.md) | Proposed。用户已裁定“结算等待，自动继续”；本 ADR 的wire/数据/锁序仍待另一 Agent 独审，不表示产品确认或验收。<br>`d3ca541a7fb4d290a40abb7415176acd65d4f08c` |
| [0082-parent-child-status-projection.md](../../../../../docs/adr/0082-parent-child-status-projection.md) | Accepted。规划候选独审三项 blocking 已闭合且无新增 blocking/high；按用户明确执行已审方案的指令实施。产品成果验收与规划审查分开。<br>`dff8f2efa43eb777cfebe3c0ac001211da5850be` |
| [0084-runner-tool-bounded-transport-replay.md](../../../../../docs/adr/0084-runner-tool-bounded-transport-replay.md) | Proposed。M5 方案独审已认可此合同；产品实现与运行结果另行验收。仅 Todos 与仓库记录。<br>`3c4573c88040e75a86b89d67bf4feee66afa9434` |
| [0085-mcp-original-execution-recovery-discovery.md](../../../../../docs/adr/0085-mcp-original-execution-recovery-discovery.md) | Proposed；本批已实施并有真实 OpenCode/REST 回归，待正式成果独审。不以本文件宣告 M5 验收。<br>`3aca66d052d458195318ea64df5edb06cbc18f11` |
| [0086-optional-agent-domain-read-projections.md](../../../../../docs/adr/0086-optional-agent-domain-read-projections.md) | Accepted（安全设计已获正式方案复审；产品成果仍待完整检查及 Chief 正式成果独审）。原规划候选与原 High(blocking) 保留于 审查回应，规划阶段的未测记录不改写。<br>`af59cc174b9d38e4b93dad22cda304c5e7f3eeb2` |
| [0087-backend-only-service.md](../../../../../docs/adr/0087-backend-only-service.md) | Accepted<br>`8202c7353da8602586ffd6879fb362f37818e495` |
| [0088-agent-connection-error-recovery.md](../../../../../docs/adr/0088-agent-connection-error-recovery.md) | Accepted（活动方案于 17:25 正式复审接受，Chief 于 17:26 单独放行产品修订；最终成果验收仍待独审及必需 CI）<br>`9ffd32f230575a0d9a5d3ae30496c9fc4caaeb8c` |
| [0089-connector-versioned-distribution.md](../../../../../docs/adr/0089-connector-versioned-distribution.md) | Proposed。用户本次已采用现有 hosted 双架构＋TCG 环境并放行产品实现；成果审查和全部产品验收尚待完成。历史研究不是产品批准。<br>`5b07b1da2711b3e6df0caa252d596170a3fec6af` |
