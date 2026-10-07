# 最终隔离构建输入可达性验证

## 结论与门禁

真实隔离构建已在材料合并后的实际 base 中读到四份 ADR、完整主计划、设计测量原件和完整 R2 审查报告；输入校验退出码为 0，44/44 文件可读，P1 台账为 16/16 条，错误数为 0。完整逐文件记录在 [`build-input-reachability.final.json`](build-input-reachability.final.json)。

初始 base 的正文读取门槛通过。当前整合计划已吸收 D0 合入 main 的增量；本轮必需检查均通过。G1 最终门禁仍为**待本分支 CI 和用户指定的独立复核**，不能据此放行 #3 或依赖输入的实现。

## 本次 build 的实际基点

- 构建环境记录的当前分支：`tds/conv-01a11661-dbed-70ca-85d6-05851a0213e1`。
- 初始真实隔离 build 在工作树中记录的 `git rev-parse HEAD`：`419a1d7af90c09cb9364819977f32ec59cf86f87`；以该完整 SHA 作为验证器输入，没有用后续工作树改动或历史分支替代。
- `419a1d7` 是 PR #194 合并提交，父提交为 P1 合并提交 `660c74a6247544ffac64e7ef8f968d1025b2a668` 和 G1 材料提交 `49cd2136fe5109115fb4f3dcff89ed59b0bc7615`。因此本次真实 base 同时含有 P1 冻结表和 G1 原件包。
- 历史核查 base `32789cec4d50db0b85a63d91049cc425d9e917a2` 与 P1 来源分支提交 `c98ec5f538b3acd9ac052c4ef100e1d111232518` 仅作溯源；本次没有拿它们充当 build base。P1 主分支合入版本是父提交 `660c74a…`。
- `419a1d7` 初始读取后，D0 已由 PR #195 合入 main。Chief 于 2026-10-07 21:09 核实 `origin/main=4b287b4e9892bfb4545dbbff94d04f45633c3a64`，其包含 `419a1d7…` 与 D0 提交 `768bbd82fcc52a873168b39a8382d2f14c928abc`。本分支通过 `git merge --no-commit --no-ff 4b287b4e9892bfb4545dbbff94d04f45633c3a64` 实际整合 main，平台本轮 checkpoint 将完成 merge commit；D0 证据文件已进入合并工作树，计划保留 D0 增量、D1a/D1b 拆分和 P1 冻结。
- 对整合点 `4b287b4` 的 44 项输入另执行 `node scripts/verify-build-input-reachability.mjs 4b287b4e9892bfb4545dbbff94d04f45633c3a64`，在精确 detached checkout 中退出码 0，44/44 文件、P1 16/16、0 errors。逐文件的 commit/worktree 结果保存在同一 JSON 的 `integration.buildVerification`；这次是整合版本定向读取核验，不改写初始 `419a1d7` 记录，也不重造 fresh build。
- 从只读 main clone 的 `FETCH_HEAD` 读得 `4b287b4` 主计划正文 50187 字节，SHA-256 与该提交的 `MANIFEST.json` 一致；Git blob 为 `2467aad369f707f952a1b35dadfb75a046b306dc`，提交 SHA-256 为 `617d900163bb1ea87b263e3e51bd38cc470121b54d09fb634c2b4078060ee62f`。当前 merge 后计划工作树字节和哈希、Git blob 与根清单一致性在下方清单核对记录中列出，不用当前改后哈希冒充 main 原文哈希。

## 整合后根清单核对

根 `MANIFEST.json` 声明 `bytes` / `sha256` 对应工作树原始字节。此次对其 21 个条目逐项重算并比对，均存在且最终 **0 mismatch**；更新了评审指出的 6 项及本轮改动的计划/当前记录两项。`SOURCE-MANIFEST.json` 的 38 项来源原件清单没有修改。按该口径 verifier 工作树为 6844 bytes / `bdb2e2…`；暂存 Git blob 则为 6697 bytes / `a0966d9fbd72a5ef24e01074cc59a3f759322212`，两种字节来源分列，不混用。

| 路径 | 工作树字节 | 工作树 SHA-256 |
|---|---:|---|
| `AGENTS.md` | 9306 | `a3eb6f9d3e9ebe6db6887f561f400db76207645d3478a84d83ae4332af20cf96` |
| `docs/adr/README.md` | 16185 | `abee02e6eb97298a8ba8fe44a28a18a3a6b0d5f8b2e8f81737bd70df6f4e79c8` |
| `docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md` | 16523 | `ddf24ece241d40997adec9297229aa34b2abb91edc71426b47febdf19fb8350f` |
| `docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md` | 14065 | `a6719cadd221f426f79717946915566128bf9e749c995ed731f7e22c2a29935a` |
| `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md` | 51385 | `25ef66d59d28390d54bd218f56580b4954f6e2f87cfa3609959cebf5dd439fa1` |
| `docs/evidence/build-input-reachability.md` | 15741 | `af4678097ea70ecf687be73b3d904e1c192a94740c36e0e5e0d43fa7ec34ab12` |
| `scripts/verify-build-input-reachability.mjs` | 6844 | `bdb2e2ad79c6eeacc8b4b54dfa5285ef2b52342843f23c8645065246a1de5704` |
| `scripts/verify-build-input-reachability.test.mjs` | 1524 | `44cb9932fb4213269450ee5626aebd10bcc2360fb869ec9dd035a772d52ef993` |
- 最新 main 的 CI #353 / run `37626312217`（push `main@4b287b4`）completed/success，8/8 job 成功。前序证据提交 `70a94f21509b49f1d5a70cbb61a0af1729ee9ba8` 已提交；本轮整合变更由平台 checkpoint 形成 merge commit，随后本分支 PR/CI 待触发。
- 材料 PR #194 的 CI #348 / run `37620848480` 对 `49cd213` 的 8/8 job 成功；`main@419a1d7` 的 push CI #351 / run `37622620354` completed/success，8/8；D0 PR #195 CI #352 / run `37623264959` 对 `768bbd8` 的 8/8 job 成功；随后 `main@4b287b4` 的 push CI #353 亦 8/8 成功。分别记录，不以这些 CI 代替本轮分支 CI。

## 命令与机器记录

```text
node scripts/verify-build-input-reachability.mjs 419a1d7af90c09cb9364819977f32ec59cf86f87 --json-out docs/evidence/build-input-reachability.final.json
exit code: 0
checkedFiles: 44
p1Assertions: 16
errors: 0
```

验证器针对指定提交读取 Git blob，并比较工作树的 Git 规范化 blob ID；JSON 分别记录 `committedBytes` / `committedSha256` 和 `worktreeBytes` / `worktreeSha256`。四份 ADR 和主计划未固定 `eol` 属性，当前 Windows Git 配置启用 `core.autocrlf=true`，所以工作树字节哈希及长度可以不同；其 `worktreeGitBlobId` 均与 base blob ID 相同，说明该差异经 Git 行尾规范化后对应同一提交内容。来源目录按 `.gitattributes` 的 `-text` 规则保留原始字节，来源清单 JSON 使用 LF。

| 输入 | 路径 | Base Git blob | 提交字节 / SHA-256 | 工作树字节 / SHA-256 |
|---|---|---|---|---|
| ADR 0074 | `docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md` | `2453d156e3609ff5fccb83111ac1cc0826483ec3` | 12420 / `1552ede369a26d3f57e8976fd4b5074ac246db8a0ca5e9b316330114ea72ec1c` | 12639 / `5467b00c2047b616f557defeeb5eda607c18223ffdc178fd4d6d1d2d8763aa0a` |
| ADR 0075 | `docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md` | `67450ac4675f0374e7cb191e4c446943679bacd8` | 16275 / `796ddbb99b81e8330b54d9fcd17f147aa68df1873b1e8c3fed9c3e9ec467108d` | 16523 / `ddf24ece241d40997adec9297229aa34b2abb91edc71426b47febdf19fb8350f` |
| ADR 0076 | `docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md` | `e72dc4f37c67d83adbc27c23d6b2f25eb6b8fa09` | 15576 / `977644f9a9979702ece38198796e2f3e79df8903fa641cd288a57c955fc7cb5e` | 15831 / `4a1f7dda076c7d2e0f9bdef71cd9a5ad754563fe337d22bf138ec6c84810b39c` |
| ADR 0077 | `docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md` | `353cc589f6ad0cc6a98f8c68c0786a8c4bdc229f` | 13822 / `e59978475562b6a1320c050b12589a436890290b8a0fcadcaef4b4800ed49876` | 14065 / `a6719cadd221f426f79717946915566128bf9e749c995ed731f7e22c2a29935a` |
| 主计划与 P1 冻结表 | `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md` | `9d5ca5bbeb5183314ac609b37d0c0ac6f89a1ffe` | 44982 / `6add8e45df8b27b7bd657b500f60360f246f945617288fc96034f41242212114` | 45472 / `cd5e019c99ce6c91d4fd4768b695278a36cbeb6a6c9c32f5960f3253ef4290d2` |
| 来源清单 | `docs/references/todos-analysis/SOURCE-MANIFEST.json` | `b5c9bec0892d526d02cd36a14b2ad6c2e17d3e68` | 10338 / `e49b4c29207521117257cfff788f763392e7a493b50cde9daaed994ad1c38ccd` | 10338 / `e49b4c29207521117257cfff788f763392e7a493b50cde9daaed994ad1c38ccd` |

上述表格是便于审阅的摘要；JSON 对 44 个输入均记录路径、Git blob ID、提交与工作树字节数、SHA-256 和可读性结果。

## 已实际读取的材料与内容核对

- 四份 ADR 0074–0077 和主计划均从实际 base 的 Git blob 完整读取；验证器对正文做非空、UTF-8 替换字符及文件类型检查，完整长度和哈希见 JSON。
- `SOURCE-MANIFEST.json` 列出的 38 项来源输入均在 base 与工作树逐项通过长度、SHA-256、Git blob ID 与可读性检查，未发现缺项。包括 README、UI inventory、design tokens、kanban cards、测量 JSON、截图索引及 28 张 PNG；PNG 校验签名。完整 R2 审查报告 `docs/references/todos-analysis/reviews/todos-review.md` 也在来源清单内并通过原始字节校验。
- 主计划中的完整 P1 台账标题存在，表格行检查为 16/16。逐项正文包含精确重放身份约束、endpoint/subject-client/IP/socket 限流与失败退避差异、十分钟配对码与十五分钟重放窗口区别，以及限定范围的生态检索结论。
- 主计划仍包含 2026-10-07 18:38 用户批准的本批 Todos＋仓库记录例外；设计/执行材料用仓库相对路径。控制面例外不改 WorkMesh 产品领域规范，也没有声称创建真实 WorkMesh Project/WorkItem。
- 历史 `32789…` 上的旧主计划和旧审查矩阵不代替本次 base 内容；旧矩阵不是 P1 台账。`WORKMESH_PRD.md` 按已接受记录由提交 `dae4620366f33136d65e533d85823db49b9a3fe1` 明确删除，未恢复或按摘要重建。

## 检查结果与限制

以下仓库必需检查和依赖安装均对应 `f4820c9a43c4084a47cd1bfd78c1aba8c7143983`（执行时 `git rev-parse HEAD`）；该版本包含被检查的 verifier 实现，应用/TS 源码未在这些检查后变动。之后的 `70a94f2` 仅修改证据文档、计划和根清单（`git diff f4820c9..70a94f2` 可核验）。因此本表不是将历史提交冒充最终 merge commit 的检查；main 新增 D0 文件由 `main@4b287b4` CI #353 覆盖。初始 base 读取则独立发生于 `419a1d7`，并在 JSON 中原样保留。

| 检查 | 结果 |
|---|---|
| `node --test scripts/verify-build-input-reachability.test.mjs` | 退出码 0；3/3 通过（缺文件、旧版本、CRLF 规范化）。 |
| `node scripts/verify-build-input-reachability.mjs <实际 base> --json-out …` | 退出码 0；44/44 文件，16/16 P1，0 errors。 |
| 初始 `pnpm lint` / `pnpm typecheck` | 均退出码 1；安装依赖前 `node_modules` / `turbo` 不存在。此初始失败保留，不作为最终结果。 |
| `pnpm install --frozen-lockfile` | 退出码 0；pnpm 9.15.4 按锁文件安装 609 packages，lockfile 未变。Node v24.20.0。 |
| 安装后 `pnpm lint` / `pnpm typecheck` | 均退出码 0；Turbo 各 18/18 tasks 成功。 |
| `pnpm test` | 退出码 0；Turbo 29/29 tasks 成功；Web 113 files / 776 tests、API 33 files / 174 tests 通过，其余包测试均通过。 |
| `pnpm test:integration` | 退出码 0；310 passed、2 skipped。DB 17 files / 77 passed；API 22 files / 154 passed、1 skipped；Worker 8 files / 78 passed、1 skipped；recovery 1/1 passed。 |
| 首轮 `pnpm test:e2e` | 退出码 1；73 passed、1 failed。`apps/web/e2e/mcp-onboarding.spec.ts:99` 的“Connect an Agent to WorkMesh”标题在 10 秒内未出现。失败记录保留；未覆盖源截图。 |
| 目标 E2E `pnpm --filter @workmesh/web test:e2e -- e2e/mcp-onboarding.spec.ts` | 退出码 0；16/16 passed。一次直接 Playwright 调用因缺 `npm_execpath` 在测试开始前退出，未执行用例；改用仓库脚本通过。 |
| 全量 E2E 重跑 `pnpm test:e2e` | 退出码 0；74/74 passed，Turbo 12/12 tasks 成功。使用独立 E2E DB 和 Redis DB 1；未中断健康重跑。 |
| `node --test scripts/verify-build-input-reachability.test.mjs` | 退出码 0；3/3 通过（缺文件、旧版本、CRLF 规范化）。新增 JSON `worktreeBytes` 字段亦由 44 文件真实 base 输出核对。 |
| 当前整合分支的 GitHub CI | 前序证据提交 `70a94f2` 已提交；本轮 merge commit 随当前 turn checkpoint 形成，随后本分支 PR/CI 待触发。CI #348（材料 PR194）、#351（main@419）、#352（D0 PR195）、#353（main@4b push）均分别成功，不能代替当前整合分支 CI。 |
| 独立复核 | 尚未完成。 |

补充空白检查：当前 merge 差异的 `git diff --cached --check` 退出码 2，输出 457 行，指出新合入的 D0 历史测试日志有 trailing whitespace/文件末空行。它们来自已审核的 `main@4b287b4`，按用户要求保留原始 D0 证据，不做格式改写；这不是 AGENTS.md 的五项必需检查，本地 lint/typecheck/test/integration/e2e 均通过。

集成测试和 E2E 使用本任务独有容器/端口与随机 fixture：Postgres 15442、Redis 16389、RustFS 19010；数据库和 E2E Redis DB 隔离，不共享 D0 数据库。CI 限流参数、随机 `SESSION_SECRET` 与 32-byte base64url bootstrap 值通过本机临时环境文件传递，未写入证据；恢复工具连接专用容器的 5432 端口，recovery 测试自行创建 ObjectLock bucket。未访问生产服务。首次 E2E 的单项失败及其后目标重跑、全量重跑结果均保留在本表。

本地必需检查和 `419a1d7`、`4b287b4` 两个输入读取核验均已通过；合并提交后的分支 PR/CI 和用户最终独立复核尚未完成，门禁仍关闭。D0 PR #195 独审/CI 与视觉基线门禁已完成；不将其混作 G1 最终/R1 放行。

## 规范引用与交接

本次输入路径均为仓库相对路径。权威产品文档继续是 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql` 和接受的 ADR；旧 PRD 不作为输入。相关 Todo #5–#17、#20–#22 的交接路径、base 缺口与门禁状态见主计划“任务交接映射”；此次以最新 main 为整合源保留 D0 计划/清单增量及 P1 冻结表。本轮不声称重新同步平台 Todo spec，也不声称同步真实 WorkMesh Project/WorkItem。
