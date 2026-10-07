# 规划交接检查记录

本轮仅增加本目录的规划文本、公开任务快照、主线只读源副本与校验工件。未修改权威 ADR、主计划、产品代码、Schema、迁移或 API/event 契约，未改 G1 历史证据。读取了当前工作树 `AGENTS.md`、`docs/CI.md`、实际 `package.json` 脚本及根 `MANIFEST.json`；没有发现要求将本次交接工件登记到根 MANIFEST 的明确规则，因此不改该清单，以本目录交接清单登记文件字节与哈希。

## 首次规划交接结果（历史）

| 检查 | 实际执行/结果 | 适用范围与限制 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Windows 实际调用 `pnpm.cmd install --frozen-lockfile`，退出码 0 | 安装既有依赖，未修改 lockfile；不作为产品测试 |
| `pnpm lint` | `pnpm.cmd lint`，退出码 0，18/18 task 成功，18/18 命中 Turbo 缓存 | 本轮实际命令；日志中的旧工作树路径来自缓存回放，不是本轮在旧目录执行 |
| `pnpm typecheck` | `pnpm.cmd typecheck`，退出码 0，18/18 task 成功，18/18 命中 Turbo 缓存 | 同上；两项检查执行后仅写入本目录交接工件，没有新增产品源码改动 |
| `git diff --check` / `git diff --cached --check` | 工件生成与暂存后实际执行，退出码 0 | 初次暂存检查退出码 1（末尾多余空行）；修正后重跑通过，不代表独立审查 |
| 计划全文一致性 | 从文件读取 UTF-8 字符串，与用户提供保存副本及成功编辑回执组合的文本逐字符相等 | 4,677 字符；平台版本号未取得，不冒称独立 doc 读回 |
| `node docs/reviews/r1/verify-handoff.mjs --integrity-only` | 退出码 0 | 29 卡元数据、28 卡完整正文及各已捕获字节的哈希、主线 blob 和交接清单自洽 |
| `node docs/reviews/r1/verify-handoff.mjs` | 退出码 1 | 如实拒绝完整性：#3 的 spec 尾部被工具截断，全文只有 28/29；不能当作通过 |
| `pnpm test` | 本轮未运行 | 本轮依用户明确限定只做规划交接，产品源码未变，不无理由重跑产品全量套件；该项仍为完整 R1 的必需检查，未豁免、未填通过 |
| `pnpm test:integration` | 本轮未运行 | 同上；后续还须按 `docs/CI.md` 使用专用测试库与 fake agent/provider，不得指向业务库 |
| `pnpm test:e2e` | 本轮未运行 | 同上；不把旧 CI、G1 或其他任务的记录冒作本轮结果 |
| G1 可达性验证及最终主线门禁 | 本轮未确认 | 工作树仍是旧 base；只交接新 main 的完整输入副本，不运行后宣称旧工作树与新 main 一致 |

本轮返回规划输入交接，不宣称 R1 完成、完整规格修订已执行或全部必需检查通过。五项必需检查仍保留在后续规格修订、独审与合并门禁中；本表的未运行项不能作为免检依据。

## 可重现步骤

```powershell
node docs/reviews/r1/verify-handoff.mjs --integrity-only
node docs/reviews/r1/verify-handoff.mjs
git diff --check
git diff --cached --check
git show --stat --oneline HEAD
```

以上普通模式退出码 1 是首次交付的历史结果：当时 #3 源正文不足。没有更改 29 卡期望值、跳过卡片或将前缀标为完整；本轮收到总管同版本源文后进行下列补齐验证，原缺口与截断返回保留。

## 同版本源文补齐检查

总管提供原 `message_todo` 调用的准确尾文「台原计划，列具体能力缺口，不编正文。」及一个末尾换行。依据反馈明确允许的方法，将原提交的已采集前缀加该尾文生成 [历史全文](r1-spec-source.md)，交接来源见 [来源记录](r1-spec-source.json)；该正文不是工具独立全文读取结果。

| 检查 | 本轮实际结果 | 范围 |
| --- | --- | --- |
| 原提交前缀及 metadata 对比 | 退出码 0 | 与 `3317b917f99db25b74e6bdf00dcae6b4d486d556` 逐字符核对前缀、逐字段保留 #3 metadata/工具返回；其他 28 卡未改 |
| 历史全文 UTF-8 哈希 | `b6f0d424fc89565ba76d41b6c05acad0797925acac06548c5d76c035c416dccb`，15,420 字节 | `spec`、源文文件、来源记录一致；末尾恰好一个换行 |
| `pnpm lint` / `pnpm typecheck` | 各退出码 0，18/18 task 成功，18/18 Turbo 缓存 | 本轮在当前工作树实际调用 `pnpm.cmd`，不冒用上轮结果 |
| `node docs/reviews/r1/verify-handoff.mjs` | 退出码 0 | 历史源包 29/29：28 卡工具正文 + 1 卡总管补源；含源文/原截断前缀/工具返回/清单哈希校验 |
| `node docs/reviews/r1/verify-handoff.mjs --integrity-only` | 退出码 0 | 已采集工件校验；不能代替独立审查或执行前复读 |
| `git diff --check` / `git diff --cached --check` | 各退出码 0 | 仅本目录规划交接工件；未改 `plan.md`、主线输入历史副本或权威规格 |

本轮未重跑 `pnpm test`、`pnpm test:integration`、`pnpm test:e2e`：本次仅补历史输入及其校验工件，依用户限定不无理由重跑产品全量套件；完整 R1 必需检查仍保留，不填通过或豁免。反馈告知 PR198 已合入，本包仍保留原主线输入历史来源；执行前读取最新 main/全部 29 卡并处理差异，不使用历史 snapshot 放行。

交付 commit 必须仅含 `docs/reviews/r1/`，总管据回复的准确 SHA 让原复核 agent 阅读本目录全部工件。G1 最终 settled/独审/必需检查及实际主线合入、执行前卡片与主线复读和 Chief 执行确认继续保留。
