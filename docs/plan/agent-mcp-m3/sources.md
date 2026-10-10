# 精确来源、裁定与读取限制

本轮重新通过平台git ls-remote origin refs/heads/main实读 ef4cb5e1458d911d98433c443dba46e6c224caa0；开工worktree HEAD相同且无差异。平台共享cache路径只读，后续对象读取固定精确SHA，未以FETCH_HEAD猜主线。

冻结来源 c768e1e3db297d8b91b53dd68b60e723a8a40e7d 的原七文档全文位于source-snapshot.zip，逐blob/工作树双索引在source-manifest.json。M3 section按原UTF-8字节的M3标题到M4标题前截取；原字节单独ZIP保存，frozen-m3.md只规范EOF为一个LF，原九条验收和DoD不得摘要替换。

本轮当前主线完整commit对象/parents/tree及M2最新candidate fb770b62a926e7c27049c2795eafa6da4e0cb085一并归档，tree相同。M2 todo本轮实读done；CI415/run38028457556十job success由workflow_runs本轮实读，原返回在input。PR214 merged及独审blocking/high已闭来自Chief spec，本轮工具无pull_requests接口，未声称独立取到完整GitHub PR原件。CI415完整Actions logs/附件未下载，不能以CI414 ZIP冒415；M2其余报告仍保原含义，不以其绿色覆盖M3。

## 平台计划与spec

原plan引用 doc:fpst3y-xxH7WIBMjBXejk。input/platform-injected-original-plan.md保存本轮用户注入的完整平台saved copy，仅保正文，来源明确为注入，不是独立后端doc下载。

todos(id=g0q8D1msrOVY2kg-cSdkj)本轮返回Spec全文，Saved plan在长输出上限截断；input/current-spec-readback.md为可见完整Spec，input/todos-readback.json保原工具返回。conversation实读该doc引用和问题卡/反馈，但不返回计划全文。工具目录有tds，无通用doc read接口；未通过猜URL或敏感凭据绕取。原doc的独立全文、doc创建/版本字段未取得，记null；不拿截断前缀计算全文hash，不伪造原始backend bytes。

savedplan.md与implementation.md是上轮四处、本轮独审三处edit_plan修订的精确正文副本；原可见前缀与注入全文核对，七个替换记录在input/plan-edits.json静态逐项重建，独审三处原文另存input/reviewer-plan-edits.json。新的平台保存doc ID在本轮结束前不可取得，不为自引用循环edit_plan；本轮工具新读回仍有长度限制，input/reviewer-platform-readbacks.json保原封包，不冒doc全文下载。

用户唯一新安全合同裁定见input/user-repository-scope-decision.md，问题卡doc:q-zoO3M6sporQm1UHRMlj2K，选择显式repositoryIds。当前Spec已同步该裁定。input/chief-feedback.md明确本轮规划写入/提交授权；同范围规划不再问同一许可。

## 当前源码观察与提案的区别

| 观察 | 完整源与定位 | 本轮含义 |
| --- | --- | --- |
| reviewCaps三项，不含repo:read | collaboration/routes.ts:createReview；contracts/child-session-contracts.ts | 新可选repoIds为用户裁定，具体锁内验证/兼容仍待独审 |
| repo读取需要repo:read三方与repositoryIds | delivery/routes.ts:applicableAgentRepositoryContexts/assertAgentRepositoryWrite | 不能artifact:write冒read；共享context差异见scope-compatibility |
| child INSERT未写project_id | collaboration/routes.ts:createReview | Project context匹配须live WorkItem派生；不是天然通过 |
| upload cancel无If-Match | OPENAPI:cancelArtifactUpload；delivery/routes.ts:/cancel | 现合同事实，不是新增裁定；未来按原key/state核 |
| health Agent publish准确Human approval | operations/routes.ts:project.health.publish；contracts:projectHealthInputSchema | 与Human-only publishProjectUpdate区分；仍未M3验证 |
| provider status仅五类 | v1 baseline:provider_action_status；worker:claimAction/checkpointProviderResult/finishAction | unknown派生，不发明sending持久态；零迁移是规划决定 |
| 无checkpoint重领会再执行adapter，rerequest无去重查询 | worker:claimAction/executeAction；git-provider:GitHubAppProvider.retryCheck | 独审第一条blocking成立；新增五类写历史无checkpoint停发，十八行恢复矩阵待复核 |
| 普通Git只锁action，authority helper仅context使用 | worker:authorizeProviderSideEffect/authorizeRepositoryContextInTransaction；db:agent-locks.ts | 独审第二条blocking成立；完整authority-first事务及逐仓库写guard待实现 |
| 旧回执跳handler且createReview未传authorizeReplay | api:commands.ts:mutate；collaboration/routes.ts:command/createReview | 独审第三条blocking成立；beforeReserve/authorizeReplay共同精确重验待实现 |
| delivery多表LIMIT200 | delivery/routes.ts:getProjectDelivery | 精确head材料不能默截断，scope过滤在取数前 |
| M0冻结增量合成 | scripts/generate-agent-discovery.py:M1与M2加载 | M3加新增量，不倒写M0，真实套件与CI同时扩 |
| Pi普通结果50k与GET无活动 | Runner:makeTool/boundedResult | 新关键投影保完整，未来核真实模型，不冒SDK即实收 |
| Gitea能力边界 | git-provider/index.ts:giteaCapabilityMatrix/UnsupportedProviderCapability | 多文件commit、CI retry不支持据源码，真实账号未测 |

本包source-map.json将这些符号绑定精确source条目、源码行与blob；完整文件而非片段位于ZIP。所有本轮判读为静态；未运行M3产品、真实provider、OS或新组合。
