# 最终隔离构建输入可达性验证

## 当前交付：PR #198 并发增量整合

收尾时 main 从 `dcf3557` 前进到 `dde2a1a6926040c35e9d85d89fed6238572f0f25`。PR #198 **仅修改 ADR 0078**（117行新增、23行删除），无代码变更；在当前会话分支保留原 `af583f71f310e68ade588f9922694dfd8aba7a65` 和前次整合 `76689f838bd2ab9177d80c6b9210e0c57acc807d` 历史，正常无冲突合入该主线提交。原 PR #196 保留来源，不擅自关闭。

F5 用户选择的来源仍是#3原问题卡2026-10-07 23:29:53（Asia/Shanghai）；上游已将“有审计的重新投递”写入ADR0078。G1只保留main原文并记录该落地事实，**不自行修订ADR0037、不实现恢复协议**；主计划下文旧二选一仍是历史提案，全批规格同步与验收归R1。最新ADR正文包含原claim与receipt不可改写、actor-target successor新事实、现有唯一约束去重、exact-session排除及第二队列成本；它仍是Proposed文档，不冒称产品已实现或运行验收通过。

## 最新 main 独立读取与当前清单

在 `dde2a1a6926040c35e9d85d89fed6238572f0f25` 的精确detached工作树读取原44项：**44/44、P1 16/16、0 errors，退出0**。

```text
node ../../scripts/verify-build-input-reachability.mjs dde2a1a6926040c35e9d85d89fed6238572f0f25 --json-out ../g1-latest-main-checkpoint.json
```

正文/字节记录在JSON的 `latestIntegration.buildVerification`。新增输入仍单独计3项：ADR0078、round2审查、CI前置文档，完整正文读取与规范化blob比较均通过，见 `latestIntegration.additionalInputs`。

当前ADR0078提交blob为 `b1781583b75e2ab28d42c1a1cf2265ae326c37b1`，提交字节 48859 / SHA-256 `d3ac15e76fa544189bdcf20033553fb2d1a3e1631f7e4b2cd54a4b8e83ca6546`；工作树字节 49643 / SHA-256 `c74135dbed77e918b18b8a15b8e554a4f8dd9bdac548e1bd20eec7928eec7f2a`。整合主计划blob为 `264b52de5df81b50ab1e3eb8aae56b13d8992cad`，提交字节 69978 / SHA-256 `389136aeaf918d2b1a46623e190845fc8289395bec71ad5402b47da25f5f84bf`；工作树字节 70729 / SHA-256 `e71571fafd79f73ebc700a4b48dab7013ba629c5a2359ffa403ff825a1b21cf4`。全部24项当前清单、准确版本及双字节口径见 `latestIntegration.manifestVerification`，0 mismatch。最终证据与清单不包含自身hash。

初始 `419a1d7`、`4b287b4`、`36c7709`、第一次整合的 `dcf3557` checkpoint全部保持历史原样；JSON的原字段与 `handoff` 不改，新增 `latestIntegration`。P1冻结16条、来源38项、D0基线未变。

## 新整合版本的必需检查与门禁

本次检查版本：`afe57fda6a2e869d52660df64d4cd359dc013885`。五项必需命令最新退出码均为0。

| 命令 | 执行HEAD | 退出码 | 实际结果 |
|---|---|---:|---|
| `pnpm lint` | `afe57fda6a2e869d52660df64d4cd359dc013885` | 0 | Tasks:    18 successful, 18 total |
| `pnpm typecheck` | `afe57fda6a2e869d52660df64d4cd359dc013885` | 0 | Tasks:    18 successful, 18 total |
| `pnpm test` | `afe57fda6a2e869d52660df64d4cd359dc013885` | 0 | @workmesh/conformance:test:       Tests  1 passed (1)；@workmesh/db:test:  Test Files  8 passed (8)；@workmesh/db:test:       Tests  28 passed (28)；@workmesh/recovery:test:  Test Files  1 passed (1)；@workmesh/recovery:test:       Tests  7 passed (7)；@workmesh/worker:test:  Test Files  23 passed (23)；@workmesh/worker:test:       Tests  163 passed \| 2 skipped (165)；@workmesh/api:test:  Test Files  33 passed (33)；@workmesh/api:test:       Tests  174 passed (174)； Tasks:    29 successful, 29 total |
| `pnpm test:integration` | `afe57fda6a2e869d52660df64d4cd359dc013885` | 0 | Test Files  17 passed (17)；      Tests  77 passed (77)； Test Files  22 passed (22)；      Tests  154 passed \| 1 skipped (155)； Test Files  8 passed \| 1 skipped (9)；      Tests  78 passed \| 1 skipped (79)； Test Files  1 passed (1)；      Tests  1 passed (1) |
| `pnpm test:e2e` | `afe57fda6a2e869d52660df64d4cd359dc013885` | 1 | @workmesh/web:test:e2e:   73 passed (6.3m)； Tasks:    11 successful, 12 total |
| `pnpm test:e2e` | `afe57fda6a2e869d52660df64d4cd359dc013885` | 0 | @workmesh/web:test:e2e:   74 passed (4.8m)； Tasks:    12 successful, 12 total |

新整合的独立核验记录在 [local-validation.latest.json](build-input-reachability.current/local-validation.latest.json)，提交时另核对历史包含与被测源码未变。检查日志逐项保存于 `build-input-reachability.current/`，字节数和SHA-256见JSON。仍使用同一组本轮独有的本地隔离test服务和随机夹具（具体端口、隔离库和显式recovery开关见前次记录），不接触真实控制面或真实凭证；本机Node v24.20.0 / pnpm9.15.4，后续当前PR CI须用仓库固定Node22.19.0。Turbo的默认缓存配置在 `turbo.json`，实际命中数保留在日志；没有手工用历史CI或检查表豁免命令。

新整合首轮E2E再次为73 passed、1 failed（documents.spec.ts:3，Discussion点击90000ms超时、元素从DOM移除），失败[上下文](build-input-reachability.current/failed-e2e-3/error-context.md)与[原始PNG](build-input-reachability.current/failed-e2e-3/test-failed-1.png)逐字节保留，哈希在JSON的 `latestIntegration.e2eFailure`。两次失败都在与integration并行的窗口发生，先前两次独立重放均74/74；这只是相关性，根因未确认。新整合版本在integration结束后单独执行根E2E，实际结果见表；没有修改产品、selector或timeout。最新集成仍为310 passed、2 skipped（live供应商及retention upgrade独立开关未启用），recovery明确启用且1/1通过。

附加空白检查 `git diff --cached --check` 退出2，576行仅指出本轮原始日志尾随空白；保留测试输出，不格式化它们。正文/JSON本身空白检查通过；此项与AGENTS五项必需命令逐项分列，未隐藏诊断。

收尾只读观察：原PR #196仍OPEN，但其head已前进到 `08ce81a6738407c90cf2629fbb70088a4a899841`（文档整合）。本轮仍只导入用户明确批准的固定 `af583f71f310e68ade588f9922694dfd8aba7a65`，未引入新08ce81a，也未关闭或改动原PR；CI #357仅对应af583f7，不覆盖来源PR的新head。总管定向审查应同时知悉这一并发变化，本构建交付对象仍是当前会话分支的最终head。

**G1最终门禁关闭**，待总管对最新main整合、证据及清单定向独审、当前PR最新head全部required CI成功及真实合入。旧CI #357或旧76689f8检查均不代替该门禁。

## 前次整合76689f8与原PR196的历史记录

以下“当前/本轮”等词均限定为前次整合或原构建当时状态；最新版本以本页上方及JSON `latestIntegration` 为准。前次首轮E2E失败、上下文/原始PNG及后续两次74/74通过均保留，不改写为当前新版本的结果。


## 当前交付整合与门禁

本轮在 `tds/conv-01a116f7-1027-7c75-90df-32ebc5488752` 整合原证据 head `af583f71f310e68ade588f9922694dfd8aba7a65` 与最新 main `dcf355735341bc6daac4101b8c7d0efbaabbe764`，保留两条提交历史。原 PR #196 的独审和 CI #357 是历史来源；当前交付仍需总管定向独审、当前 PR 最新 head 的全部 required CI 及实际合入，**G1 最终门禁保持关闭**。

主计划只有状态行冲突；保留已核实 G1/P1/D0 状态及 main 的 F2 委派内自主分派、第二轮授权契约。PR #197 修改的四个文档完整吸收：主计划、ADR 0078、新增 round2 审查、CI 本机前置。除主计划事实状态及交接引用外，不修订产品设计。

F5 来源：本轮修订 spec 引用 #3 原问题卡，用户于 2026-10-07 23:29:53（Asia/Shanghai）选择“有审计的重新投递”，已交 R1。当前仅记录来源和待 R1 规格修订；PR #197 的“待决定”属于历史提案，不能据此称用户尚未选择。

## 最新 main 独立 checkpoint

精确 detached worktree HEAD 为 `dcf355735341bc6daac4101b8c7d0efbaabbe764`。在该目录运行当前仓库 verifier：

```text
node ../../scripts/verify-build-input-reachability.mjs dcf355735341bc6daac4101b8c7d0efbaabbe764 --json-out ../g1-main-checkpoint.json
exit code: 0
checkedFiles: 44
p1Assertions: 16
errors: 0
```

逐文件结果追加在 JSON 的 `handoff.buildVerification`，不覆盖顶层 `419a1d7`、`integration.buildVerification` 的 `4b287b4` 或 `integration.pullRequestBaseVerification` 的 `36c7709`。此项是最新 main 定向读取，不能冒称旧初始 build 换成了本轮分支。

另外完整读取 ADR 0078、`0078-review-round2.md` 和 `docs/CI.md` 的提交正文及 detached 工作树字节，3/3 可读；Git 规范化 blob 全部匹配，逐项哈希和正文标题见 `handoff.additionalInputs`。这三项**另计**，不以旧44项数量冒称覆盖。正文确认包括授权合取、两层能力、撤权传播、用量台账；round2 的问题清单是历史审查输入，不冒称其发现已运行验证；CI 本机前置包括隔离 test 数据库、可达 Redis、限流夹具及显式 bootstrap/master key。

主计划完整P1十六条表与原证据 head 逐段比对一致；原38项来源包、SOURCE-MANIFEST及D0基线未变。18:38控制面例外、限流退避事实、精确重放/检索边界和交接路径保留。

## 当前整合输入与根清单

下表对应本轮整合工作树的受控正文；提交后按本轮交付 head 定位。提交/规范化 blob 字节与Windows工作树字节分列。历史 hash 表留在下方原 PR 记录，不能拿历史计划 hash 匹配本轮正文。

| 路径 | Git blob | 提交字节 / SHA-256 | 工作树字节 / SHA-256 |
|---|---|---|---|
| `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md` | `7756fc61227bb2c818b0d30a7d0337b28e382a87` | 69705 / `1a092f69739cf054fdc8c211e395cf3541089f6ec4db3f110143b4ca03b966ab` | 70453 / `e9630d145e38f4ccbd4b510c2ea1ca2b3f1fbfb72b292508bf14d387b47d9c04` |
| `docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md` | `79f067e5dc0a51e5709364a2bab9213a92904517` | 42595 / `843fe92ce41a326aec7719ea45cb1407509f89f5f109ee9fd98f2eec952a8483` | 43285 / `1f5fb6beade2259f60dba15df94763dda8b7840da6eb4b7743ca31e0cdbdedae` |
| `docs/adr/0078-review-round2.md` | `058c70e617e1020c521d4cad2b9973789efa4ba0` | 24468 / `0f9ec7b53d8ba7dd9e8c11e247c1116fc6dadf932432c77b8cc5b391aca728e9` | 24657 / `8d1f0fd90a005b6f2aa0fd3ae7bcafaadc873a5cb75cb8507a9c83699c48f660` |
| `docs/CI.md` | `dab2ac90bb010ec04eff94aabf8053f77d201ec1` | 8212 / `670a5de26ac3f549c9b425e83453166a427052acd53ac9a2737401c51348c437` | 8385 / `47fe8a1f641aeb6815576cd48fad6f149c6c8c152191df469d277d44a375db5a` |

根 `MANIFEST.json` 按其既有工作树字节口径逐项核对 24 项，0 mismatch，新增上述3项输入的清单行。全部当前行及哈希在 `handoff.manifestVerification`。来源38项清单不修改；最终证据 Markdown/JSON 与根清单均不包含自身 hash，避免循环。

## 本轮必需检查

依赖安装：`pnpm install --frozen-lockfile` 退出码0，609 packages；lockfile未变。下表仅记录本轮实际执行，历史结果不代替本轮检查。每条记录保留执行 HEAD、命令、退出码及日志路径；若执行后仅变更证据/清单，须在交付中明确说明。

| 命令 | 执行HEAD | 退出码 | 结果 |
|---|---|---:|---|
| `pnpm lint` | `76689f838bd2ab9177d80c6b9210e0c57acc807d` | 0 | Tasks:    18 successful, 18 total |
| `pnpm typecheck` | `76689f838bd2ab9177d80c6b9210e0c57acc807d` | 0 | Tasks:    18 successful, 18 total |
| `pnpm test` | `76689f838bd2ab9177d80c6b9210e0c57acc807d` | 0 | @workmesh/db:test:       Tests  28 passed (28)；@workmesh/recovery:test:  Test Files  1 passed (1)；@workmesh/recovery:test:       Tests  7 passed (7)；@workmesh/worker:test:  Test Files  23 passed (23)；@workmesh/worker:test:       Tests  163 passed \| 2 skipped (165)；@workmesh/api:test:  Test Files  33 passed (33)；@workmesh/api:test:       Tests  174 passed (174)；@workmesh/web:test:  Test Files  113 passed (113)；@workmesh/web:test:       Tests  776 passed (776)； Tasks:    29 successful, 29 total |
| `pnpm test:integration` | `76689f838bd2ab9177d80c6b9210e0c57acc807d` | 0 | Test Files  17 passed (17)；      Tests  77 passed (77)； Test Files  22 passed (22)；      Tests  154 passed \| 1 skipped (155)； Test Files  8 passed \| 1 skipped (9)；      Tests  78 passed \| 1 skipped (79)； Test Files  1 passed (1)；      Tests  1 passed (1) |
| `pnpm test:e2e` | `76689f838bd2ab9177d80c6b9210e0c57acc807d` | 1 | @workmesh/web:test:e2e:   73 passed (6.2m)； Tasks:    11 successful, 12 total |
| `pnpm --filter @workmesh/web test:e2e -- e2e/documents.spec.ts` | `76689f838bd2ab9177d80c6b9210e0c57acc807d` | 0 | 74 passed (4.5m) |
| `pnpm test:e2e` | `76689f838bd2ab9177d80c6b9210e0c57acc807d` | 0 | @workmesh/web:test:e2e:   74 passed (4.5m)； Tasks:    12 successful, 12 total |

五项必需检查的执行版本均为 `76689f838bd2ab9177d80c6b9210e0c57acc807d`；此后的当前记录仅补充证据与日志，不修改被测源码、verifier或计划正文。原始命令输出经本地随机夹具脱敏后保存在 `build-input-reachability.current/`，JSON逐项记录日志字节数及SHA-256。lint/typecheck各18/18 tasks；单元29/29 tasks（部分Turbo缓存复用在日志中明列）。集成310 passed、2 skipped：API的真实供应商live用例未启用；Worker的retention upgrade独立开关未启用，均不能计为通过。恢复已显式启用且1/1通过。

附加verifier测试 `node --test scripts/verify-build-input-reachability.test.mjs` 退出0、3/3通过，在整合工作树提交前执行；脚本及测试Git blob均与上述被测提交一致。最新main输入读取、来源38项保真、P1冻结表和根清单的局部核验另见前文及JSON。

首轮全量E2E退出1：73 passed、1 failed，`documents.spec.ts:3` 的Discussion标签点击在90000ms超时，定位器报告元素不稳定及DOM移除。失败[上下文](build-input-reachability.current/failed-e2e-1/error-context.md)和[原始PNG](build-input-reachability.current/failed-e2e-1/test-failed-1.png)已逐字节保留，哈希见JSON的 `handoff.e2eFirstFailure`；认证trace不纳入仓库。未改源码、selector或timeout。随后命令 `pnpm --filter @workmesh/web test:e2e -- e2e/documents.spec.ts` 实际执行74项全量Web验收并全部通过，不能当作仅目标测试；首轮失败未复现，根因尚未确认。根脚本全量重跑另列于表中，其结果决定本轮E2E必需检查状态。

本机Node为v24.20.0、pnpm9.15.4；当前PR CI仍须按仓库固定Node22.19.0运行，不能用本机结果替代。测试服务设置曾在初始化临时Postgres服务器重启、psql默认数据库不存在两处前置失败；改为最终TCP就绪探测并显式连接postgres后成功，均未进入测试用例，不隐藏为产品测试失败。

检查使用本轮独有本地 test 服务与显式随机测试夹具（Postgres15453、Redis16393、RustFS19013），不访问真实WorkMesh控制面，不输出凭证。未修改迁移、API、事件、token值或ADR决策。原 PR #196 保留来源，未关闭；本轮正常交付review，独审与最新PR CI不由历史CI替代。

## 原证据 PR #196 历史记录（af583f7）

以下正文完整保留原证据提交中的记录；其中“本轮”“当前”“待CI/独审”等词均指原构建当时状态，实际原head的独审/CI结果来源于任务交接。上方当前交付段才描述本次整合。原初始base、branch与44项读取事实不改写。


## 结论与门禁

真实隔离构建已在材料合并后的实际 base 中读到四份 ADR、完整主计划、设计测量原件和完整 R2 审查报告；输入校验退出码为 0，44/44 文件可读，P1 台账为 16/16 条，错误数为 0。完整逐文件记录在 [`build-input-reachability.final.json`](build-input-reachability.final.json)。

初始 base 的正文读取门槛通过。当前整合计划已吸收 D0 合入 main 的增量；本轮必需检查均通过。G1 最终门禁仍为**待本分支 CI 和用户指定的独立复核**，不能据此放行 #3 或依赖输入的实现。

## 本次 build 的实际基点

- 构建环境记录的当前分支：`tds/conv-01a11661-dbed-70ca-85d6-05851a0213e1`。
- 初始真实隔离 build 在工作树中记录的 `git rev-parse HEAD`：`419a1d7af90c09cb9364819977f32ec59cf86f87`；以该完整 SHA 作为验证器输入，没有用后续工作树改动或历史分支替代。
- `419a1d7` 是 PR #194 合并提交，父提交为 P1 合并提交 `660c74a6247544ffac64e7ef8f968d1025b2a668` 和 G1 材料提交 `49cd2136fe5109115fb4f3dcff89ed59b0bc7615`。因此本次真实 base 同时含有 P1 冻结表和 G1 原件包。
- 历史核查 base `32789cec4d50db0b85a63d91049cc425d9e917a2` 与 P1 来源分支提交 `c98ec5f538b3acd9ac052c4ef100e1d111232518` 仅作溯源；本次没有拿它们充当 build base。P1 主分支合入版本是父提交 `660c74a…`。
- `419a1d7` 初始读取后，D0 已由 PR #195 合入 main。Chief 于 2026-10-07 21:09 核实当时的 `origin/main=4b287b4e9892bfb4545dbbff94d04f45633c3a64`，其包含 `419a1d7…` 与 D0 提交 `768bbd82fcc52a873168b39a8382d2f14c928abc`。本轮按要求执行 `git merge origin/main`，实际整合刚获取的 `origin/main=36c7709a8bd49c640b8dbfa04a09cfb777f943c8`；计划文件有一处状态行冲突，已保留两侧状态并记录 G1 三个基点、D0 完成与 ADR 0078/F 链信息。D0 证据文件已进入合并工作树，计划保留 D0 增量、D1a/D1b 拆分和 P1 冻结。
- 对整合点 `4b287b4` 的 44 项输入另执行 `node scripts/verify-build-input-reachability.mjs 4b287b4e9892bfb4545dbbff94d04f45633c3a64`，在精确 detached checkout 中退出码 0，44/44 文件、P1 16/16、0 errors。逐文件的 commit/worktree 结果保存在同一 JSON 的 `integration.buildVerification`；这次是整合版本定向读取核验，不改写初始 `419a1d7` 记录，也不重造 fresh build。
- 从只读 main clone 的 `FETCH_HEAD` 读得 `4b287b4` 主计划正文 50187 字节，SHA-256 与该提交的 `MANIFEST.json` 一致；Git blob 为 `2467aad369f707f952a1b35dadfb75a046b306dc`，提交 SHA-256 为 `617d900163bb1ea87b263e3e51bd38cc470121b54d09fb634c2b4078060ee62f`。当前 merge 后计划工作树字节和哈希、Git blob 与根清单一致性在下方清单核对记录中列出，不用当前改后哈希冒充 main 原文哈希。
- 当前 PR base `36c7709a8bd49c640b8dbfa04a09cfb777f943c8` 另在该提交的精确 detached worktree 中运行 `node scripts/verify-build-input-reachability.mjs 36c7709a8bd49c640b8dbfa04a09cfb777f943c8`，退出码 0，44/44 文件、P1 16/16、0 errors；逐文件结果位于 JSON 的 `integration.pullRequestBaseVerification`。此项只核验 base 原始内容，初始 `419a1d7` 和前次 `4b287b4` 记录均保留。该提交计划的原始提交字节为 63415，SHA-256 `c9da1be493e6d1364550cbf3ea391145c70d914234a57e457d6feb19784767da`，Git blob `0d45cfd9403ed48f6db39aa8ae97971edd03e821`；其自身 `MANIFEST.json` 记录 50187 字节 / `617d900…`，与 base blob 不匹配。冲突解决后的合并工作树计划为 65613 字节、SHA-256 `0605c6d97695b0691734a85d1255bfac31f3d82ddfb5c3e9b89232e25d4ffd57`、Git blob `569955ba8509b2ffd1a7cb72462a416eec436477`；根清单已按最终合并工作树字节重新校准，未沿用 main 的陈旧快照值。

## 整合后根清单核对

根 `MANIFEST.json` 声明 `bytes` / `sha256` 对应工作树原始字节。此次对其 21 个条目逐项重算并比对，均存在且最终 **0 mismatch**；更新了评审指出的 6 项及本轮改动的计划/当前记录两项。`SOURCE-MANIFEST.json` 的 38 项来源原件清单没有修改。按该口径 verifier 工作树为 6844 bytes / `bdb2e2…`；暂存 Git blob 则为 6697 bytes / `a0966d9fbd72a5ef24e01074cc59a3f759322212`，两种字节来源分列，不混用。

| 路径 | 工作树字节 | 工作树 SHA-256 |
|---|---:|---|
| `AGENTS.md` | 9306 | `a3eb6f9d3e9ebe6db6887f561f400db76207645d3478a84d83ae4332af20cf96` |
| `docs/adr/README.md` | 16185 | `abee02e6eb97298a8ba8fe44a28a18a3a6b0d5f8b2e8f81737bd70df6f4e79c8` |
| `docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md` | 16523 | `ddf24ece241d40997adec9297229aa34b2abb91edc71426b47febdf19fb8350f` |
| `docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md` | 14065 | `a6719cadd221f426f79717946915566128bf9e749c995ed731f7e22c2a29935a` |
| `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md` | 65613 | `0605c6d97695b0691734a85d1255bfac31f3d82ddfb5c3e9b89232e25d4ffd57` |
| `docs/evidence/build-input-reachability.md` | 15949 | `54b1647ba1af2c803d83d90da30f9617693db5ecabd9865a62275ffc2b96e9c5` |
| `scripts/verify-build-input-reachability.mjs` | 6844 | `bdb2e2ad79c6eeacc8b4b54dfa5285ef2b52342843f23c8645065246a1de5704` |
| `scripts/verify-build-input-reachability.test.mjs` | 1524 | `44cb9932fb4213269450ee5626aebd10bcc2360fb869ec9dd035a772d52ef993` |
- `main@4b287b4` 的 CI #353 / run `37626312217` completed/success，8/8 job 成功；它是前次 main 快照，不能代表当前 `origin/main=36c7709` 的 CI。前序证据提交 `70a94f21509b49f1d5a70cbb61a0af1729ee9ba8` 已提交；当前 main 整合仍在本分支 merge 流程中，本分支 PR/CI 待触发。
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

以下仓库必需检查和依赖安装均对应 `f4820c9a43c4084a47cd1bfd78c1aba8c7143983`（执行时 `git rev-parse HEAD`）；该版本包含被检查的 verifier 实现，应用/TS 源码未在这些检查后变动。之后的 `70a94f2` 仅修改证据文档、计划和根清单（`git diff f4820c9..70a94f2` 可核验）。因此本表不是将历史提交冒充最终 merge commit 的检查；main 新增 D0 文件由 `main@4b287b4` CI #353 覆盖。初始 base 读取则独立发生于 `419a1d7`，并在 JSON 中原样保留；`36c7709` 的输入可达性定向核验另有独立逐文件记录，不替代五项必需检查。

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
| 当前整合分支的 GitHub CI | 前序证据提交 `70a94f2` 已提交；当前对 `origin/main=36c7709` 的 merge 尚待本轮提交收束，随后本分支 PR/CI 待触发。CI #348（材料 PR194）、#351（main@419）、#352（D0 PR195）、#353（main@4b push）均分别成功，不能代替当前整合分支 CI。 |
| 独立复核 | 尚未完成。 |

补充空白检查：当前 merge 差异的 `git diff --cached --check` 退出码 2，输出 457 行，指出新合入的 D0 历史测试日志有 trailing whitespace/文件末空行。它们来自已审核的 `main@4b287b4`，按用户要求保留原始 D0 证据，不做格式改写；这不是 AGENTS.md 的五项必需检查，本地 lint/typecheck/test/integration/e2e 均通过。

集成测试和 E2E 使用本任务独有容器/端口与随机 fixture：Postgres 15442、Redis 16389、RustFS 19010；数据库和 E2E Redis DB 隔离，不共享 D0 数据库。CI 限流参数、随机 `SESSION_SECRET` 与 32-byte base64url bootstrap 值通过本机临时环境文件传递，未写入证据；恢复工具连接专用容器的 5432 端口，recovery 测试自行创建 ObjectLock bucket。未访问生产服务。首次 E2E 的单项失败及其后目标重跑、全量重跑结果均保留在本表。

本地必需检查和 `419a1d7`、`4b287b4` 两个输入读取核验均已通过；合并提交后的分支 PR/CI 和用户最终独立复核尚未完成，门禁仍关闭。D0 PR #195 独审/CI 与视觉基线门禁已完成；不将其混作 G1 最终/R1 放行。

## 规范引用与交接

本次输入路径均为仓库相对路径。权威产品文档继续是 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql` 和接受的 ADR；旧 PRD 不作为输入。相关 Todo #5–#17、#20–#22 的交接路径、base 缺口与门禁状态见主计划“任务交接映射”；此次以最新 main 为整合源保留 D0 计划/清单增量及 P1 冻结表。本轮不声称重新同步平台 Todo spec，也不声称同步真实 WorkMesh Project/WorkItem。
