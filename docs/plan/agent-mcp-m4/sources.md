# 完整来源、主线差异与读取边界

当前主线精确 `c2b3d363c037157df13beb82799d99d07a9b7db8`；冻结路线 `c768e1e3db297d8b91b53dd68b60e723a8a40e7d`。本轮平台git只读实际查询 `ls-remote origin refs/heads/main` 与本地main相同；没有借陈旧origin/main或todo Done代Git祖先证明。merge parents及前置由规格的Chief交接给出，实施前仍重新核当前主线/前置差异。本轮远端查询仅read，不fetch/switch另一branch或改共享cache。

## 权威与冻结来源

[source-manifest.json](input/source-manifest.json) 对 `AGENTS.md/CONTEXT.md/AGENT_PROTOCOL.md/OPENAPI.yaml/SCHEMA.sql`、所有现行ADR、下述来源及所选源码，以精确commit:path解析blob并完整cat-file读取UTF-8；每项有Git blob、完整长度/SHA256、workingtree长度/SHA256与identity或LF_to_CRLF等字节映射。完整读取不是全仓语义重新验收；语义审查限定本卡操作。移除的WORKMESH_PRD不恢复、不凭记忆重建。

冻结七份priority文档（README、batches-and-acceptance、coverage-matrix、operation-index、branch-separation、sources、review）在frozen与current全文逐项相同，见 [差异](input/priority-difference.json)。M4精确151–175行共25行分别保 [冻结全文](input/frozen-m4.md) 与 [current全文](input/current-main-m4.md)，提取assert标题/DoD并逐bytes相等；不是工具可见prefix。原九类/DoD不改写。

M0 `operation-decisions.json/domain-rules.json/domain-audit.md` 是原发现决定：四Human membership差异留M4；保冻结277操作原件，本卡 [增量矩阵](operation-decisions.json) 从current agent-discovery-rules逐项解析角色/状态等，合成当前发现时不回写M0。未修复前不删DOMAIN_QUERY_NOT_AGENT_ALIGNED。

## 前置、消费者与清理来源

| 来源 | 必须沿用的事实/边界 |
| --- | --- |
| `docs/plan/agent-mcp-m5/product-current-report.md` | 原四链入口exit1与证据续接exit0、集成分段、skip、实际Windows/受控模型/fakeprovider、native私有hydration/EOF/完整UTF-8实收 |
| `product-current-matrix.md`、`product-pr-ci-report.md` | 真实候选/CI、formal成果审查与事实层分离；报告里当时pending句保持历史，不冒M4已测 |
| `product-resources-current.md` | M5原容器/卷/桶/恢复目录留存，逻辑与物理释放区分 |
| `docs/adr/0084-runner-tool-bounded-transport-replay.md` | 仅原三个写白名单、原请求最多两次、同bytes/key/body/E、unknown不盲发 |
| `docs/adr/0085-mcp-original-execution-recovery-discovery.md` | 原EStop恢复描述符、准入/manifest不是授权、撤权不降级、read-only/C无原E不加恢复工具；源码已合但ADR历史Proposed句不重写 |
| `docs/reviews/cleanup/2026-10-11-worktrees/report.md`、`continuation/report.md`、`followup/report.md` | 原成功/失败和停止区别；9只读对象、G1D0C3拒绝目标及父目录持续保护；不Done即删 |
| `mechanism.md`、`cleanup-rules.json`、`protected-paths.json`、`usage-inventory.py`、followup停止/readonly来源 | 只读盘点不是daemon；先保全/预检提交；逐目标绝对路径与link/活动/恢复核验；拒绝停目标、不绕；file身份去重不等物理释放 |

源码落点与函数按 [实施步骤](implementation.md)、[安全合同](safety-contract.md) 引用；symbolLocations保存关键符号真实行号。对本卡拟新文件没有虚构blob/已存在函数。所有ADR的标题与状态开头另保 [索引](input/adr-status-index.json)，保留Proposed/Accepted事实，不用数字较大推正式接受。

## 平台全文、运行字节与缺口

[spec.md](spec.md) 来自完整todos Spec读回；[平台同步说明](platform-sync.md) 区分用户注入完整savedcopy、工具Saved plan截断和本轮单段edit。未返回新planVersion/创建字段均null，不猜新docID。todo原工具返回保 [todo-readback.json](input/todo-readback.json)，其截断Saved plan不生成全文hash。用户选六域及允许仅规划写入来自 [feedback](input/feedback.md)，无需重复问许可。

source capture首轮整体exit0，但3个猜测路径内部Git解析exit128；[原回执](input/source-capture-first-receipt.json) 标真实缺件，不能把163个成功blob叫全部候选成功。校正到RunnerApi实际run-session.ts、featureDefinitions实际index.ts并去不存在auth路径；随后完整重读且所有候选可达。首次stdout编码问题分列，文件UTF-8校验不假为显示完整。旧产品中间原件缺口不本轮重造。

本轮没有新的产品运行bytes或检查成功；交付规划文件/stagedblob/hash只证明文档一致。后续运行必须另做实际消费指纹与完整命令回执，不能用此来源列表代检查。在缺全机handles/全局恢复registry条件下不清其他workspace；物理净释放未测null。未有formal独审、新候选RequiredCI和actualDone/main，不宣产品验收。
