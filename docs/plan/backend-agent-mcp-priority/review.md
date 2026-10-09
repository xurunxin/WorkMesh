# 平台独审、修订对应与实际文档检查

状态：三项blocking已按意见修订方案；**修订后平台独审尚未执行，不宣称通过或关闭阻断**。本记录归档用户本轮注入的平台审查意见，不替独立审查Agent作结论。日期：2026-10-09；被审方案head：`32a5c2c1270b1038d65a391a6b771aff42842c85`；产品来源main：`74f247f9240eaf21e74ef248f71a445c1d4276d7`。修订候选是本次工作树，最终commit由平台产生。

## 本轮平台独审意见归档

审查者报告：diff只有六份Markdown；277条操作的ID、路径与OpenAPI一致，302个来源blob的大小和SHA-256全部匹配。以上是**平台审查者报告的检查结果**，与下节本轮自行执行结果分列。审查者同时提出以下三项blocking：

1. **high：补齐子 Session 与reviewer既有闭环。** 原M3链仅写“独立reviewer发布code_review artifact再structured review”；createChildAgentSession/createReviewDelegation仅列索引。ADR0017和finishSessionInTransaction要求reviewer本人review_result Room消息与code_review Artifact同时存在，structured review不能替代消息；required child未完成阻父完成。要求明确矩阵、批次、Runner及真实调用链，覆盖稳定Plan绑定、预算/并发、能力交集、reviewer无plan:write、缺证据及父阻断；不能归入待选F新增。
2. **high：Initiative rollup必须标后端读取缺口。** 原矩阵把getInitiativeRollup与可用读取并列、只安排M4入口。operations/routes.ts的rollup用Human membership.actor_id=current.id过滤，而列表用Agent Session scope。合法Agent能list却得到零项目聚合。要求M4明确后端修复或暂不支持，并验授权项目非零、其他scope项目排除、撤权拒绝；本轮只修方案。
3. **补实际检查与审查记录。** README导航和sources引用不存在的review.md，实际文档检查无法复核。要求归档本轮平台独审意见、修订对应以及来源/索引/链接/空白/CI分类实际结果，未执行明确未执行，核对全部链接；构建内审查不能替代本轮平台独审。

## 修订对应与源码依据

| 意见 | 修订位置与实义 | 精确main源码依据 / 验收边界 |
| --- | --- | --- |
| 1 | [覆盖矩阵](coverage-matrix.md)新增子Session／review delegation行；[M2](batches-and-acceptance.md#m2现有规划文档与协作闭环)承接两种创建、受控启动、父读子状态最小合同、Runner角色适配及九类验收；[M3](batches-and-acceptance.md#m3现有-git异步动作与证据交付闭环)替换原真实客户端链，依次发布本人Room review_result、当前head code_review delivery Artifact、structured review、完成reviewer后父完成；[操作索引](operation-index.md)两项状态明确归属M2 | ADR0017；collaboration/routes.ts:1399–1433、1482–1517、review_result校验；agent/commands.ts:2880–2900与publishPlan的reviewer拒绝；MCP index.ts:289/294，SDK index.ts:362/364；Runner workmesh-tools.ts现无两项。缺任一reviewer双证据与required child各种未completed状态是明确负例，尚未运行 |
| 1的实现差异 | M2不假称两创建路径限额相同；review路径继承预算、检查目标并发，但未见普通child的父/step限额及reservation写。按既有ADR核齐必要后端保障；无该证据不得称有界reviewer闭环。普通child只授work:read/work:write，不能默认有plan/artifact能力 | 普通child和review两个完整函数均按精确main核读；这些是当前实现差异，不是本轮已修代码。agent/routes.ts:144–197的list/get仅自身，父读子状态不能靠现有通用Session工具，新增最小只读投影需先安全合同/ADR评审，保留普通get与terminal门禁 |
| 2 | 矩阵拆出rollup后端读取缺口行与缺口分类；[M4](batches-and-acceptance.md#m4现有可选领域的-agent-操作覆盖)推荐先修同一live Session/project/work-item scope投影再补SDK/MCP/Runner，未修明示Agent不支持；增加非零正例、其他scope排除和撤权拒绝及Human回归；索引和README同步 | operations/routes.ts:413–446（列表Agent分支）、496–569（rollup，尤其membership过滤）；OpenAPI getInitiativeRollup声明含Agent/work:read与PLANNING feature。只修方案，不改变管理权限、不把SQL差异当工具缺口 |
| 3 | 新增本文件；README和sources链接指向真实交付，记录本轮平台意见、历史失败、实际检查及未执行项 | 此前构建内审查仅辅助定位；没有可归档的最终通过报告，不虚构其批准。平台意见已归档，本修订仍须由平台独审复核 |

M1仍负责通用完成／Stop／终态结果确认，M2负责子任务与reviewer协作完整链，M3负责Git provenance/structured review，M5联合消费；均为既有功能的补齐建议，不暗含F/TA新领域实施授权。本轮不创建实现任务、不改产品或旧卡状态。

## 本轮实际检查

精确remote ref在 `2026-10-09 02:37:50 UTC` 至 `02:37:52 UTC` 通过 `mcp__tds__git`、projectId=`DzkLDn6UW-IbfoTJzN9Ro`、`ls-remote origin`及sources所列四个完整refs复核：main、#5、#9、#16的完整SHA均与sources表一致。该结果不证明PR合并或Required CI。

下列检查在本轮修订工作树实际执行，均exit=0；完整七文件的最终复核另见下文。不把本轮静态检查记为产品验收：

| 检查 | 实际方法与范围 | 实际结果 |
| --- | --- | --- |
| 来源原件 | Python逐行解析sources三种指纹表，依据每行准确commit/path执行 `git show <sha>:<path>`，按完整二进制blob核bytes与SHA-256，不使用工具显示前缀或Windows工作树字节 | 302个blob，0个大小/哈希不符；exit=0 |
| 完整操作索引 | PyYAML解析精确main的完整OPENAPI；与索引277条表格核operationId唯一性、HTTP method/path、操作所在OpenAPI行及全集相等 | 277条，0个ID/路径/行号不符；exit=0。本检查不证明SDK/MCP/Runner运行通过 |
| 自包含与链接 | Python遍历七份Markdown，解析本地链接、读取目标文件并核对应标题anchor；平台todo URI识别为外部控制面引用，不当本地路径 | 17个本地链接、其中4个anchor全部有效；1个todo URI仅检查格式，未执行外部可用性检查；exit=0 |
| 编码与全文空白 | 七文件严格UTF-8解码、无BOM、恰一EOF LF、逐行无尾随空格/tab；CRLF工作树与Git blob不混淆 | 七文件0项错误；exit=0 |
| 实际完整差异空白 | `git diff --check 74f247f9240eaf21e74ef248f71a445c1d4276d7`覆盖已跟踪的六份方案完整候选；新增review.md另运行 `git diff --no-index --check -- NUL docs/plan/backend-agent-mcp-priority/review.md` | tracked exit=0；新文件no-index exit=1表示内容差异，空白诊断stdout为空，结合全文字节检查判通过。只出现Git LF→CRLF提示，不是空白错误；组合校验exit=0 |
| CI分类 | Node直接导入仓库 `scripts/ci-policy.mjs` 的 `classifyChanges/readWorkspaces`，传入本方案全部七个Markdown路径 | mode=docs、packages=[]、testPackages=[]，七个check均false；exit=0。未执行远端CI，不称其绿色 |

来源/索引校验原始摘要：

```json
{"source_blobs":302,"source_mismatches":0,"operations":277,"id_path_line_mismatches":0,"exit":0}
```

链接/空白校验原始摘要：

```json
{"markdown_files":7,"local_links":17,"anchors":4,"platform_or_external_links":1,"UTF8_EOF_whitespace_errors":0,"tracked_full_diff_check_exit":0,"new_no_index_exit":1,"new_whitespace_diagnostics":"","exit":0}
```

CI分类的准确检查决策：

```json
{"mode":"docs","packages":[],"testPackages":[],"checks":{"source-gates":false,"db-integration":false,"api-integration":false,"worker-integration":false,"e2e":false,"recovery-integration":false,"agent-smoke":false}}
```

CI分类可复核命令（Node输入代码为字面量，不插入秘密）：

```powershell
node --input-type=module -e 'import { readdirSync } from "node:fs"; import { classifyChanges, readWorkspaces } from "./scripts/ci-policy.mjs"; const paths = readdirSync("docs/plan/backend-agent-mcp-priority").map(name => "docs/plan/backend-agent-mcp-priority/" + name); console.log(JSON.stringify({paths, ...classifyChanges(paths, readWorkspaces())}));'
```

来源补充修订ref后，最终复核仍使用上面同一算法：七文件、18个本地链接（其中4个anchor）、1个todo URI；来源302/操作277保持一致，链接/空白0错误、tracked diff check=0、新文件无空白诊断、CI仍为docs。最终范围核对仅本方案目录的Markdown；本轮修改五个已有文件并新增review.md，branch-separation.md未改。以下六正文指纹绑定本次审阅输入，review.md不为自身生成循环hash；**这是完整工作树字节的指纹，不是未来提交blob或CI受测SHA**。

| 正文文件 | worktree bytes | worktree SHA-256 |
| --- | --- | --- |
| `README.md` | 9139 | `b156d436c2222adca9ad25ab0d9224b0388b278bc58743d294c803e7961209a1` |
| `coverage-matrix.md` | 26429 | `34d6527d056df873b33cd3e5344e7b9f5fa8698db59665fa455627a79c751fd2` |
| `operation-index.md` | 162368 | `7fefa525a0b555094dd521eb3690ef9c3cf0c0a4917eb76a7177a43724879f0a` |
| `branch-separation.md` | 15001 | `b3981214b3aabb7c760d5408dad2b5d3393dfed444ffba5503a8d7c5e8e5e7ce` |
| `batches-and-acceptance.md` | 38635 | `8fd80172cda4734fcb750e3415c2da38304072f992c58781a2e677ae9eab633f` |
| `sources.md` | 50119 | `e029c6fc747e896516c91cb7285fa6cc4cf9cce4265bd589c405fff9355145a1` |

## 历史失败与本轮边界

上轮方案检查首次exit=1：review.md缺失导致链接失败；校验脚本还把 `git diff --no-index --check -- NUL <file>` 的正常“内容有差异”exit=1误判为空白失败，输出只有LF→CRLF提示、没有实际空白诊断。记录这一失败，不追写当时已通过；上轮普通git diff --check不能覆盖当时尚未跟踪的六文件。本轮重新检查完整受控来源与所有七文件，新增文件另做独立空白核查，不沿用该错误判定。

本轮首次编辑脚本在执行前因Python字符串语法失败，未写文件；一次补充patch因末段空白上下文不匹配拒绝，随后以准确上下文修订。它们是编辑命令失败，不计为文档检查通过；没有产品运行首败或新环境资源。

未执行：pnpm lint/typecheck/test/test:integration/test:e2e、未来M0–M5领域/客户端验收、真实OS／provider运行、远端Required CI及修订后平台独审。本轮仅Markdown变更，按现行ci-policy的docs分类执行有收益文档检查；未来产品变更仍执行适用必需检查，不能以本记录代替。迁移、API、事件、UI和权限均未改变；无容器/服务/秘密/临时配置或外部发布，未删除旧资源。审阅方式：在本文件变更预览依次打开上述矩阵、M2/M3/M4与来源；这是方案演示。
