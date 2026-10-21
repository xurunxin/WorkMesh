# 不可变源码与来源指纹

## 源码绑定

固定基线：`c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。每行从该 Git 对象读取原 blob；本轮工作树对应文件与原 blob 经 Git clean 过滤后的内容一致。SHA-256 指 Git 原 blob 字节，不冒称 Windows CRLF 工作树逐字节相同。

| 路径 | Git blob | Git 原字节 SHA-256 |
| --- | --- | --- |
| `CONTEXT.md` | `c6b6544e2c80ebb207bceb19eb45b48ff5855ac6` | `d67c4bb38a57877354e8968747ad0ed3890108cb81feca53e24af97a4593f238` |
| `AGENT_PROTOCOL.md` | `8c64e53d6968250a63bd6107b7b646d8b99e85cc` | `31d8d78e79404d8f2199c686aec4294c0d4a73e7d46ece282725c42e38bbe563` |
| `OPENAPI.yaml` | `01b63733c9314efe1551d676c315ea8cb9377bc1` | `9bb63b5952ce400b71b5a028027b7fec086147bf909030c2e44a634b3460f57a` |
| `SCHEMA.sql` | `6b4d99d910c7db0a6547bf7e4cf88c38ea01c563` | `3836495ed9355c19262de2eca2a0f0a02b9ca85e7d7bbc21b11aacd30784dd08` |
| `package.json` | `11ef0758a7c9fc89950fbd4afd25e419d7006652` | `a324b78823983f90dbd8ce68bf8213c28a121fb879d74c9f8a2e28385758c0de` |
| `scripts/ci-policy.mjs` | `4c766592c8100edf432823c16305fe40be49e928` | `ab8682ea043968a11960bd5855f61add89fff9049ba92eec3b10326264819537` |
| `scripts/ci-policy.test.mjs` | `4a43e6f753c9fca27434cf5d6590167fbd4e63ae` | `09e8cedea17e69e4e7889b414feceddb7331121859a56aa30fd005a595d26a6e` |
| `.github/workflows/ci.yml` | `32e9601cc1102cdb3cb72a3496c979db33359bfa` | `0c9047af57aa43385d19898c299016266327b42402eb0380b5b4af1491eb56ae` |
| `docs/documentation-maintenance.md` | `3442c63e0b6adfbb995e6a3e5337590b9f566568` | `1d6dd1bf6f7c781a4fd37cf02d0be9cec1e2fb6bc9c7e0071e45d02eda9fdccb` |
| `docs/integration/installation.md` | `d7ae8ac79d4d35c7c796209efaca56dacc3a86f7` | `fa8690f3167088c5f72595b39ba98d396f274dd41e7c4fd90078a309567ffd8e` |
| `docs/reviews/b-ship/product/progress.md` | `448e9716b5f7b0ebfbbcdfa186130da0c5260226` | `3cdbad4f1748c7845ac64c3c7b90417173bc1b883e9da0660d79eb7059031baa` |
| `docs/plan/backend-infrastructure-roadmap/README.md` | `df0425b868cdbd57c2532605bc5abfe94b15ced7` | `965c1d3691c7d2f69f07cfd13a0209a0c410f7e5488d5f4dba88f39f5ffaa92e` |
| `docs/plan/backend-infrastructure-roadmap/dependencies-and-acceptance.md` | `2ba2cc00cd672143070c2a5aec2f6ecedda27ddc` | `8e5c3a78487e1c594fd6d2d03d3af0f87e203311f43143c6afeb75f62a29b858` |
| `docs/plan/backend-infrastructure-roadmap/sources/todos/34.md` | `8d75c42af3eaba18a6cbf815d64467aff54a31ed` | `5795e7c3df2c16258340369e61807594d4e058a9c3382be82cec020dd97ab9b9` |
| `packages/domain/src/index.ts` | `a4f54c0b28f84718380615ef6541e4965e0cdcd0` | `bdaab915967ce71615fc0d232a5dcbf42e90db15a8582380be6b8c622232e453` |
| `packages/db/src/agent-concurrency.ts` | `67c6128ba7818451bb18c0f2e89b784742627a06` | `7bbf80128b36d4cd7c48b50f6b0069ff641eb0d8c81b0dc5dcb4695a939526d8` |
| `packages/db/src/agent-lock-order-manifest.ts` | `458e5f3029687f8ac76e657a51c8721e14853732` | `96f2f1d4f4c7a730b5f2d5c86e66f67ec3fa799267612205564a33355f9295ef` |
| `packages/db/src/workbench-execution-waits.ts` | `b88746e0409c961dc12a9dd6d3cc77ab624eefa7` | `7ccfdde4832bb61223aec3728381ee18cf873a75e9738637392d73160389355f` |
| `packages/db/migrations/v1/0001_v1_baseline.sql` | `4804a88949ad3ed1314cad05f4540cd41d2f96c3` | `1fc1297ef9b4600d56368c6734b318b41b48776de82d5d9fe307d09427ce3f83` |
| `packages/db/migrations/v1/0004_agent_connections.sql` | `c55c391aa324281b0c8567809315be9532c3832e` | `c31fde289828e87e7919cf114cccd24fb67ace2ee8007539a66273cfb6b90548` |
| `packages/db/migrations/v1/0010_workbench_conversations.sql` | `031c6450ea0134e1629f4f600b20eb21631b896a` | `3ed3f9c50099cf8d5f255b79d34c11f7c00881149ee707a9cd49d1461115ff42` |
| `packages/db/migrations/v1/0017_execution_origin_and_waits.sql` | `ec634ba7b34ccc6b5c32a163822a4bd3d6811c05` | `757b8f0eae9df9a35e424456630a1bc8eb4885d5d566d255107579dee1d4040d` |
| `packages/db/src/schema.ts` | `200df9f3c7c1a7c39a196946c3fe9f2dba4f0e7b` | `ea3ffdb43264576b5bf938815b7d6418843bca207b2a24705f536d790d75bc08` |
| `apps/api/src/configuration-readiness.ts` | `f27feb8fd3289996870b82f00a3d61d2af9686a7` | `60289833f1b1f9804bb638603a16ca79c9edb503ca4d9da6d8fd6f25abf15799` |
| `apps/api/src/workbench-runner.ts` | `2d2dc515f3ed8db97b001b84309b3d52122278eb` | `9ceda3fa3f3d0daf931c749495fe597ba834c0718857c204f33178180a8a923e` |
| `apps/api/src/agent/commands.ts` | `642b961b54c436c0aff296fea3613eac092606c7` | `64766a3cf06dab503344939d9f28ed9c46076b0f17f2d4f81360abc0c2c44204` |
| `apps/api/src/agent/execution-origin.ts` | `eb3b86252dbd82636210cd5cf427d7b9bb2911aa` | `3342cbe3f7117a87885a13b5679459fd525c0c35ecdf5f9a6ad40c48c5d87d70` |
| `apps/worker/src/session-lifecycle.ts` | `309643c6f086160c0db9abd2e15061a7027d55c8` | `1eed074f1c8c68c5763ed5d55e6ccd26b7f80610abbdbbeca2a1d105f76968d3` |
| `apps/agent-runner/src/run-session.ts` | `6777938c8f7c14802b7be07aab34cc0e7cea3374` | `ec242238ff5317d1ff571fc12c91b6066a2bbeb25d7768525f48c07efa5a2d2a` |
| `apps/agent-runner/src/execution-lifecycle.ts` | `0172824637cf6fac5f8eb3bd5aeedad647a901b9` | `cc6e9da653a2d83dbafaab923bdbb41f7e296707f8305fb573ddd361a28a2f03` |
| `apps/connector/src/platform-security.ts` | `30e5d5e5a46d8d93dcb40e6be435a5cad3ea129f` | `2eafb66c39a82b9807798d6c602616bce6a58205eefc76fb61e17bf03a1feabc` |
| `apps/connector/src/commands.ts` | `4eab533df193eab5d41f2932a0bc6db329e05cdc` | `f31a84823e66107d9f91148b4e31aa662bbe5add96f24b322b42825286aef748` |
| `apps/connector/src/output-redaction.ts` | `cd316fa19cd67a812dcfc267329efdee8fbcd090` | `42de4fed906feac3b64baf87c04e6900360f0cd2acbc1c7f620c71d0f8578f62` |
| `apps/connector/scripts/install-entry.ts` | `c9f7be55c1c30a23bcdbce0c8605f7c422d5da51` | `bc500db8aa283d2cd08ae6403cb2e124f340b99fad4cb2d08765f77a34d48eba` |
| `apps/connector/scripts/release-schema.ts` | `abc270efdae7fe77f4a7c6d126d5f19c1bcd2946` | `6f94ab92e2ed3c7db18961d52cd61704c61c6d64005ee7273f8fd99264193f29` |
| `apps/connector/scripts/build-release.mjs` | `aa3e7718d95d54a4a97024bc3cb84b3755a17f33` | `5ad19200a7264dce264535b8902c12495fe75c195c5dbe3a7146b2c605b1748a` |
| `packages/agent-sdk/src/index.ts` | `749b0ebc33c14a88a6b0c795eff823a03935642f` | `edf8e70ed976fb79fd767d1d658858c2aa263f54ea6ab75945f8c32ec593fd5f` |
| `apps/mcp/src/index.ts` | `33d39762a8de98f0f71c286d03435ebded6ab503` | `0e4ce3f296b5368592ccdb9000facdc0381ae1879de2d6c0b2671b63cedb76cf` |
| `apps/mcp/src/discovery.ts` | `9084eaed52c4acc54f8c806a111197525b6de587` | `ac10ab24cc3080f254deb6396b60d7c16b66a3afb7b9c43927db740f984fc9b9` |
| `docs/skills/zh-tech-writing/source.json` | `230fe627c6c1e9c12f817ce58a6829d02f383e9a` | `c4fcb08cd6e65a95a15b03b8ce70897414b42b03ebded3880eb17eb57b785676` |
| `docs/adr/0003-postgresql-transaction-outbox.md` | `a12d8990dd423245198f9a680c0c3ea07e98e9de` | `42e4a363b77efd152c3edc464cef25b47fa600f00d6a978bd519148692fb83d7` |
| `docs/adr/0004-actor-model.md` | `43854ec7fe0f0dbcf945da0373b0e8db4a4c0467` | `8c0307d5b979af88c945a2423423b6829bef4540a3d4e2ede45985c7f3bbd5a2` |
| `docs/adr/0008-agent-session-token-revocation.md` | `bfe71633629746d09f99bd034b077a35bfac5822` | `736a4bbc14480b50914ed834eaffebaa40ab198bbb9adad9cc091c62f292b697` |
| `docs/adr/0013-lease-semantics.md` | `4dff7bd367d37e5545053f2c087c2b0983b0050a` | `6be2820c3d804720824d93834b0dcb6749f779d4e2e8ad4037f8fd261abd7085` |
| `docs/adr/0035-retention-archive-and-heartbeat-projections.md` | `c0a51a1289923b0d9d5fb78f4bfdefbf9ba1cd3e` | `71f20c7d552b7827123d4b0f0802fd5490c05eb365b1dccf4f4588187e213295` |
| `docs/adr/0040-transactional-active-executor-projection.md` | `9981b8317fdb93e823f08dd40d06d8ccf2bc10aa` | `f15c0e7272f974652535a5d96f90bb324e51c71598d1211061bc06ca488e5a9d` |
| `docs/adr/0042-agent-client-profile-and-derived-capability-manifest.md` | `5ad4e5434603fe83555cda3df4e6f507f51d8f7a` | `a0530dfa3a65ee8e4771d94d8e64ee529f7f54462967b63b6331e00b73a50ce3` |
| `docs/adr/0043-agent-connection-and-coordination-mcp.md` | `c57ff2216307a7c21940dd9fc0278954489f30cf` | `b15dd4f6068b27520afbe55909c1323da0b5038d9e3cda4b038f834ff2cca938` |
| `docs/adr/0046-agent-connection-recovery-and-execution-capacity.md` | `81f20d769bc2040f8d7de986bc91a5bc0f12d8e5` | `85594be22b5deb306b36ab061af7767b549ea4f126a7f79a8f7f10e2be8fce14` |
| `docs/adr/0047-agent-task-admission-and-forced-delegation.md` | `50419b6291efddc8eabbd754bc6dbd3ce108e030` | `d47278fd7bc877b2ebe7a5db475e0f087731b211f0c55795104208273858f994` |
| `docs/adr/0068-atomic-workbench-turn-session-completion.md` | `ff826704199e38904d66b3875ec25b49e6210c6c` | `d56365f5b66b99826bf5e14bf4e89701e9430defce769c5c6ce4a4e8f0e00514` |
| `docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md` | `63c3f0aa59402558fa03c5a5ad5e8f5342c79c6f` | `ccceb3668fd7e9f4b3bef29d1f102d17628135fa2c873478de91fdc26470e739` |
| `docs/adr/0081-pi-execution-wait-continuation.md` | `d3ca541a7fb4d290a40abb7415176acd65d4f08c` | `359b828acbe51984e996a0b511c9df6823c949dd920eb97350f0898fbc6e33c6` |
| `docs/adr/0087-backend-only-service.md` | `8202c7353da8602586ffd6879fb362f37818e495` | `aad8e2e914dfdf9ea6d048305cbc0d9eac906c6626a3482295cfa53cd537ff3c` |
| `docs/adr/0088-agent-connection-error-recovery.md` | `9ffd32f230575a0d9a5d3ae30496c9fc4caaeb8c` | `146d3ffa80941609afa8b0182ed6cad8fbc91a30c641d4c9be9e6700afde75f0` |
| `docs/adr/0089-connector-versioned-distribution.md` | `5b07b1da2711b3e6df0caa252d596170a3fec6af` | `c14be2e812f04cdd46bbf8b98031bed1f13f28d690735fe55a6943404de7d67d` |
| `docs/adr/0079-connector-local-security-and-commit.md` | `fa2e646b4273a6ecda06327d764306e4f7f45815` | `1b2ee3fdbee0930320d3059d4d092a10746405a5a2f3fd377aa691e74399845a` |

## ADR 原状态片段

下表只截取原 Status 的紧邻非空行；状态不作重新裁定。

| 路径 | 原文状态片段 |
| --- | --- |
| `docs/adr/0003-postgresql-transaction-outbox.md` | Accepted |
| `docs/adr/0004-actor-model.md` | Accepted |
| `docs/adr/0008-agent-session-token-revocation.md` | Accepted |
| `docs/adr/0013-lease-semantics.md` | Accepted |
| `docs/adr/0035-retention-archive-and-heartbeat-projections.md` | Accepted |
| `docs/adr/0040-transactional-active-executor-projection.md` | Accepted |
| `docs/adr/0042-agent-client-profile-and-derived-capability-manifest.md` | Accepted |
| `docs/adr/0043-agent-connection-and-coordination-mcp.md` | Accepted for v1.1 (Agent-first coordination). |
| `docs/adr/0046-agent-connection-recovery-and-execution-capacity.md` | Accepted |
| `docs/adr/0047-agent-task-admission-and-forced-delegation.md` | Accepted for implementation. |
| `docs/adr/0068-atomic-workbench-turn-session-completion.md` | Accepted — 2026-09-25. W11 implementation; Docker test control plane Project `19a58123-88c7-4d5e-9bc7-619165bfc818`, WorkItem `ee2e9dbd-a657-47e5-8cb1-0b488df99ab3`. |
| `docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md` | Proposed |
| `docs/adr/0081-pi-execution-wait-continuation.md` | Proposed。用户已裁定“结算等待，自动继续”；本 ADR 的wire/数据/锁序仍待另一 Agent 独审，不表示产品确认或验收。 |
| `docs/adr/0087-backend-only-service.md` | Accepted |
| `docs/adr/0088-agent-connection-error-recovery.md` | Accepted（活动方案于 17:25 正式复审接受，Chief 于 17:26 单独放行产品修订；最终成果验收仍待独审及必需 CI） |
| `docs/adr/0089-connector-versioned-distribution.md` | Proposed。用户本次已采用现有 hosted 双架构＋TCG 环境并放行产品实现；成果审查和全部产品验收尚待完成。历史研究不是产品批准。 |
| `docs/adr/0079-connector-local-security-and-commit.md` | Accepted（B1/B2 已审计划与实施授权范围；平台验证仍以实际结果为准） |

## 工具正文归档

正文 SHA-256 由 JSON 行数组解码后按 LF 拼接的 UTF-8 字节计算。文件 SHA-256 是本地文件；Git blob 是按路径属性的 clean 结果。工具尾文截断按原件保留，不推断缺失正文。

| 归档 | 正文字节 | 正文 SHA-256 | 文件 SHA-256 | 预期 Git blob |
| --- | --- | --- | --- | --- |
| [sources/git-cache-refusal.md](sources/git-cache-refusal.md) | 669 | `852af274801c5d18cbcc903ab7bd0b541accea1217b6616b10948e48a6a02e05` | `6ec4376368703d1153d5d6ea3084874cc63919421d9d46f681a77d4aa36f3b8a` | `10aa62829068562214110fb7b071f39e87f1e2d7` |
| [sources/ta01-latest-excerpt.md](sources/ta01-latest-excerpt.md) | 5798 | `5a961e7774dda66733defaf6d9188ef6a93bce4bd3a15f2aefc0875cb75b0439` | `77f4277d10f9c7fe5d2a7ca54e6034539a045733423391d140e7e84ae73a93d2` | `30aa04a2566dd179ac99e33a5b0f744a5679afb7` |
| [sources/todo-20.md](sources/todo-20.md) | 16093 | `a654cd7402b251d5e3c99107ccf680fcae3b9c2b64876ae5378a0534b9c79a62` | `a1646b2d4ae339d18e01f63724412cc9d749539b04db78509d5ad6409ff467b4` | `dc8607eb8f09e9208da784cd989a94533a9d5995` |
| [sources/todo-32.md](sources/todo-32.md) | 15917 | `402b9a874ca92275d17ce4ebfe8b82ad296cf3678a76021c327f96484ba2a6a8` | `5218dffa0eb5edc7e0b8c07fa917c41f5c4b5094a480f246d16878242df527cb` | `b12ec0a1413b758eb06912327a27e6f4d859e124` |
| [sources/todo-34.md](sources/todo-34.md) | 14498 | `cb2344eec8d1bb214dd438b2ec37389a8f9fe72c9486193029ef5f812e8d0f08` | `dcafb816b2cfeecad673ec70740907e90ae06b70ab0ab502e3774c4376e28c36` | `a48b567eddb8b18341c11d47933bf856fabf6796` |

## 工具版本核对

仓库 Node 归档 SHA-256：`ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86`。

本次复用 Node 可执行文件 SHA-256：`995a3fb3cefad590cd3f4b321532a4b9582fb9c6575320ed2e3e894caac3e362`，与该归档的准确成员逐字节摘要相同。版本实际为 `v22.19.0`；pnpm 实际为 `9.15.4`。

Git blob 的本轮值是提交前计算值；实际提交之后须从准确提交读回核对。没有用尚未产生的提交 SHA 作来源。
