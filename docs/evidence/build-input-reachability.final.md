# 最终隔离构建输入可达性验证

## 结论与门禁

真实隔离构建已在材料合并后的实际 base 中读到四份 ADR、完整主计划、设计测量原件和完整 R2 审查报告；输入校验退出码为 0，44/44 文件可读，P1 台账为 16/16 条，错误数为 0。完整逐文件记录在 [`build-input-reachability.final.json`](build-input-reachability.final.json)。

正文读取门槛通过。G1 最终门禁仍为**待当前改动 CI 和独立复核**：这两项未在本记录生成时完成，因此不能据此放行 #3 或依赖输入的实现。

## 本次 build 的实际基点

- 构建环境记录的当前分支：`tds/conv-01a11661-dbed-70ca-85d6-05851a0213e1`。
- 本轮开始时 `git rev-parse HEAD`：`419a1d7af90c09cb9364819977f32ec59cf86f87`；以该完整 SHA 作为验证器输入，没有用工作树改动或历史分支替代。
- `419a1d7` 是 PR #194 合并提交，父提交为 P1 合并提交 `660c74a6247544ffac64e7ef8f968d1025b2a668` 和 G1 材料提交 `49cd2136fe5109115fb4f3dcff89ed59b0bc7615`。因此本次真实 base 同时含有 P1 冻结表和 G1 原件包。
- 历史核查 base `32789cec4d50db0b85a63d91049cc425d9e917a2` 与 P1 来源分支提交 `c98ec5f538b3acd9ac052c4ef100e1d111232518` 仅作溯源；本次没有拿它们充当 build base。P1 主分支合入版本是父提交 `660c74a…`。
- 平台工作流查询在记录时显示 `main@419a1d7` 的 CI #351 / run `37622620354` 为 `in_progress`。这不是当前本轮证据变更的 CI 结果；后者需待本轮提交触发并完成。

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

| 检查 | 结果 |
|---|---|
| `node --test scripts/verify-build-input-reachability.test.mjs` | 退出码 0；3/3 通过（缺文件、旧版本、CRLF 规范化）。 |
| `node scripts/verify-build-input-reachability.mjs <实际 base> --json-out …` | 退出码 0；44/44 文件，16/16 P1，0 errors。 |
| `pnpm lint` | 退出码 1；该隔离工作树没有 `node_modules`，`turbo` 不存在。 |
| `pnpm typecheck` | 退出码 1；同一依赖缺失，`turbo` 不存在。 |
| `pnpm test`、`pnpm test:integration`、`pnpm test:e2e` | 本轮未运行；材料阶段此前记录的结果不是本轮变更检查，且不可冒充。 |
| 当前变更的 GitHub CI | 尚无本轮变更提交的完成结果。材料合并 base 的 main CI #351 当时仍在运行；PR #194 材料 CI #348 的通过结果只证明材料提交。 |
| 独立复核 | 尚未完成。 |

当前环境无依赖安装目录，因此本轮不能报告必需 lint/typecheck 已通过。通过本地获取依赖或等待 CI 结果后，仍需独立复核者确认最终证据；完成前门禁保持关闭。系统提供给本轮的 Todos 工具只有读取/受限更新能力，没有 `append_activity` 或可更新既有 #18 的写入操作，本次不能声称已将活动追加到 Todo；仓库证据已落盘，Todo #18 的平台阶段仍由构建流程管理。

## 规范引用与交接

本次输入路径均为仓库相对路径。权威产品文档继续是 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql` 和接受的 ADR；旧 PRD 不作为输入。相关 Todo #5–#17、#20–#22 的交接路径、base 缺口与门禁状态见主计划“任务交接映射”；该映射已记录总管之前逐项同步 spec 的结果，本轮仅验证其引用所需正文在真实 base 可读，没有声称本轮再次更新这些 Todo spec。
