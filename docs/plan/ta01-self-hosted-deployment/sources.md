# 来源与完整性登记

## 准确基线与授权

开工独立查询真实 `refs/heads/main`，与本工作树 HEAD 同为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。该提交是 PR #226 的 merge；父提交含已审路线 head `3ac64f636d673906c9b5c6a0237aa7ef0e3fe726`。本卡主线来自 `git ls-remote origin refs/heads/main` 和本地不可变 Git 对象，不用陈旧 `origin/main` 推断合入。

本卡 ID 为 `zTp9s5nPMWiUfQ9Ju1TB_`，稳定标识为 `WM-TODOS-ALIGN-20261008/TA01`。平台完整计划为 `doc:X7D1XMP5_XpGdpyYKCVNZ`，从完整 current-conversation 返回取回，并与用户本轮注入全文一致。当前规格的授权仅覆盖方案和现有部署测量。用户本轮要求执行全部文件改动；原对话包含 `Confirm plan.`。

Chief 对用户的原问题与原回答未由本卡对话工具取得。本卡完整 Spec 中的“合入并接续 TA01 规划”是平台捕获裁定，按其来源保存，不伪称亲读 Chief 原对话。#32 合入和 #20 完成属于复用输入，不是本轮新增产品通过。

规划轮平台 Git 返回共享缓存 `index.lock`，没有处理锁；该失败只说明缓存未就绪。本轮不重试共享缓存，不以可读本工作树冒其已恢复。

## 来源字节

工具响应采用 JSON 行数组编码，以 LF 拼接可逐字还原实际正文，保留行尾空格和截断标记。原正文 SHA-256、编码文件 SHA-256 和文件 Git blob 各自独立。`spec.md` 与 `implementation-plan.md` 保存准确提取字段；来源工具原件含元数据和返回边界，不混算字段哈希。

### 平台返回

| 原件 | 完整性 | 原正文 SHA-256 | 归档文件 SHA-256 | 归档 blob |
| --- | --- | --- | --- | --- |
| [backend-todo](sources/backend-todo.md) | 有截断；仅原前缀 | `058080bfe626e230edd5b4915430550cf521789844138b429b975f4675264e14` | `7823b5ce0e917d3f0b440409f801cd04a5b9da0ce2745092efd0dde3c372fd41` | `ee1be63089f4c139e8fab74bcad171e04c20f4eb` |
| [connector-todo](sources/connector-todo.md) | 有截断；仅原前缀 | `a654cd7402b251d5e3c99107ccf680fcae3b9c2b64876ae5378a0534b9c79a62` | `e14b96f4a1b322b9bfbc5894f7286ef151b35f97fd4830e7f0176077c2131fa2` | `67447097d473ab23bbae749b8c96a2b23efa51ad` |
| [current-todo](sources/current-todo.md) | Spec 完整；Saved plan 截断 | `7a74a9a2c29aee04f3159d9b1186d7faa2ab85e4a70bc4998d783635f69cb810` | `16618eb5d88997711c4788a2ebbc98be86739358ae7019e65174a3fd6ed3f329` | `1a0d891bd91ff3fa303fb3baf42ce8ef0cc20c4f` |
| [enterprise-todo](sources/enterprise-todo.md) | 本次完整返回 | `8a01927a171ce0661b9106d5ea92cbc7e3545cbd5abfa1cc02432afb90b23a89` | `1776d1c1d33b2873dc5c377dec9c5b3a30c9ba72a4487287e3d7cf1dad92c2fd` | `ef23ca452c1a0af4aa524cefbc7672c1e80a8e37` |
| [integration-docs-todo](sources/integration-docs-todo.md) | 本次完整返回 | `9aa27f45db0bf22e02d656a09c69bff8cb71eb2c012f1867189bb1498962031a` | `0cbfb7475b2e04880b03edc497019c72fc84f11afaf52f1fa2397a0daf0ce920` | `a6007aa782d89dd5db250ebb330445725f24c882` |
| [joint-todo](sources/joint-todo.md) | 本次完整返回 | `280f1e20f030091ce424f2b56c4fb58137f49a57031378cca26ed2ae789b112e` | `38a176be8e5f1d858390be5d36105691f8ad5a95427086ab1eb0c9767191e697` | `39f9294a9d0ded6ef53136273a6f72ba11fdef9f` |
| [roadmap-todo](sources/roadmap-todo.md) | 有截断；仅原前缀 | `402b9a874ca92275d17ce4ebfe8b82ad296cf3678a76021c327f96484ba2a6a8` | `1944b635cc01767f7f16112537ae208682f081676596d41a9bb54f04d8ad2269` | `ba4ca7ea5c5b02c40e8f23b5f4866cd7536e0604` |
| [current-conversation](sources/current-conversation.md) | 本次完整返回 | `c87d205ad4bd49885d6fc66676e7297cff068a4e3a0c58d9edcb5583f0aff2cb` | `501a97648eca4b3352b50d216046ce0685d8e4da3bb82e5cc4f23882d4dc6f1e` | `a346ac4c5a1eb42beceef15d016ed198707f880b` |
| [roadmap-conversation](sources/roadmap-conversation.md) | 本次完整返回 | `397a9177dce7970688ef11af4177d24d87702df91d9cc63f1aede97f5fe33e5e` | `df12fb1c573276cdd802c121ee2bdf06fe1a159109994b0bec24f5457726626f` | `cccf6b2fd83eb4b6fdbbbe38670e4c1dbd32ac82` |

字段来源：Spec SHA-256 为 `25628c0db9c7bd38f520aacd6e95c3850b4d53403444c6744c529a88011ebd1b`，计划 SHA-256 为 `39c7b13188683c795ce14bd28cddccb3dc7b19aaaafa733f5f31011e0aa48049`。实际暂存及提交 blob 在验证记录中另核；这里 `git hash-object` 的计算值不能单独证明已提交。

### 已合入原材料

下列文件取自准确主线 Git blob，全部原文可逆归档，不更新历史裁定或原文件状态。

| 原路径／归档 | 原字节 SHA-256 | 原 Git blob |
| --- | --- | --- |
| [docs/plan/backend-infrastructure-roadmap/README.md](sources/git-01.md) | `965c1d3691c7d2f69f07cfd13a0209a0c410f7e5488d5f4dba88f39f5ffaa92e` | `df0425b868cdbd57c2532605bc5abfe94b15ced7` |
| [docs/plan/backend-infrastructure-roadmap/coverage-matrix.md](sources/git-02.md) | `d9dd24014b8ce4fa54e117336e675778f3817cb39d7bb2b0ece6047cd9e96973` | `d83ab465438b22a70dd316268bebf087280c3ad4` |
| [docs/plan/backend-infrastructure-roadmap/dependencies-and-acceptance.md](sources/git-03.md) | `8e5c3a78487e1c594fd6d2d03d3af0f87e203311f43143c6afeb75f62a29b858` | `2ba2cc00cd672143070c2a5aec2f6ecedda27ddc` |
| [docs/plan/backend-infrastructure-roadmap/sources/todos/33.md](sources/git-04.md) | `298cfa9f52dc8ddf28d57c9910624afb6e0bf696d75f926da9572be78fd68f0c` | `a5bde32bdf5175ea4e316e9f849e21451bc536aa` |
| [docs/adr/0071-lite-single-node-self-hosted-deployment.md](sources/git-05.md) | `bf5e4e81da36a4f9cc7bf615c3776c66620be50db768c99ff8c5a8f0484fdadc` | `5309c6e3e4f78cdbe5846bac859e34cd9ff6ac6a` |
| [docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md](sources/git-06.md) | `5c9db399db9abf65d95b93e99f6e2d091de15c17ce922f160c2868445ba3f22e` | `fbfb4c866a00d6541c51b17228fe5de715d934d5` |
| [docs/adr/0035-retention-archive-and-heartbeat-projections.md](sources/git-07.md) | `71f20c7d552b7827123d4b0f0802fd5490c05eb365b1dccf4f4588187e213295` | `c0a51a1289923b0d9d5fb78f4bfdefbf9ba1cd3e` |
| [docs/adr/0036-exact-archive-membership.md](sources/git-08.md) | `c57536b04d0125ddd89a3241928e8971342ddb9155aea620480533709e8cc981` | `0267132783bc6675f5c17062c27a91605c39bc65` |
| [docs/adr/0039-authenticated-complete-recovery-bundles.md](sources/git-09.md) | `ce047db95be691b092b4a25939b6e930ca43469f99a13ccee086dab3de71076e` | `d668adaa61e50092fd5d1dfa1e7a65d4540288d5` |
| [docs/adr/0070-artifact-storage-on-rustfs-and-header-signed-uploads.md](sources/git-10.md) | `7287be92bff8c581223902793c7df8092c62bca3977e60ae8bfa407f0d851ccc` | `011b906c23a593f2e95a29d7e39959afb3893b90` |
| [docs/reviews/b-ship/product/progress.md](sources/git-11.md) | `3cdbad4f1748c7845ac64c3c7b90417173bc1b883e9da0660d79eb7059031baa` | `448e9716b5f7b0ebfbbcdfa186130da0c5260226` |
| [docs/reviews/b-ship/product/artifacts/README.md](sources/git-12.md) | `515ad648f344df4fe18c44212f1e577999d64d4f4a9e207c774b44546171a4ba` | `eded9fc0de4b7677acce4780b6e45f26b1deef32` |
| `docs/reviews/backend-retirement/verification.md` | 当前 Git 路径缺失，未补造 | — |
| [docs/reviews/api-mcp-docs/verification.md](sources/git-14.md) | `7d7b90870b230248ec1b11ae8d040ab17310d0f3613155b6e2d8a608c108becd` | `18ce2fc6be9e793d03e634b5e5d3725e9797db81` |
| [docs/reviews/backend-retirement/README.md](sources/git-15.md) | `c9cb9a03d6bf059ded699fa29cd63a489a862b25b86efd71fc44b365401e9f7a` | `916eba137915a6c85dc1128ddbb93bcfad6757a6` |

### 当前实现绑定

这些原件已存在于上述不可变提交，按原路径阅读，不复制运行代码。

| 当前路径 | 原字节 SHA-256 | 原 Git blob |
| --- | --- | --- |
| [CONTEXT.md](../../../CONTEXT.md) | `d67c4bb38a57877354e8968747ad0ed3890108cb81feca53e24af97a4593f238` | `c6b6544e2c80ebb207bceb19eb45b48ff5855ac6` |
| [AGENT_PROTOCOL.md](../../../AGENT_PROTOCOL.md) | `31d8d78e79404d8f2199c686aec4294c0d4a73e7d46ece282725c42e38bbe563` | `8c64e53d6968250a63bd6107b7b646d8b99e85cc` |
| [OPENAPI.yaml](../../../OPENAPI.yaml) | `9bb63b5952ce400b71b5a028027b7fec086147bf909030c2e44a634b3460f57a` | `01b63733c9314efe1551d676c315ea8cb9377bc1` |
| [SCHEMA.sql](../../../SCHEMA.sql) | `3836495ed9355c19262de2eca2a0f0a02b9ca85e7d7bbc21b11aacd30784dd08` | `6b4d99d910c7db0a6547bf7e4cf88c38ea01c563` |
| [package.json](../../../package.json) | `a324b78823983f90dbd8ce68bf8213c28a121fb879d74c9f8a2e28385758c0de` | `11ef0758a7c9fc89950fbd4afd25e419d7006652` |
| [docker-compose.lite.yml](../../../docker-compose.lite.yml) | `1aa1a3780a7b0d04e1f3a50f8c43b12287b484d59b5a661e44e1a688c83a93d6` | `3e6f2e52402e21723759a9dc4303c889f877e669` |
| [docker-compose.production.yml](../../../docker-compose.production.yml) | `dd1a9cf2c5cfff621ca1779297cca16425ca7c474713e8a6e9c56cee18d77c87` | `bf4b3ed794a5e1c3fb3d58efbb0b0f70c9aa7cca` |
| [.env.lite.example](../../../.env.lite.example) | `100c0185ed49e56bbfb700e3f0d30ae999792a8ec99a3514fba274e1b5134df4` | `83dbbaef4c89a929df528b57e8bd5e95c9bbf416` |
| [infra/docker/lite.Dockerfile](../../../infra/docker/lite.Dockerfile) | `d83fd7d285f36afb94df5aa7e1b2d3aef5bcb5b149f2d2f56e775067ea7257a8` | `b5c8754a0671a55dc9ae7f7457508da0c99fb00f` |
| [infra/docker/runtime-guard.mjs](../../../infra/docker/runtime-guard.mjs) | `35ad273b92b71181c2461b64419bb032d3653f65c23e3cb5cdd6134ddb937cd6` | `2199b77833a730456ea7cbe4a4889ff95f595b69` |
| [packages/config/src/service-command.ts](../../../packages/config/src/service-command.ts) | `facfb3e60a19f0e6ab1dbc19be6c80eaa31eab880c6d55f852556aedef36f348` | `48cb542a597927302d748ea2b9c11f6a75903722` |
| [packages/config/src/index.ts](../../../packages/config/src/index.ts) | `4983be8413442ba94de69c16771c784c04461e9f5cfb4845bf535531703a85d2` | `79ecc76cd2cc164ff8e01550f1a82d483e7cb023` |
| [packages/config/src/runtime-secrets.mjs](../../../packages/config/src/runtime-secrets.mjs) | `daf30a61fdf451437c8310281b63a36fb414ecf5c423e91f984bbbeb95257d3f` | `d8499bf261b7bd15eb6dd8eba8387a13cd050e8c` |
| [packages/db/src/migrations.ts](../../../packages/db/src/migrations.ts) | `5fa40898efe4a87001e6a039026956d00f35b52e6ead06560715490b148213bc` | `950ad1c73af51d4b56a8c8cc802767ad111ae414` |
| [packages/db/src/migration-manifest.ts](../../../packages/db/src/migration-manifest.ts) | `c0926c0d7a471c3346727a23c1fac9c599c05a75986996ea0208006463f24f22` | `c9f82fb929ee2987fb402a8bca92b964e6e1f62d` |
| [apps/api/src/auth-rate-limit/limiter.ts](../../../apps/api/src/auth-rate-limit/limiter.ts) | `53e4b442298b192eb0d34f5d0672bce8ef436d41b75552e0c828e51556a2c819` | `91ef5c0685861c95249caeee4d994e1a689a006c` |
| [apps/api/src/auth-rate-limit/redis-store.ts](../../../apps/api/src/auth-rate-limit/redis-store.ts) | `18ab78da1b6c541e7ba4b038384da54cad14f9b0dc819defbcc84c008e38ad84` | `922902389f8854847be8bfa8ead170f6e69f6de6` |
| [apps/api/src/realtime/coordinator.ts](../../../apps/api/src/realtime/coordinator.ts) | `d5590c2362a6612a076bc539fb0b556ac8f97b958c891353419f4b0b78cf3dc9` | `3284611becc67165ac4d3870b667893c8c83929a` |
| [apps/api/src/realtime/wake-source.ts](../../../apps/api/src/realtime/wake-source.ts) | `80d42f1fcc21a30a66efa169e07b2e03b84d1db8a77f773d1b36a18eb0147fef` | `ae28ff2f5e688853144510f7eaeeb5a132e36010` |
| [apps/worker/src/index.ts](../../../apps/worker/src/index.ts) | `275ce5811388aaffbd227496f8870a843832bc8913c87a5bda79c632a4c385c3` | `17b78f3ce4f62d7d7a80bbd678024f81681bec42` |
| [packages/artifact-storage/src/index.ts](../../../packages/artifact-storage/src/index.ts) | `199e8e0ec003062a3fa573b9746b07e7ec56943af731bb58daeeeaa42ec3a376` | `9055ad59ccd728951b9ad7d7c1beb1449496d6fe` |
| [packages/recovery/src/backup.ts](../../../packages/recovery/src/backup.ts) | `7e04dad3cf7f10ba551f1526ab3117d6d4365a873138cc97b903519ba743bf62` | `754ccfabb6d19bf826fe4916a7e892cd61bf892f` |
| [packages/recovery/src/restore.ts](../../../packages/recovery/src/restore.ts) | `d01615d2055f3ed347d4a5d6a18c69db2a5c011920d4ea2ef43a4503caa8bd98` | `82bbb4c1c283f177c255a1256b9a6f17a2bb4845` |
| [packages/recovery/src/s3.ts](../../../packages/recovery/src/s3.ts) | `2ba4d651520d1fffbc1e97079fbfe49ac8a102043b91e6451928d946e13b3b4c` | `7862f49619bd8f9d367120ffb5b6ede024a723c7` |
| [scripts/verify-a2-backend-lite.mjs](../../../scripts/verify-a2-backend-lite.mjs) | `e3c015b2037fe2e50d65e48ea1ddeda2d4720284098499c783320317e77f2f25` | `0933f04bd8d64b93427076ece9ca1b709d621f13` |
| [scripts/verify-a2-backend-lite-api.mjs](../../../scripts/verify-a2-backend-lite-api.mjs) | `9fc974bb40db6a246f18097bdc321630699f2a8698eda934b045540ec22bd498` | `c12c2d4e76a6131bad6ac6352815cf378f951066` |
| [scripts/ci-policy.mjs](../../../scripts/ci-policy.mjs) | `ab8682ea043968a11960bd5855f61add89fff9049ba92eec3b10326264819537` | `4c766592c8100edf432823c16305fe40be49e928` |
| [docs/documentation-maintenance.md](../../../docs/documentation-maintenance.md) | `1d6dd1bf6f7c781a4fd37cf02d0be9cec1e2fb6bc9c7e0071e45d02eda9fdccb` | `3442c63e0b6adfbb995e6a3e5337590b9f566568` |
| [docs/integration/README.md](../../../docs/integration/README.md) | `1cbd2a72554dcc4753885b760412923306b1d5ca51167d986b01db7dc9f18bc5` | `37f1eeb2933be95df66d70879be8be139accd4fa` |
| [docs/integration/reference.md](../../../docs/integration/reference.md) | `78103a866358498f19cafc2c3480bee3efc5de4cd3d6bcd860ed18d7c17f48eb` | `3bd8587cba5e9680ec1f04b30e4bd5dbd4817a05` |
| [docs/integration/installation.md](../../../docs/integration/installation.md) | `fa8690f3167088c5f72595b39ba98d396f274dd41e7c4fd90078a309567ffd8e` | `d7ae8ac79d4d35c7c796209efaca56dacc3a86f7` |
| [.env.example](../../../.env.example) | `17539d4faf34d1a04b5d53f459080a7934d8a060ab2de3adb6cfe6c0fcfd13f9` | `d2335f3b41517d4c95666b15e9c20f660df8d09d` |

## 外部来源与缺口

本轮规划读取 [Todos 安装](https://todos.dev/zh/docs/install)、[快速上手](https://todos.dev/zh/docs/quickstart) 和[平台机器](https://todos.dev/zh/docs/platform-machines)。它们说明个人使用起点、规划确认流程和平台机器服务，只作为产品对照；不证明 WorkMesh 自部署、离线或设备支持。没有下载外部凭据或调用实际厂商。

中文写作源为仓库 [zh-tech-writing](../../skills/zh-tech-writing/README.md) 的固定 commit `ffda9353768dece8aabd26ccb3a4978025e9437c`。主技能、manual-structure、typography 和 MIT 原件的哈希由仓库 source.json 与文档检查器核实，没有全局或团队技能库安装。

`docs/plan/todos-alignment-20261008/tasks/TA01.md` 和 `docs/plan/2026-10-08-todos-functional-alignment.md` 在当前树及本机可达 Git 历史未取得。#32 已归档当前卡及历史来源，本轮保留它们的原件；不从记忆重建缺失的旧文件。这个查询不证明不可达或其他机器的历史不存在。

#20、#61 及 #32 的工具 Saved plan 存在截断，不给其截断字段生成完整计划哈希。#20 的当前产品材料以已合入 Git 工件索引和进度记录复用；#61／#62 的既有验收仍按原日志的环境和范围解释。真实设备、OS、CA、账号及离线组合未指定，不能把既有测试扩大为新画像通过。
