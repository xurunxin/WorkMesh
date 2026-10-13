# 来源快照与证据边界

来源文件初次整理时间：2026-10-09T02:00:55.666439+00:00；平台只读git `ls-remote origin refs/heads/main` 和三个精确分支ref返回下表，随后fetch各ref仅用于取得对象。所有分析按下表完整SHA读取，未使用可变FETCH_HEAD或origin/main判断主线。

| 来源 | 精确SHA | 含义 |
| --- | --- | --- |
| main | `74f247f9240eaf21e74ef248f71a445c1d4276d7` | 本方案领域与协议基准 |
| #5 | `5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19` | 未合连接器head |
| #9 | `6f059e3642291f9ab622db37e9de167d070574f2` | 未合A2当前head，含后续视觉材料 |
| #16 | `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` | 未合C2当前head，含quota修复 |

本工作树初始HEAD等于上述main且git status为空。platform todos列表是53张卡的非事务读取，#5/#9/#16为review，#53为building；相位不证明代码验收或合并。未调用远端写工具，没有关闭旧卡。

## 完整受控原件指纹

下表是通过`git show <精确SHA>:<path>`取得的完整Git blob大小/SHA-256，不是Windows工作树字节，也不是工具显示前缀。ADR均纳入来源清单；Accepted决策是现行边界，Proposed只作为提案。SCHEMA.sql的全部16个包含文件已递归读取；baseline中的SQL字符串不按正则表名计数作为领域完整性证明。

| main中的路径 | Git blob bytes | SHA-256 |
| --- | --- | --- |
| `AGENTS.md` | 9050 | `25a0c33887733812dd1fc7f488cea57ef2e38a6436c788b5814562f22a88bb25` |
| `AGENT_PROTOCOL.md` | 69441 | `cd197da780ae7678ba4f5a2f3b5d88fc979e17685b3525b391f346bc1d4a5c59` |
| `CONTEXT.md` | 5072 | `30a05e460cc2bc337cf98f721b942804c58ff9cd9d1ab1690928e93d554d1499` |
| `OPENAPI.yaml` | 505586 | `2a16e2efd6736308721b66852e76d3e008df0c87720d9c44c3cda2bf6276d03f` |
| `SCHEMA.sql` | 1531 | `9682e88fb26f7c82452ad383ea5618ad7e150d149c44f44d578fd665feab35d2` |
| `docs/adr/0001-monorepo-runtime-split.md` | 691 | `33dbd6519177e4723e7c67dad00c3aab27431c6cedf07e5f7912e3b4021966b4` |
| `docs/adr/0002-rest-sse.md` | 575 | `edba698ee94dc9ade419df2656eda0b816ffdcb5e38dc5e6f9d4f7d5a70c6b1b` |
| `docs/adr/0003-postgresql-transaction-outbox.md` | 677 | `42e4a363b77efd152c3edc464cef25b47fa600f00d6a978bd519148692fb83d7` |
| `docs/adr/0004-actor-model.md` | 700 | `8c0307d5b979af88c945a2423423b6829bef4540a3d4e2ede45985c7f3bbd5a2` |
| `docs/adr/0005-authentication-choice.md` | 731 | `792445c6174a091203b8eb946a5e15ccada5da51193b22c11808e67273f75a60` |
| `docs/adr/0006-stage0-authorization-and-event-scope.md` | 2162 | `0ed4c0fdb2ddf7621a8ccd0d7e1098f3cc71f55454300afbbc1d1cef4ac82e95` |
| `docs/adr/0007-redis-outbox-delivery.md` | 1585 | `55a14a01a685fead307ec0ac69695b2006c72f75983559492526c864173ef6d3` |
| `docs/adr/0008-agent-session-token-revocation.md` | 1483 | `736a4bbc14480b50914ed834eaffebaa40ab198bbb9adad9cc091c62f292b697` |
| `docs/adr/0009-agent-session-transition-table.md` | 1817 | `484c7e0f914266f8a9fd28d8ff66755c8fc158e334ee4cbedf66b8b7515eaad9` |
| `docs/adr/0010-agent-activity-immutability-and-redaction.md` | 1363 | `32a684f6d091b98725e7f362937eda3ff46c0049bd186d1e679e1b1ae42832a5` |
| `docs/adr/0011-agent-plan-versioning-and-conflict.md` | 1850 | `174011ebdb58367c87f4a912d486d9647b69d9898a26fa1d6c3c07b7bcc7d574` |
| `docs/adr/0012-mcp-domain-boundary.md` | 1286 | `31dbeecc6b37d93d207ebcf81ca80cefd082bc82906843bf783c7caa74d1b517` |
| `docs/adr/0013-lease-semantics.md` | 962 | `6be2820c3d804720824d93834b0dcb6749f779d4e2e8ad4037f8fd261abd7085` |
| `docs/adr/0014-handoff-transaction.md` | 1625 | `67630e492331b285683082870e26356f95e0b1ce8d3279c327c8bc88b53ed819` |
| `docs/adr/0015-agent-routing.md` | 1444 | `2c0ca303b9bfdbff057c8ac06c87429ff440d29a92dd54ae3e8258bfc73e8327` |
| `docs/adr/0016-work-room-projection.md` | 1512 | `a14d93aad70431749b013cc5ef63c2c1c47b018d84ff03f5320f9ac402df419a` |
| `docs/adr/0017-parent-child-completion-policy.md` | 1103 | `62670971d8fee198b39d64fd9234f9394b642a8e32cb7aa11788ff56ea9fa933` |
| `docs/adr/0018-provider-abstraction-webhook-recovery.md` | 4195 | `b9ef0f9cc0c44145677cc7c834932ae70d48daf359d81051cf277bc5a61f1f6c` |
| `docs/adr/0019-repository-context-and-agents-scope.md` | 1856 | `da740bda67988ffcc9aea1cb2573bc744eb4aa577c844430ae2ca54baeefc774` |
| `docs/adr/0020-exact-head-pull-request-approval.md` | 2791 | `1dcb77e0cfebf575d0bd8736d077393e5c4b08b9fa767d9d3b7a287ff04d1e24` |
| `docs/adr/0021-artifact-upload-and-provenance.md` | 2369 | `252f3f8dd9f5ea008b9518a814dd920051d6b6faa8e99007edf11bd4cd6a69c6` |
| `docs/adr/0022-completion-suggestion-and-project-progress.md` | 1426 | `6ac6e7d37e69cfb5358f693ee1672150e3abe66506492cffec0f6909e5582e0f` |
| `docs/adr/0023-automation-versioning-and-effect-execution.md` | 3228 | `066cf776cfa9ba3719cd0cead4edce9efe9d8442118d1bc6f979732608832263` |
| `docs/adr/0024-loop-admission-overlap-and-retry.md` | 2217 | `e075d553b1a404441ca6331320c60ae588f2c316ead94db1926e44bcd3f3df91` |
| `docs/adr/0025-source-linked-project-forecast.md` | 1577 | `6d3d6a59acdf3113302acdf3683b44bbef17bbe3d3c7a2497d397253fd497691` |
| `docs/adr/0026-usage-and-cost-normalization.md` | 2905 | `a92c9dcefb8784f3459172156d68231f70f2c0d8d01de4a39241a9269ec8b02d` |
| `docs/adr/0027-a2a-version-boundary.md` | 3663 | `0d8e0b09085b164d2ede403fc4be98ec920fbbe57fc7a5523f22445e70f8b868` |
| `docs/adr/0028-declarative-route-policy-and-event-audience.md` | 4661 | `c45e1c3474a101c933fc2b888a8804859a4a871acd6c58236076fcacbcb4dd64` |
| `docs/adr/0028-kaneo-frontend-architecture-and-dependency-policy.md` | 8037 | `0d3f856506fe32cfe26cd88b9ad07acb4aab7e1a8e0d8ddffb13718fbfa731b3` |
| `docs/adr/0029-rich-content-sanitization-and-editor-boundary.md` | 9002 | `fd7d575bae468ebf8c0de1b7279188086d0460f8093a2ca0e5fd7b386111c0a9` |
| `docs/adr/0029-secret-aware-authentication-idempotency.md` | 4260 | `2b0aadecc21232814864ba2393ae46fe31bbed2acdf4038d4a27bb6314006b98` |
| `docs/adr/0030-shared-authentication-rate-limits.md` | 4217 | `c24fff8535de7fd89a9a5550d6bafa75c3299c78c53fcda9a4a111cce7a23f54` |
| `docs/adr/0031-authenticated-single-use-bootstrap.md` | 4364 | `9da8f901f0c5242383e8c5dd45d5eb42a29816ebe1c88adb55c87af095cd04e5` |
| `docs/adr/0032-signed-keyset-pagination.md` | 3129 | `a0530e1c1bc050c1efc39374db592e2dc692b40a1fb7bb984385e78c6d5edc51` |
| `docs/adr/0033-postgres-authoritative-realtime-replay.md` | 5873 | `870efadb1a2db8b5013d97bdf8d7e289e72c093bc428748e72c9d88eaeaf03a7` |
| `docs/adr/0034-production-runtime-images.md` | 4611 | `2dddf7f35bafe128a0688c4dd739225bd185728bd4fb366caf83558602642384` |
| `docs/adr/0035-retention-archive-and-heartbeat-projections.md` | 5551 | `71f20c7d552b7827123d4b0f0802fd5490c05eb365b1dccf4f4588187e213295` |
| `docs/adr/0036-exact-archive-membership.md` | 7695 | `c57536b04d0125ddd89a3241928e8971342ddb9155aea620480533709e8cc981` |
| `docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md` | 8320 | `9f08b6f7dac5c96769d585ad87e309f4ac1530100d70d30fd2003969902a8817` |
| `docs/adr/0038-atomic-checksummed-v1-migrations.md` | 2509 | `768c2c6b803f50e2ad8ceed982c8fddee2985e46e61ffb0cfcb70865d5ae52cf` |
| `docs/adr/0039-authenticated-complete-recovery-bundles.md` | 3635 | `ce047db95be691b092b4a25939b6e930ca43469f99a13ccee086dab3de71076e` |
| `docs/adr/0040-transactional-active-executor-projection.md` | 3203 | `f15c0e7272f974652535a5d96f90bb324e51c71598d1211061bc06ca488e5a9d` |
| `docs/adr/0041-versioned-guidance-and-context-pinning.md` | 2950 | `d4634ec14e2bafa576b3230543701ba5c50754bba1c71ea5f5cdc89eba1ae883` |
| `docs/adr/0042-agent-client-profile-and-derived-capability-manifest.md` | 2339 | `a0530dfa3a65ee8e4771d94d8e64ee529f7f54462967b63b6331e00b73a50ce3` |
| `docs/adr/0043-agent-connection-and-coordination-mcp.md` | 23937 | `b15dd4f6068b27520afbe55909c1323da0b5038d9e3cda4b038f834ff2cca938` |
| `docs/adr/0044-structured-planning-domain-parity.md` | 3823 | `e02b8367312309eb390ce3144d77fae644db70066b39034e6f3cdd22ec0e4f88` |
| `docs/adr/0045-webui-redesign-i18n-theme-unification.md` | 16377 | `2dccd62b2d913f2df1329b7f862a1107026bf1d0410ec8994f08401be74fbb77` |
| `docs/adr/0046-agent-connection-recovery-and-execution-capacity.md` | 7620 | `85594be22b5deb306b36ab061af7767b549ea4f126a7f79a8f7f10e2be8fce14` |
| `docs/adr/0047-agent-task-admission-and-forced-delegation.md` | 10221 | `d47278fd7bc877b2ebe7a5db475e0f087731b211f0c55795104208273858f994` |
| `docs/adr/0048-stale-self-claim-recovery.md` | 5421 | `3f312b051e5e29756b6a8789bd226154566fd08876574e7d71258c461f75e942` |
| `docs/adr/0049-terminal-only-self-claim-recovery.md` | 4439 | `c90cafc1afd736538b1fda8e6f0c1e6be138b8ddc9525df134c492bd8fc3f623` |
| `docs/adr/0050-human-attention-authorized-projection.md` | 5182 | `387f0a781f3b394cf0f0a6446441cec1feb2ff5fe12aba9766264495676b492e` |
| `docs/adr/0051-human-control-plane-read-models.md` | 2978 | `2f3e6b7aaef18784082954aa2792323c49c8ef90ad4927950e8a3c13978cde4a` |
| `docs/adr/0052-human-control-plane-information-architecture.md` | 4739 | `debe5a00cdd57beeb523453b5299d69ad60840fcbf5af766119b553e5bc013a4` |
| `docs/adr/0053-human-attention-governed-responses.md` | 3571 | `bea8776ae07b2b4cb2f3984b4d9e50cca235acbde42665c8641227c0da31b74a` |
| `docs/adr/0054-causal-agent-run-explanation.md` | 3371 | `36c3c581cfd12404ceff45f66b0838a7580ed8c8f1ec5a1a0c5d58cf74ed8077` |
| `docs/adr/0055-governed-agent-session-controls.md` | 2789 | `f90bd2c48c33a09c4d5d8a3b7569eecff785e21d1e7cc93ccae84f490bb3bcb7` |
| `docs/adr/0056-work-item-execution-workspace.md` | 2162 | `acf47037d682a202d16dd8a0b783a4a3d5d43be3d9137b7aca083241520735e1` |
| `docs/adr/0057-actionable-collaboration-queues.md` | 2823 | `06b1bb8041fcc162cc05d18400bba61c10b8ea2ad9b4840a345ca32cebad9ca6` |
| `docs/adr/0058-authorized-recovery-and-freshness-projection.md` | 4035 | `e2beabc72a73530d5bab166cc78fc51df354617e54dff864194a8bceb1664df3` |
| `docs/adr/0059-canonical-navigation-and-evidence-drawer.md` | 1889 | `26b22fd8f3a620fee0399ae1d8f76dd580769a67e209ec1c2dbbad4e9ae24ec8` |
| `docs/adr/0060-optional-graph-integration-boundary.md` | 2682 | `a51c5d83bf129d2e088d164d78224fe59416fb7254a455f4576d8a03d2605a7f` |
| `docs/adr/0061-human-control-plane-final-acceptance-and-telemetry.md` | 3085 | `447b5f3bf24ed2b8220d1fc71b12aa2eff27f9ecf6eb307d0da1b261a4988c6e` |
| `docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md` | 4005 | `fdf589485a3e046ac0c9954193c9e2c26b783b6b8c24245f669511ad9e917c50` |
| `docs/adr/0063-multica-inspired-authority-first-human-agent-workspace.md` | 6804 | `6b75de0d69d93d29b3e648a612a530f7d25b34792622ccb3f718c36a55903cba` |
| `docs/adr/0064-unified-human-control-plane-web-experience.md` | 4877 | `35af6982572c2dd13537de1ed84a079480504b48b8a58e50d8d9eec48322e070` |
| `docs/adr/0065-prototype-web-pi-workbench-and-llm-connections.md` | 15616 | `40d6ae1534023db60875663831d370d6976d998dcb81bbe5a3854b1f380f17ae` |
| `docs/adr/0066-versioned-project-and-issue-documents.md` | 3340 | `62744917190f1ae7aec993e30b18c910c4b21b9d5c2a60e654ec96b9c879d17f` |
| `docs/adr/0067-governed-pi-workmesh-tools.md` | 4655 | `f84e60c19538bfbbb3daa3c6775ce35d6cdac8ce3bce0e06e354d8f8a54465d3` |
| `docs/adr/0068-atomic-workbench-turn-session-completion.md` | 3545 | `d56365f5b66b99826bf5e14bf4e89701e9430defce769c5c6ce4a4e8f0e00514` |
| `docs/adr/0069-embedded-pi-workbench-skill-pin.md` | 2413 | `c5e7e090bd1d38f9a8147fa6cc4833d7c8ec8164a0eaae8962bbc6885d18395f` |
| `docs/adr/0070-artifact-storage-on-rustfs-and-header-signed-uploads.md` | 5469 | `7287be92bff8c581223902793c7df8092c62bca3977e60ae8bfa407f0d851ccc` |
| `docs/adr/0071-lite-single-node-self-hosted-deployment.md` | 16940 | `bf5e4e81da36a4f9cc7bf615c3776c66620be50db768c99ff8c5a8f0484fdadc` |
| `docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md` | 16948 | `5c9db399db9abf65d95b93e99f6e2d091de15c17ce922f160c2868445ba3f22e` |
| `docs/adr/0073-human-ordered-position-within-a-status-column.md` | 7330 | `e9c84def5c80357ff53c702b86b99ad9af93eb7469088d5f7c9de2ade3a29417` |
| `docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md` | 14405 | `6655db75d8c1e38a3ec38db44621ae0dac777980ed27e512934eb56e327da5ba` |
| `docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md` | 17002 | `f978c11ce175c7a34b0b177ef4155cd4713d1d6cf19959ececf82f29314616ae` |
| `docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md` | 21300 | `f41492546c9f782745c73b92295527a197a0049f43f4d58c1cc5a33362875e96` |
| `docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md` | 18365 | `46d35bafe8558bce1d621016be09522780dc1b61c30a5f8b24f0b60c7dfdadfa` |
| `docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md` | 55155 | `c141d1a9dceba893ea59537626ad4dd1b3021c348389d70ef05cdfbea6e38f99` |
| `docs/adr/0078-review-round2.md` | 24468 | `0f9ec7b53d8ba7dd9e8c11e247c1116fc6dadf932432c77b8cc5b391aca728e9` |
| `docs/adr/0078-review.md` | 40672 | `2df03d61f25c354b6b663ac405ce9d6fd70c09c94688fdd966f64368d08090ec` |
| `docs/adr/README.md` | 16064 | `4d30c7b6febddb9d00bbf51be8a4b69a247fe35ef872560f3ded734baef3326e` |
| `docs/plan/activation-task-specs/01.md` | 3027 | `08a92224a0343eebae55bb010ee81071d2afa0f7d32a789c14e6c3ec21e47995` |
| `docs/plan/activation-task-specs/02.md` | 4243 | `378f45f2a1abc1cb3c72073f86af1f5d91515baaabcb1453addac4986470699a` |
| `docs/plan/activation-task-specs/03.md` | 14459 | `e3ee6ccd5c215df0dfce906405d67093bde0d79c59dfbaed6e471413573f184e` |
| `docs/plan/activation-task-specs/04.md` | 3368 | `65c9495b41c4efbcd302ffc6ae0f14e1b0550e7f9435ba522db6ae25a15be2a9` |
| `docs/plan/activation-task-specs/05.md` | 6215 | `45a03091c6a80df7d73229c33af6e15d40432bb882123db91225a9f354e24698` |
| `docs/plan/activation-task-specs/06.md` | 2647 | `6368cbd1b6fc77c8967c6986fc7ee00f94fc57f7a423cc4d4a02d3f3f08855a5` |
| `docs/plan/activation-task-specs/07.md` | 3990 | `ad6264cdfa1c7002b55d2add07d53038173dae63e04e912d512a80d2bed7a49a` |
| `docs/plan/activation-task-specs/08.md` | 6312 | `5f3df6a1d75f116dac3a722f559d8f2c617b71c5de1b3d12cc011ae8d0297491` |
| `docs/plan/activation-task-specs/09.md` | 3590 | `a6a9fdd5b76c1e68769e87e255d645b01de81acb4cd30ce227ba34c091437ba2` |
| `docs/plan/activation-task-specs/10.md` | 4872 | `19b7d819056874d244ed009a4426bb92487390dbf2c037859fe140b5e1f4447f` |
| `docs/plan/activation-task-specs/11.md` | 3705 | `b495ed2261782cc00dff29b28f344dee00bbe17002b0f1fe35773fa4feeebc5d` |
| `docs/plan/activation-task-specs/12.md` | 4922 | `b0398d2215f7099ddd64818c2e232cff80edbd2555edabf88fabbc102c0f58c7` |
| `docs/plan/activation-task-specs/13.md` | 3528 | `c85f4a67526b1b48f83281d98ab2fe77480a6aa7da4ce31440430a378535af1b` |
| `docs/plan/activation-task-specs/14.md` | 3603 | `2d3d765a959d13d064aca3c418c12d6a85e7f6fed7ea76194a89618f96e80dfc` |
| `docs/plan/activation-task-specs/15.md` | 4969 | `16fa58c1916caa477b395b01370369a02d8a0dd5cd398e9257ce41d4ef1272c9` |
| `docs/plan/activation-task-specs/16.md` | 4311 | `144e1ea0b336bf5b9fe210e45ddc2eff9b2a9f3f175d6519884578f1b246af5c` |
| `docs/plan/activation-task-specs/17.md` | 3963 | `79148333e809055eed78a6a5980dcdc535feb03d9173705a3f7b669fbc7a1a3e` |
| `docs/plan/activation-task-specs/18.md` | 14323 | `390d1c36c2dbecfd56ac1243926555b60bef6a7b6f50ba23c5e26b9f73189076` |
| `docs/plan/activation-task-specs/19.md` | 7509 | `3be9147e26404fa11a37edd6f2468392b9aa1830f7b46743590c8bbed6641db7` |
| `docs/plan/activation-task-specs/20.md` | 4719 | `7ac34c1000f770144afce016b2f6738224cb93b41b9332262566f7aa377825cc` |
| `docs/plan/activation-task-specs/21.md` | 3672 | `41119bbe9b16048419c25ec44720e56123e548820c5ea930e3c6b2d482eca2d8` |
| `docs/plan/activation-task-specs/22.md` | 3977 | `bd0be290a01f9eafb87ca75137c7a8fffbac43e7ff055cf14f5c530d141a1a23` |
| `docs/plan/activation-task-specs/23.md` | 4880 | `8aaa1287b8435f374f922c65622faca7eb45b45afddced8110ee66a92d530768` |
| `docs/plan/activation-task-specs/24.md` | 4893 | `b2a1b6b4d9cfc84392a1523dffb476646a47caa2e29ae0cda5a395e34ab841fe` |
| `docs/plan/activation-task-specs/25.md` | 5904 | `44aa01ef80888def85d38bb2d0117289bec7f47e8a8488bd9e4df8afe73062b0` |
| `docs/plan/activation-task-specs/26.md` | 4889 | `c6add2f77059fcb379e90874da463fb0b310d3f7a7bbc3f5318f807a9008fda6` |
| `docs/plan/activation-task-specs/27.md` | 5525 | `4324c11e58fca3f42234f3f2422e1fc438f65d8d3f690d5074e91bc0a2352606` |
| `docs/plan/activation-task-specs/28.md` | 5264 | `20a83df7136b3b09b4333837de145e58e1bae6da1264ef6d17c02d90c5256d3d` |
| `docs/plan/activation-task-specs/29.md` | 5465 | `263a4d9704bccb48bfb80a7d6ed1df4296ed8fa7e668d9796fa90608aff01bc6` |
| `docs/plan/activation-task-specs/index.json` | 100195 | `57055023db51d6a04faccaca19bafc7eb36b7b3d3b25be1dbd24f7195c71ad0b` |
| `docs/reviews/r1/adr-states.json` | 8941 | `699f12b590feb82b43d9586c3e99b9aeef21f66feaa68c86bd82a855c919a75b` |
| `docs/reviews/r1/archive-checks.mjs` | 3583 | `a0f521dc22065654a825c759383744acf9a37100b94531863c667c3ba6e82150` |
| `docs/reviews/r1/checks.md` | 5483 | `b574c6ba5b55f8359becb1abaafa93f3e843ccc4892b34b0d75f7aea7d65105b` |
| `docs/reviews/r1/ci-selection.json` | 8386 | `69a136186cad599a269c3a2176e19269318a1724cd86c7609cc6bfd15d99524d` |
| `docs/reviews/r1/completion.md` | 2027 | `83bdccb3eb04ba68f118d71937154ac7acb3e8e538ac10cb36e18d4797600809` |
| `docs/reviews/r1/decisions.md` | 3668 | `0428735d4012ad9fb58c1ea426e790e0d873e125f85e1866da87ed947c6fe4ea` |
| `docs/reviews/r1/execution-check-results.json` | 4965 | `06b6c88796ba9421ff86f9efdcb2997410f4a1ec22b62d1f293ee584dbbc9221` |
| `docs/reviews/r1/execution-checks.md` | 5865 | `593a55a9d86324d8e15cd1d5cdc496a3c996f4b071e449b56d6641481f496308` |
| `docs/reviews/r1/execution-environment.json` | 928 | `d3768fdd6ed005f31caf056192313cbb3d4b9334d939f65c0dbfc15d8130273f` |
| `docs/reviews/r1/execution-inputs.json` | 328288 | `069dfdc2c04103caba88817a25e77dfc4a148800a37ef077d1db2d045c9fc35c` |
| `docs/reviews/r1/execution-main-inputs.json` | 1150066 | `161f5e6ee5ffb8d18164517d025085ab432c41fa47fb3d7399a8f666c5e7b71d` |
| `docs/reviews/r1/execution-manifest.json` | 72107 | `6f9019260c7d839ee5ed3618392bc3917560f32b21288550b782fe735029f61e` |
| `docs/reviews/r1/execution-review.md` | 2335 | `e95e73848b14d49b0f6157c8f4c534e9412f027eafa9dcb7ca4ae4dc01fb213f` |
| `docs/reviews/r1/execution-spec-deltas.json` | 25464 | `4ecc7ff2841ffdd70ad27af19744f95fe4873c0953a41520106c889536f45691` |
| `docs/reviews/r1/findings.json` | 25591 | `1746fd12e532ee4a154e29cd31f40e5bf2600232febd29f585823b03f3390b48` |
| `docs/reviews/r1/handoff-manifest.json` | 3722 | `5a06f16744f96560222ba0235f3f23ab1afcf4c60a44f52bce142136f50982e6` |
| `docs/reviews/r1/historical-plan-excerpts.json` | 21582 | `448372029a7d815507b0cda5a1492b522583be5104a0aea35cdd2baae439cd8f` |
| `docs/reviews/r1/input-deltas.json` | 15157 | `3d54f1bb4f84501812cacf47cf4931d8c09ce05d806e84061fa7969b9d2cff4e` |
| `docs/reviews/r1/legacy-requirements.json` | 55208 | `e549ae50c3c27b076de8ad1c5fd22239bcbd9f1aabb1c7cb53db3d9ad5914ff5` |
| `docs/reviews/r1/lock-contract.md` | 3711 | `9b181d1f9f2716427a1bf47e9d119af28bea40b102472ec1b7087e6430e6f5fd` |
| `docs/reviews/r1/main-inputs.json` | 222660 | `74455e9b09f6bd8958e28852f89533f3721afed90db51cb90736dbdc4eb1a1e9` |
| `docs/reviews/r1/plan-review-response.md` | 11766 | `6f61de15ec5348e94523182684a84f30b3a1b8e6df3fa2f46a898ad46ab55808` |
| `docs/reviews/r1/plan.md` | 9369 | `a3f636f1d30383519e984f7cce4f29d1d837f70c9f3694d1ced8ff8e061dfaed` |
| `docs/reviews/r1/pre-review-deltas.json` | 15605 | `d3f94aa64de64b42988770c17ee76f73ebc541892ceec8d801027e6612852ba4` |
| `docs/reviews/r1/pre-review-inputs.json` | 328239 | `fd9007e8365e7e9b6944a3b844a16140a1bf81da67bfed2726dfd625d3063fb5` |
| `docs/reviews/r1/producer-review-response.md` | 3845 | `0bda292beeb053ee51d1fa45f40be78d892045890bc9b76aedfa905d230f629d` |
| `docs/reviews/r1/r1-spec-source.json` | 1573 | `794f165d1b581918c60f59c717fa43a8490c491696247d4c90700f468c661cbf` |
| `docs/reviews/r1/r1-spec-source.md` | 15420 | `b6f0d424fc89565ba76d41b6c05acad0797925acac06548c5d76c035c416dccb` |
| `docs/reviews/r1/review-feedback-checks.json` | 16905 | `590558e20c5f3f2a3c6a1124cbe72dbccd61f8bc51540760e53949674057ebb4` |
| `docs/reviews/r1/review-feedback-response.md` | 3694 | `1fa9f0c1811f10e935306a072bcc7c761dae8b3f2e6543c5269ad3a7cc54250d` |
| `docs/reviews/r1/review-feedback-source.json` | 30403 | `31119bf209541aace8bde3c03727298a16e338869465e52e696801369743a396` |
| `docs/reviews/r1/source-gaps.md` | 1487 | `87bc0360e06d112736094d73c447cc0233385003ed3f28f03a1ae08685afd2bd` |
| `docs/reviews/r1/static-check-results.json` | 3834 | `efaee7b12a849a20e7903869beb2907746f11eed196d84db0bca5fd98e884891` |
| `docs/reviews/r1/task-contracts.json` | 22805 | `b71ac2162215f9fc996376b3181b955a0383ebf1ef9dbc5a6bd4116eb5fafa06` |
| `docs/reviews/r1/test-coverage.json` | 322807 | `dd705eb984c795500479b9989dba17325e2d0491f843da8dec80fb824b18ad41` |
| `docs/reviews/r1/test-coverage.md` | 53051 | `d0a7436646c18efa7d9aa6a35d93f95a169d10b44f9a149cb156cafc94bcee47` |
| `docs/reviews/r1/todo-inputs.json` | 343283 | `19db2cfc4d910379d0e3eec255d8563e6f704ccc35cf71a761691640cf37f52c` |
| `docs/reviews/r1/verify-handoff.mjs` | 6131 | `82bc549148d9ceefce08bbfb9c17ad8a0c6970de773fb17f4e9c736152b001b3` |
| `docs/reviews/r1/verify-specs.mjs` | 15590 | `f930dfe8a2d4ab568c3739dd7a4d6db2025c2c3b7027993c4932a93e3e2f417f` |
| `docs/route-policy-matrix.md` | 47310 | `c00be214e627019febc42cdb4fb592b88dde9435946a71725d16de4dacc23e8d` |
| `package.json` | 4611 | `318bf89f75395b4316cb7b7bf18ffeef46266bd32f7a76e938fd1c24e0cec2bc` |
| `packages/db/migrations/v1/0001_v1_baseline.sql` | 172420 | `1fc1297ef9b4600d56368c6734b318b41b48776de82d5d9fe307d09427ce3f83` |
| `packages/db/migrations/v1/0002_active_executor_projection.sql` | 11126 | `0742da4ba547e484f463687e67392c3762e3628f2f841473cfde66c2725342d2` |
| `packages/db/migrations/v1/0003_versioned_guidance.sql` | 5056 | `199adac75057ed0a2b285453440359d68aea1ae62cba33b2274ac8e6364fa2e7` |
| `packages/db/migrations/v1/0004_agent_connections.sql` | 6630 | `c31fde289828e87e7919cf114cccd24fb67ace2ee8007539a66273cfb6b90548` |
| `packages/db/migrations/v1/0005_planning_domain_parity.sql` | 8197 | `1810ceb56156b7d0305b03b6b69b65453fb85d8b949afbfc78eed2ebf2295be4` |
| `packages/db/migrations/v1/0006_human_attachments.sql` | 2824 | `076f92a3257f9ad15c6c9770f31c12755d10a74e7f87b15b0363c391ec050ce5` |
| `packages/db/migrations/v1/0007_active_milestone_name_uniqueness.sql` | 225 | `a3313489a85a5aac71192f540cae57f84f29036a023018c7f2d295d7f5a87302` |
| `packages/db/migrations/v1/0008_autonomous_control_push_enrollment.sql` | 12046 | `ca8ecf47510edfda6221de7f6f375c55d20d4cda588d39ff39816ebed24031d3` |
| `packages/db/migrations/v1/0009_workbench_llm_connections.sql` | 2740 | `5d41a6e5035a30619691a8f59e1dbe836345ef0f826a87776b99c6f272ea4b68` |
| `packages/db/migrations/v1/0010_workbench_conversations.sql` | 7618 | `3ed3f9c50099cf8d5f255b79d34c11f7c00881149ee707a9cd49d1461115ff42` |
| `packages/db/migrations/v1/0011_versioned_documents.sql` | 4975 | `b647d04ded7720ee3b993721f72097c3a2e642bb0c0010bb4b764a9dcb4384b6` |
| `packages/db/migrations/v1/0012_workbench_turn_lineage_and_tools.sql` | 2870 | `ca928f0cbd79cb608ad355a4fc60b96a4f418cb3d6a70698876ede53631865d3` |
| `packages/db/migrations/v1/0013_work_item_board_rank.sql` | 2107 | `2649c369972cd710097923956f42c03e7db663d58cb458dfe7b8fa325ed406fb` |
| `packages/db/migrations/v1/0014_channel_delivery_contract.sql` | 5557 | `1f8d766b5215c3bbade32c4f52ac790edb004d30a586034df2518cf2794247e7` |
| `packages/db/migrations/v1/0015_channel_notification_kind.sql` | 749 | `632dbc4eb356f6b032cc405a1960cbf006cced66c950763f165f87bd9f4191e5` |
| `packages/db/migrations/v1/0016_approval_notification_kind.sql` | 345 | `01fa357c187faf980e7e1344ccd12de5af3826029d45744732041fc5b56d72e4` |
| `scripts/ci-policy.mjs` | 7063 | `e8dec6c099c802e0df19c07a13750fea6f84580d0b5c3ef191f78c68799c410d` |

## 未合分支的精确逐文件差异

比较使用`git diff --name-only -z <main>...<head>`；它是共同祖先增量，不能直接代表目标main需要完整覆盖。#5共同祖先较旧，必须再看main→head树差异；禁止用旧tree覆盖C1/C3/A1等main增量。以下列全部非docs变更、每个head blob的完整指纹及路径历史中最后提交（含merge），仅作来源追溯，不表示该提交可整颗cherry-pick。

### #5（共同祖先 `18252ba8761aa810c3fd12d31ecae83e8b24d985`）

| 文件 | 路径历史最后提交（含merge） | head blob bytes / SHA-256 |
| --- | --- | --- |
| `.gitattributes` | `903573a873538613c054a4f9732c321587b0a45e` | 686 / `82c5385e66b772983cdb19c7a04be077b9c6c0123a0a588fb16a5855b9a3532c` |
| `.github/workflows/ci.yml` | `903573a873538613c054a4f9732c321587b0a45e` | 35338 / `f681be81b1c837a1946312b9f46175e3cab203832a5205f1c61d66f8dd812eb9` |
| `AGENT_PROTOCOL.md` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 71389 / `ea2bbd556822f7760d9de37cfcdac659baed09154f24bcc590c198c7311aaddf` |
| `OPENAPI.yaml` | `c1c7bca6b3231144c7bcfadff390c479ab116c22` | 506013 / `7cc4e34f19fcbd6c2fdf036681695b45ee5be53e62509d07f451530ae1a9413d` |
| `apps/api/integration/stage5-connector.integration.test.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 14195 / `f666e38a80640331ef97437ced74fa176680195cbc9835be7c054243bd667331` |
| `apps/api/package.json` | `903573a873538613c054a4f9732c321587b0a45e` | 1245 / `264ff30909481ae6c8081eacfb128a9d637ca118073ac6d13a967b396f8b16ef` |
| `apps/connector/README.md` | `4495dbcde8c5b8689c94708e0eb19a63cdad4947` | 5527 / `6362f4f4cbb6fb624460dadb4764e49308bd8bc75085a265f5975ccd4bcc5f19` |
| `apps/connector/assets/workmesh-public-key.pem` | `903573a873538613c054a4f9732c321587b0a45e` | 113 / `7fd190b3b986d3536b731fa88fd847fd0c133ee1a3f2ea20381bfe6bba924fad` |
| `apps/connector/examples/expectation.json` | `903573a873538613c054a4f9732c321587b0a45e` | 1118 / `bc9edada009ca96f6f51edc249312b163319d0cf374a2816627213543dd72e51` |
| `apps/connector/integration/cli.test.ts` | `1a88137db9a7b28d207c085fd62e20cb8f074e81` | 7030 / `8e63509f8fb770e810e47d2f96978c886e7e63643c85aaf9fcf141eb98ab3f14` |
| `apps/connector/integration/native-storage.test.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 9854 / `3f2d4e3d32e81d2adaf76df9e312cb27bfa01bf942cb727b981c82d2073b5eef` |
| `apps/connector/package.json` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 731 / `a58c83c0f67bb6a81af349928abc666d5b191519d2341304f96a5d053a66cf8b` |
| `apps/connector/src/cli.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 4497 / `fdbd23c8b5c230a5f3302c581e94cbd45db6489c5254cb9efb098335207a01e7` |
| `apps/connector/src/client-process.test.ts` | `1a88137db9a7b28d207c085fd62e20cb8f074e81` | 6101 / `a3920078da1f9674aeb8773170e0caa015028adc6fe4459965a88459bc752f18` |
| `apps/connector/src/client-process.ts` | `4495dbcde8c5b8689c94708e0eb19a63cdad4947` | 3113 / `2aae1e4aaa9671ac0ba8e4e82f337b81ad286de81531534521e12e24bb5238ef` |
| `apps/connector/src/commit.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 4599 / `1dfbb63b349dbca819d4d4066e9020e151625faa57ff748cf76abb3f987c1f07` |
| `apps/connector/src/config.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 4528 / `19aadc36155ea03ebc9e16a083749c393c09119abd0157c298ecece5cd754f49` |
| `apps/connector/src/connect.test.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 13346 / `3f27974b70af19174a9c89ff9909e0a1393a8c4abe05ff428c67c3a2b4c180df` |
| `apps/connector/src/connect.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 3973 / `37c232c1f14ed48b8f50ecb64859de1a4d25bc43e66a8827463e43982883bcdb` |
| `apps/connector/src/errors.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 415 / `6a8e3f210c07296e6d7e38bdcca8aa99fff81c1715bc67b423a1733303cd1803` |
| `apps/connector/src/output-redaction.ts` | `1a88137db9a7b28d207c085fd62e20cb8f074e81` | 4882 / `42de4fed906feac3b64baf87c04e6900360f0cd2acbc1c7f620c71d0f8578f62` |
| `apps/connector/src/path-policy.test.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 2416 / `331cb45199535dba8fa976112efae2db982462dc9352351f026b8a68fa4467dd` |
| `apps/connector/src/path-policy.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 2673 / `29bea920901f9d6d18a3b30a31997178ba937489fc74042b945bf9d22ee7038b` |
| `apps/connector/src/pending.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 1523 / `4d8f9166bc7c8bcfa9f091069adaea9c03695708c722680425bc3ea6b27b205d` |
| `apps/connector/src/platform-security.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 12288 / `d1d74af7e031b719d70cb9cffa2a04ab45324e9fdbbab58b70ef374ff5c81ecc` |
| `apps/connector/src/protocol.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 10616 / `ba0bb1cb1d9ae905c549688baf70f2599064aebaa6efd9e19b5582372a132f5c` |
| `apps/connector/src/secret-store.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 1073 / `0576cd3c4d28416d9791a7bf2e81040d5012f1d0ac27b9c1a868f19f30698366` |
| `apps/connector/test-support/client-worker.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 344 / `cf586a900cfd05c3f884cae57115c447986eed3b4eb047bf238097927208cd10` |
| `apps/connector/test-support/fixture.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 5344 / `2f972fc045d9e7669909083b0b111162c1c1e7558fab9c1fb80e6f7cad474af3` |
| `apps/connector/test-support/process-worker.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 1763 / `d31464926fbad53fb0b3cc4dc186d41e92e5652348d6e7172abfbd5072bedf6f` |
| `apps/connector/test-support/raw-output-cases.ts` | `1a88137db9a7b28d207c085fd62e20cb8f074e81` | 910 / `9ed58b14c729e273cc77a11c7d26c06416bf5884980ce9bfc8db9621ca909ce2` |
| `apps/connector/test-support/resources.ts` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 1143 / `81a710003aff7e75828314cf5ce52dad69c4a338f16fceee3fdb7dbda8e577e2` |
| `apps/connector/test-support/stderr-driver.ts` | `1a88137db9a7b28d207c085fd62e20cb8f074e81` | 3259 / `74904cd8b2841aefcf34c850f32506e9c0c2ed3c5a08407eb8e90b8dadcdacba` |
| `apps/connector/test-support/terminal-driver.ts` | `1a88137db9a7b28d207c085fd62e20cb8f074e81` | 3668 / `5d4f638dca95225d2240e32a9bfee8bec2ba46b4b2813ac6dde62f4ea1fbf904` |
| `apps/connector/tsconfig.build.json` | `903573a873538613c054a4f9732c321587b0a45e` | 154 / `71ae091c7cc31e603cb811b757484850cf52b6211d1c603c401208500c04207f` |
| `apps/connector/tsconfig.json` | `903573a873538613c054a4f9732c321587b0a45e` | 135 / `1778bb6d15de37ca5f2731acc6c77eb118bd751a2092da7421d98cfeefc283eb` |
| `apps/connector/vitest.platform.config.ts` | `903573a873538613c054a4f9732c321587b0a45e` | 171 / `c5a8f9e1b8de16a09bdd7ec1f0b5698fe42afe54c10606d4ca648b57966fb622` |
| `apps/web/app/attention-center-approval.test.tsx` | `903573a873538613c054a4f9732c321587b0a45e` | 9617 / `faff0eebcec5c7492f44f69c2d00f3993ef0bf2908c9358ca9eea56382c92d4e` |
| `apps/web/app/attention-center.tsx` | `903573a873538613c054a4f9732c321587b0a45e` | 58701 / `f2cbbe7bba9de3b039cbc8ca4c790dc7a418c2f86e9767116d580ddf103c1e72` |
| `pnpm-lock.yaml` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 238108 / `9f38fc6e80d3ba3d5e4be7fcad4764f73f08ff164876bec498a27a24985a7b52` |
| `scripts/ci-policy.mjs` | `903573a873538613c054a4f9732c321587b0a45e` | 7137 / `f1d3fecb15d0db78336785fffdc7089e8a436606180673f5b69af92bc5bb5bbb` |
| `scripts/ci-policy.test.mjs` | `903573a873538613c054a4f9732c321587b0a45e` | 7918 / `2778fb4318af934118f33f49f18a825b701072a55cb4fb90af8cc248c7bcdc7e` |
| `scripts/ci-test-inputs.mjs` | `903573a873538613c054a4f9732c321587b0a45e` | 1337 / `7649baca161f4e8a0caff43978d79b29a3efb12c9584d9e57baa5fa749942cdb` |
| `scripts/connector-secret-probe.mts` | `903573a873538613c054a4f9732c321587b0a45e` | 689 / `9a2c2bb402dcc4e72e0a5778a715ed94a70f53fa2127b82d06199665b8a64336` |
| `scripts/test-connector-linux.sh` | `903573a873538613c054a4f9732c321587b0a45e` | 1177 / `fb30a9ea856c13882e0a4b18cdf6ce0d3ee1eb5b0fb0187f3233d8e3908984aa` |
| `scripts/test-connector-windows.ps1` | `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | 3513 / `0c7a08add15d80617ed0cd992631eb06216764a81fd2de60e2f2cc2f1babe73d` |
| `scripts/validate-ci.mjs` | `903573a873538613c054a4f9732c321587b0a45e` | 32652 / `6e9bc321aab843b23ec50dfc2c2a4a62aedbe1b2b9fa80023885ec27b8304059` |
| `turbo.json` | `903573a873538613c054a4f9732c321587b0a45e` | 10580 / `81eb0e43d33f7c7d09b55f7f8fc4f9d0b69fb11a9194105558767339e5469520` |

docs差异路径数：438。历史证据保留在原分支；本方案不复制其全部日志、截图或ZIP。

### #9（共同祖先 `74f247f9240eaf21e74ef248f71a445c1d4276d7`）

| 文件 | 路径历史最后提交（含merge） | head blob bytes / SHA-256 |
| --- | --- | --- |
| `OPENAPI.yaml` | `3a30e30985b2de92d4dde90d566833297da94cde` | 511040 / `3e971cd82c412fb2053e5999e6d86a391654d0a917c30affa7b8efaaa69ef4e8` |
| `apps/api/integration/stage3-delivery.integration.test.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 87087 / `1e9697a4d79631cd61bce74db9e1852619cc26647e11f726c5eb221cfc851648` |
| `apps/api/integration/stage4-operations.integration.test.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 77919 / `931a7feb0ba0a8c28ce8ad3b5a28eb15a05c6134f41626816dba70d15bb75ea7` |
| `apps/api/src/delivery/repository-configuration.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 3447 / `bf6b160df4f1d6c99c35ba4e9fdc8c923f164d3d02bc6a6264790f29c9c8b6e7` |
| `apps/api/src/delivery/routes.ts` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 95238 / `0240ae3dc7da5d005bdf8409d641e7e41c186e36e06619a1f045540b05c60a98` |
| `apps/web/app/lib/configuration-readiness-navigation.test.ts` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 1647 / `af098edce5a8f8997634b7f63d0dd84a82e62c68958ec005bbf7954c0506a28d` |
| `apps/web/app/lib/configuration-readiness-navigation.ts` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 2518 / `132d761b9dae6b2a9f7c5a6aaee2bc8f003e40ea24cba1c449f1903df1a08d64` |
| `apps/web/app/lib/i18n.test.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 27996 / `1bc97be0ad848c1a4d0e062b04d770252153b0c388cac961fcd5a5e45a1aae5c` |
| `apps/web/app/lib/i18n.tsx` | `fc14c523ae86c13e952e47d19b7508695c402d76` | 202503 / `e18a59f6b056fa53c9d2d0b3bcfc10f96dfaf24373d72dc3a1e51324541cb139` |
| `apps/web/app/page.tsx` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 47433 / `e2c0176d5b9678a6c8deaf448985c27ac0cdd8e32eb1a196e0d569e68fdf5d30` |
| `apps/web/app/workbench/page.test.tsx` | `3a30e30985b2de92d4dde90d566833297da94cde` | 2679 / `3da4c747628df82003066b0bff4ff9ebcb0ee4ed9b29cd247e0f01e13337f4aa` |
| `apps/web/app/workbench/page.tsx` | `3a30e30985b2de92d4dde90d566833297da94cde` | 3184 / `6c542e0d877d2d3ae313670a9da654cb50d3878111caedaf6aa9c3326132d8ae` |
| `apps/web/e2e/configuration-readiness.spec.ts` | `fc14c523ae86c13e952e47d19b7508695c402d76` | 16437 / `44337c8a3a96ee6495db4baaf6ca120e82d60a97a553ae107685d0cf6fd08c66` |
| `apps/web/e2e/fixtures/configuration-readiness-provider.ts` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 1336 / `991b255309731506f3a862bc878b7f7783bacf32f20a623bf8ad05d868b35d5f` |
| `apps/web/e2e/fixtures/configuration-readiness.ts` | `fc14c523ae86c13e952e47d19b7508695c402d76` | 9052 / `b51ac095e6d5e622effba5addd9b4ad57dd7d7bb9e329805b81bd8f75c208f77` |
| `apps/web/e2e/human-reflow.spec.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 13414 / `40b50996ee4dfec30b0a2c57b3d4069f2ecb268c2e9ef760223a1f23615ab529` |
| `apps/web/e2e/project-work-preview-server.mjs` | `3a30e30985b2de92d4dde90d566833297da94cde` | 93866 / `c6c096b26be70dd4f82b2816e6f27bc7f9567420b13a50c65c1779ae5147ef8d` |
| `apps/web/e2e/stage0.spec.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 22484 / `a110839ca44664c9f62e0012c1638c3ee3d7a026402f9e6bdd78e25ff5ac3751` |
| `apps/web/features/projects/project-repository-configuration-races.test.tsx` | `380aad996489dbdabddd212be8f45edbcdda7209` | 5969 / `dd7a36112228898cce97fe253f4e36fa4988f76fb0dd51c02eabaf7ffafe9471` |
| `apps/web/features/projects/project-repository-configuration.module.css` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 993 / `28eb9f145a41bd5f6801905545169d7bfe5da8d6bbab62caea5e30b2cb2c4523` |
| `apps/web/features/projects/project-repository-configuration.test.tsx` | `fc14c523ae86c13e952e47d19b7508695c402d76` | 15471 / `85eabfc712b39152bf11b9ae0ba6b3e52a12f6977bf1959d5b7c2d8dd8f8aafe` |
| `apps/web/features/projects/project-repository-configuration.tsx` | `380aad996489dbdabddd212be8f45edbcdda7209` | 23737 / `233750cecb47f755fb125c34c59303db8ca39760bee85db8b21eafcb31a0b36e` |
| `apps/web/features/workbench/configuration-readiness.module.css` | `3a30e30985b2de92d4dde90d566833297da94cde` | 886 / `38a72a9f31deb165378ea59f1da19c76054ca6684af49905a5ebe124d3797ef3` |
| `apps/web/features/workbench/configuration-readiness.test.tsx` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 3328 / `c8b463a6e4b4c6e79df157787c525421e7620fa12e2a9fbb28980daf89cde678` |
| `apps/web/features/workbench/configuration-readiness.tsx` | `3a30e30985b2de92d4dde90d566833297da94cde` | 5620 / `09c98f77e76fb55f368755708aee080552859369eb888a0fe4d49cd19d52238e` |
| `apps/web/features/workbench/conversation-workbench.module.css` | `3a30e30985b2de92d4dde90d566833297da94cde` | 11288 / `7c578de998794298d315fc85f95c2f9f8544003ca6a856ecba601c9c44171658` |
| `apps/web/features/workbench/conversation-workbench.test.tsx` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 10710 / `0165aaaebb0da154d739bc0e60c08efc672085be975827d8eeff6d18ae99e880` |
| `apps/web/features/workbench/conversation-workbench.tsx` | `3a30e30985b2de92d4dde90d566833297da94cde` | 34789 / `3e850cb0ed8467efa986339c7552550040d98fddf986a1ccb6a5cefca48f62b2` |
| `apps/web/playwright.a2-lite.config.ts` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 648 / `4bc1c255350f561b927b8f9b85f511961645d802c74dc07534d51ab3eabcdf33` |
| `apps/web/scripts/check-i18n.mjs` | `3a30e30985b2de92d4dde90d566833297da94cde` | 35694 / `bf2d8a643f10c377f7e42b8a18029d5652d72ddd5c2a188c000cd61a48d7c913` |
| `apps/worker/src/provider-actions.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 74385 / `cb181f6e14de36401b0cd7840d22a1574acb819f165e992c8c5caf9f593db376` |
| `deploy/lite/README.md` | `bb86b1fe31e9b23f6e91171b526c860a0a0fcb22` | 10276 / `b2804adc08a60d5087a8a501e2241d669c387b09d02802871f1f2dcff235da2a` |
| `docker-compose.lite.yml` | `bb86b1fe31e9b23f6e91171b526c860a0a0fcb22` | 14650 / `9d6679d8df506d4f0ad3b11faa051f5326aedef4341a6e5d6d6ffdfe95bf900e` |
| `infra/docker/lite.Dockerfile` | `bb86b1fe31e9b23f6e91171b526c860a0a0fcb22` | 5808 / `cda11e2c6ee51cd7c4b499aa8e6f8f1b6e7d8f02138e74e93a6b100cd532c5ee` |
| `packages/contracts/src/index.ts` | `ca5daf4c0f024ce1b42f8c940125d824ebfcfe03` | 185833 / `30c064cbd4f8e4434cbf74d6d6853bd160d1d6bafdebd3d122fbc8d2d0d5a1d7` |
| `packages/contracts/src/pagination-contract.test.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 4908 / `1405bdfd8ff9fec52aad92993ee7127661ee14c23c1f613f20d526f7aefa01ca` |
| `packages/contracts/src/repository-configuration-contracts.test.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 1243 / `6d1c53f3ffed4402082f4bb5411b917a38bdc42f738f5ee5e274e0ae64279262` |
| `packages/contracts/src/repository-configuration-contracts.ts` | `3a30e30985b2de92d4dde90d566833297da94cde` | 2465 / `41b37bda37f2976a82dac1748be66a6c80734b25a988aa91a5206902ba007d97` |
| `packages/db/src/agent-lock-order-manifest.ts` | `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b` | 27527 / `3ec8dcee876bcd4d75a25d623fc718d4e60e17f6624999cf40df780074693881` |
| `playwright.config.ts` | `ca5daf4c0f024ce1b42f8c940125d824ebfcfe03` | 5035 / `b8f533c5f88331915df4502c8fc19919611280cd5b5565fdfd0c892564b38cf2` |
| `scripts/verify-a2-lite.mjs` | `bb86b1fe31e9b23f6e91171b526c860a0a0fcb22` | 21912 / `e5a8c8a8c0768c5835d1d5cb56f047e8305e2d972a1324328552cabbe4c68b32` |

docs差异路径数：4904。历史证据保留在原分支；本方案不复制其全部日志、截图或ZIP。

路径历史列不是可独立摘取的补丁；merge可能整合其他parent。#16 `5c870d9fe3c30736b8ce87292e1d0bf35838ae83`自身对first parent包含quota sentinel恢复及+38行集成用例，必须纳入，不能只读非merge历史。

### #16（共同祖先 `74f247f9240eaf21e74ef248f71a445c1d4276d7`）

| 文件 | 路径历史最后提交（含merge） | head blob bytes / SHA-256 |
| --- | --- | --- |
| `.env.example` | `61736fa2298279f76642309ee2e2478439258f80` | 7184 / `c1a4ba91969230f2f8fb9dafe22e36b6d272f4022e57c8b45c65556aa97fd758` |
| `.env.lite.example` | `61736fa2298279f76642309ee2e2478439258f80` | 6504 / `198b6e4292fec7dba64bad390607fcc00c4a271baf291eb22669b67f9851764b` |
| `apps/api/integration/notification-channels.integration.test.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 20583 / `017d1bebd6b04b7e58e5d48139147c150d644008ac860e3abd504b5c86e36838` |
| `apps/api/integration/wecom-notifications.integration.test.ts` | `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` | 29385 / `3df801c246aab7c1d89939014896fd8e5a5e7d077cc51555f54303bbe6c62382` |
| `apps/api/src/notification-channels.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 9620 / `7764dc94c619e3548745838a3c4a1821afd4fb5f0c48f3276b490fe141c08f8c` |
| `apps/api/src/server.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 73210 / `b33702607927fc991b04e945aa2114382da7e0b76036998d194f3b3b8a9440fa` |
| `apps/web/app/attention-center.tsx` | `61736fa2298279f76642309ee2e2478439258f80` | 59409 / `5fd1daa7485a0627a3acb795df81cf76e1d7872e563d6953ef6f725862780295` |
| `apps/web/app/lib/canonical-route.test.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 3534 / `00819c8b024b1c9c08f188f75b5dbf8c56a0e266720f82fa37a0e3adabd5dcb8` |
| `apps/web/app/lib/canonical-route.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 5442 / `1c5cfb180c0e6dbe61decef553905dfae7cf2f230fc3c16993ac3cd116be31cd` |
| `apps/web/app/lib/use-authenticated-actor.test.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 6157 / `c8716c5a035f725547bdaf641ecff45d7d0ae21a244110b35f31eb824bf8747e` |
| `apps/web/app/lib/use-authenticated-actor.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 2094 / `ffbc7fef28a3a591051a83872ab3371723cbdb8fc57fce0bfefea6825d1c4840` |
| `apps/web/app/login/page.tsx` | `61736fa2298279f76642309ee2e2478439258f80` | 3024 / `e78690a006bd15c910790c4e9221fbd296e91496d7ed293541c5d7288ba10f0b` |
| `apps/web/e2e/attention-center.spec.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 9218 / `c851d93ad0e5bc0d2089953b728e6cfebbcb6cb16a78c70ba61571be0d1fc4f5` |
| `apps/web/e2e/wecom-notifications.spec.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 7097 / `91908fcbfbdddfc9f837128f0c99545dd1b46533b6282c3560a135cbc79229a2` |
| `apps/worker/package.json` | `61736fa2298279f76642309ee2e2478439258f80` | 914 / `efcfc1776198e0b9ff932e8c39eb9eeff1e8e0fa4a56b0bc8486809f087678ae` |
| `apps/worker/src/agent-webhook.test.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 6889 / `94e347910a4cc52dda8b8802d77cea625ad1b5ebf3f62bb64b0d78eda4ab3a9d` |
| `apps/worker/src/agent-webhook.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 22447 / `6eb96182453231153cce4d362816f298ac77c2459b048deb53d69df123fa7708` |
| `apps/worker/src/automation.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 42608 / `421bd61ffdf5acddf4de3703fdaa7787386a9ec94f18819d1b6214a49afbc9bb` |
| `apps/worker/src/index.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 20422 / `f5f5028be9d032ae9365b82f4cffff6c19acfe4e0d707add2071c52a20560180` |
| `apps/worker/src/wecom-notifications.test.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 7361 / `f1fe63cf6d9efa9bc9ee6d6c35394550e67548e481d2228bf7e3d58110b3d1e5` |
| `apps/worker/src/wecom-notifications.ts` | `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` | 8513 / `b5cf99a2fbbc760e1d59bc469bc11379a50a84c24a47233b382d7ef4bcab6cc6` |
| `docker-compose.lite.yml` | `61736fa2298279f76642309ee2e2478439258f80` | 14707 / `2e2c6b06061e0ff188cce098d7a410331bd17c0e7e4b2cd5b201a59066072973` |
| `docker-compose.production.yml` | `61736fa2298279f76642309ee2e2478439258f80` | 13325 / `6e992a134e07b0a20045e1d60e5b8d8cb940d719f3aa2d53bb81a7e7b192bee8` |
| `docker-compose.yml` | `61736fa2298279f76642309ee2e2478439258f80` | 14362 / `14a3de0ae9387d97a5f31e04eac4e84bc6021d0eebefb29a383fdd76393ddad4` |
| `packages/db/src/channel-notifications.ts` | `61736fa2298279f76642309ee2e2478439258f80` | 34330 / `01d5b3ab88dff05c9174a4794833fb95aa22eded22c3fb7ea88c13ab617978a4` |
| `pnpm-lock.yaml` | `61736fa2298279f76642309ee2e2478439258f80` | 226399 / `73ce6916c9201658ddea4793f8b3305b5cc8e3abe829bd650a9b40d91958e6a0` |

docs差异路径数：790。历史证据保留在原分支；本方案不复制其全部日志、截图或ZIP。

## 工具输入及缺口

- 完整任务边界来自本轮用户注入Spec（09:53后端独立交付授权）；其文本不从工具截断返回重建哈希。
- 实读todos：#5、#9、#16、#29、#32、#43及全项目列表。#9/#16/#32长正文/保存方案返回存在截断，不为截断前缀计算全文hash，不宣称完整读回savedplan。旧卡受控全文从上述精确commit的docs/plan与docs/reviews原件读；#32仅利用实读可见建议范围。
- main经ls-tree查无`docs/plan/2026-10-08-todos-functional-alignment.md`与`docs/plan/todos-alignment-20261008`；可见TA平台卡不是这两个本地全文文件。当前无法验证完整TA本地包及其hash，不猜不可见内容，也不要求用户补Chief已有状态。后续被选TA卡由Chief归档精确受控全文到原todo分支。
- 本轮工具目录有tds，没有mcp__workmesh__能力。沿R1已授权的Todos＋仓库记录例外交付，未创建真实WorkMesh Project/WorkItem、未冒双轨同步完成；审查及后续裁定留本卡对话，不创建整套流水线。
- 未读取外部模型目录或私有客户端内部实现，不承诺型号目录/OS已验证；真实客户端验收在后续批次执行。
- 本轮平台独审针对方案head `32a5c2c1270b1038d65a391a6b771aff42842c85` 提出三项blocking；意见、修订对应与实际检查归档于[review.md](review.md)。此前构建内审查只作辅助，不替代平台独审；未宣称本次修订已获复审通过。

## 本轮资源

仅当前方案目录新增Markdown；read-only fetch由平台共享cache管理，未新建worktree/clone、容器、镜像、卷、网络、服务、系统秘密或临时配置；Python/Node只执行同步检查。当前workspace与各旧任务证据保留；没有删除旧资源、没有触发审批拒绝或绕过。

## 补充：旧卡受控方案与历史提交原件

下列均从精确head的完整Git blob读取；不从截断platform savedplan重建。

| ref/commit | 路径或用途 | bytes / SHA-256 |
| --- | --- | --- |
| `5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19` | `docs/plan/connector-recovery.md` | 9645 / `71a0e7845b205f60ecc29b91e66bea2f2086004c16212c03034a51fcbb5b6352` |
| `5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19` | `docs/reviews/b1-b2/implementation-report.md` | 9273 / `fda5d73262c3e8ed695f7bd3a0eeede3d2756ddfa168a01d99ef30b75aba93f3` |
| `5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19` | `docs/reviews/b1-b2/review-revision.md` | 11350 / `47ef69907aae40c2886a5503996198175bff0791cd4b4fe657f286829afa7673` |
| `741623eca9d26439e575d6119f7ed97d37df1fde` | `docs/plan/a2-configuration-readiness.md` | 17436 / `b9586ccbe50666ee7a5530ea9ce8f5a295ec9385b8711d81e0fb14648476c4a2` |
| `741623eca9d26439e575d6119f7ed97d37df1fde` | `docs/plan/a2-configuration-readiness/current-spec.md` | 11506 / `7afb314d31400fc4ccb3d63d4ce8e097dec3692fda66f375a171f5c732f68be1` |
| `741623eca9d26439e575d6119f7ed97d37df1fde` | `docs/reviews/a2/implementation.md` | 15582 / `a766c89850f51b142ab2058d69a8b814529d7a8ed866cd4c2133d0d0e7cc487f` |
| `741623eca9d26439e575d6119f7ed97d37df1fde` | `docs/reviews/a2/context-read-generation-review.md` | 6510 / `d98a18a5d91585c41ea102376f18eff0fb3ada2fc60d7a2c856470bba0178d8e` |
| `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` | `docs/plan/c2-wecom/implementation-plan.md` | 9505 / `8369303eb7aedffe3d289a97ce923951843f9629b9580288fc37c694061ceb55` |
| `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` | `docs/plan/c2-wecom/product-design.md` | 13891 / `bb2e6a5eda2ac4fe893e10ebe3e7e6f1de839a719bf4fc1940dc7759ec34f0a5` |
| `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` | `docs/plan/c2-wecom/current-spec.md` | 10633 / `542a1d41013a9b06f256ed3dc5388a6bad20e7fff49fff18380b35cb7e67b82d` |
| `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` | `docs/plan/c2-wecom/test-coverage.json` | 51717 / `bc92dbc1bf17d3983ef67f81f72ed37a0b6b8591e874af8ed428a1560f4e7d3e` |
| `903573a873538613c054a4f9732c321587b0a45e` | #5历史实现/修正，短引用`903573a8`；完整path blob来源以上表为准 | 不适用文件hash |
| `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` | #5历史实现/修正，短引用`375990f1`；完整path blob来源以上表为准 | 不适用文件hash |
| `4495dbcde8c5b8689c94708e0eb19a63cdad4947` | #5历史实现/修正，短引用`4495dbcd`；完整path blob来源以上表为准 | 不适用文件hash |
| `1a88137db9a7b28d207c085fd62e20cb8f074e81` | #5历史实现/修正，短引用`1a88137d`；完整path blob来源以上表为准 | 不适用文件hash |
| `c1c7bca6b3231144c7bcfadff390c479ab116c22` | #5历史实现/修正，短引用`c1c7bca6`；完整path blob来源以上表为准 | 不适用文件hash |

## 收尾remote ref复核

实际工具读取时间界于 `2026-10-09 02:17:45 UTC` 与 `2026-10-09 02:17:47 UTC`；`mcp__tds__git` 参数 projectId=`DzkLDn6UW-IbfoTJzN9Ro`，args=`["ls-remote","origin","refs/heads/main","refs/heads/tds/conv-01a11ac2-a0a9-7ef6-bd48-3bb37c21a301","refs/heads/tds/conv-01a11b27-cfac-7ea4-a461-8eef51b750fe","refs/heads/tds/conv-01a11b85-41f9-74f5-b456-7083d4d83e5e"]`。四个SHA与开工来源表完全一致；这次只证明ref读取时的对象，不证明PR审查状态或新的Required CI。

本次平台独审修订再次以相同projectId与四个完整refs执行上述 `ls-remote`，实际时间界于 `2026-10-09 02:37:50 UTC` 与 `02:37:52 UTC`；四个SHA仍与来源表相同。本次被审方案head为 `32a5c2c1270b1038d65a391a6b771aff42842c85`，修订只改方案Markdown。302个完整来源blob与277操作的复核结果、三项平台blocking及修订对应见[审查记录](review.md)；本次没有取得新的平台复审通过或远端CI结果。
