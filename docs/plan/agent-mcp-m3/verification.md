# 九类具体验证与实际运行方案

状态：下面所有产品场景未运行；规划静态结果单列planning-report。范围来自frozen-m3原九行、DoD和本次repositoryIds裁定，acceptance-matrix逐行保存原文，不重写历史通过。

## 准备、运行与字节绑定

未来每次运行先建立唯一runId与resources.json，使用本任务专用PostgreSQL/Redis/RustFS数据库、bucket、fake provider、HTTPS假模型与HMAC receiver；脚本记录容器/镜像/卷/网络/端口/进程PID及配置绝对路径，生成随机测试秘密但不输出。DATABASE_URL/REDIS_URL/S3_*只在测试子进程指向本任务资源，执行require-integration-env后核服务身份，绝不对共享DB运行test:reset。源文件Git blob、工作树bytes/SHA256和实际Node/pnpm/Python版本分别绑定；运行后再次逐文件核对，避免拿Git SHA代运行字节。

复用createMcpCoverageFixture、createPlanningCollaborationFixture的真实身份/HTTP/token交付/假模型模式，新增delivery-recovery.fixture封装createProviderActionWorker、fake provider请求计数、HMAC provider webhook和RustFS传输。Human登录只用于连接、context pin、批准和H-only回归；Agent客户端不携Human cookie。

Windows用pnpm.cmd；E2E服务按现global-setup要求明确npm_execpath，保持test与development分离，设置captureGitInfo不吞整个证据diff；不用旧UI截图或旧check替新组合。失败finally先保全原输出与现场归属，再清本人的闲置资源。强杀/外部结果未知单列remaining effects，不冒清理成功。

## 九类闭合表

| ID／类别 | 具体设置与调用 | 必须观察的事实／不适用边界 |
| --- | --- | --- |
| S1 正常 | lifecycle三条完整链；六kind×五status投影夹具；parent100/普通child60/review40；UTF-8证据含中文、换行和JSON转义；getDelivery精确PR；health草稿与批准发布 | Native/MCP/Pi实收字段逐值等REST/DB/provider files；每action精确target/result、当前head、本人双证据、required completed、approval只一次消费；Issue不自动done/deploy。状态笛卡尔只证明投影，完整链另验 |
| S2 越权／撤权 | E2查E1 action；同Actor不同Session/跨Team/repo/path；父、definition、Team grant逐一缺repo:read；repoIds空/重复/101个/不在父scope；父Session-only context；读/页/写前撤权、父scope收窄、workitem移Project、provider off；reviewer自审；显式review创建成功后保work:write仅收窄父仓库/撤目标读权/使共享context失效，再原key/body重放 | 授权正对照成功，拒例保持零新增事实/仓库写HTTP；hidden action统一NOT_FOUND且无payload/error/URL；beforeReserve/authorizeReplay真实锁内重验，旧回执拒绝；三方runtime交集和父子共享context一致，旧scope不能继续；C target bridge不串身份 |
| S3 非法状态 | queued/paused/stale/stopping/terminal普通E；failed/dead/unknown action；upload canceled/expired/rejected再finalize，verified再cancel；file用于structured review；reviewer缺Room/Artifact/本人归属/当前head | 原状态码和完整error/correlationId；unknown只读对账，无新POST；reviewer无plan/repo写/自决批准；required child queued/active/failed/canceled/stale各状态都阻父，准确blocker IDs |
| S4 幂等 | branch/commit/PR/merge/CI intent同key/body真实并发及丢响应；reviewer创建/Room/Artifact/review/upload finalize/cancel/health重放；显式review合法原回执在child完成/预算满/并发满后重放，另测撤权后重放拒绝；K1/K2/K1、新动作同正文新key、异正文旧key | 原action/Artifact/child/reservation/Lease/event/outbox/HMAC交付/approval计数一份；合法review回执不再admission，异体冲突沿原顺序；unknown不换key重发；GET无receipt/活动/token。纯GET没有幂等写账本，这是明确不适用，不以“GET重放200”代下游效果去重 |
| S5 旧revision／head | 两commit同expectedHead；PR换head后旧code_review/review/merge/CI approval；health旧If-Match；parent stalePlan/old stableStep；upload cancel不发If-Match | 精确新head/revision/error可读；旧批准取消/不消费；context POST与upload cancel当前非revisioned，不制造If-Match负例；action GET无revision写锁。其余revisioned写维持原合同 |
| S6 事务失败 | intent提交after-state/before-event/outbox注入DB失败；repoIds验证/child reservation/lease/provision失败；Artifact/review/upload finalize/health批准消费失败；Worker checkpoint/finish定向失败 | state/event/outbox/批准/reservation整体回滚，commit前provider计数0；query无业务写的事务回滚场景不适用，另核成功/拒绝前后业务表不变，authorization_denials按原例外分列 |
| S7 重放 | 同GitHub deliveryId/body重复及异bytes冲突；outbox/job重复；upload到期finalize；Worker checkpoint后重启；fake/GitHub/Gitea五写kind成功但checkpoint前崩溃后重领；特别GitHub HTTP rerequest receiver记录成功后丢响应；同workerId不同attempt迟到结果 | 写action无checkpoint历史停发dead/OUTCOME_UNKNOWN，真实仓库写请求总数不增加，不借adapter去重；合法checkpoint只本地完成且provider总HTTP不增加；context纯GET有界重试；不双Artifact/review/merge/approval消费；签名/raw bytes实际HTTP；CAS准确generation，GET无新job |
| S8 并发 | 双commit、review和head换代、Human批准和Stop/撤权、context换代与读取、双C桥；完整authority/PR/check/approval真实锁竞争：Stop/revoke持锁先commit与Worker授权tx持锁先commit各一例；锁阻塞跨60秒租期，双Worker/同workerId新attempt；replay与scope/context撤权竞争 | 保存pg_locks/pg_blocking_pids和clock_timestamp；Stop/revoke先commit则仓库写0，发送tx先commit仅其在途请求允许，adapter后续写必须拒绝；锁后过期无checkpoint保守dead/unknown且不是authority_revoked，失代零覆盖；merge/CI最终门禁同tx；旧head不得放行 |
| S9 重启／恢复／Stop | API/MCP/Worker/Runner重启；provider调用前授权事务失败；provider成功但response/checkpoint前崩溃；commit tree/commit/ref各写边界中断；checkpoint后finish前重启；Stop先提交与发送前授权先提交真实竞争 | 十八行provider/kind恢复矩阵逐项实证；五类写无checkpoint领取历史停发，即使实际未发也保守对账；合法checkpoint只本地完成，dead不复活；context纯GET有限恢复；在途不可召回；Stop专用cleanup与M1原来源GET，终态E普通action GET仍拒。API GET重启不创造执行事实 |

每行原适用理由与补充test IDs在acceptance-matrix中；不得用通用pending取代逐操作正/拒例。对应已有stage3-delivery/stage3-provider/stage2-collaboration以及新增delivery-recovery真实套件；SDK/MCP/Runner/contracts单元核传输边界，不能代产品链。

## 具体命令与证据

先实读 `.node-version`、`package.json#packageManager` 和实际 `node --version`、`pnpm.cmd --version`，产品检查绑定仓库锁定运行时；本轮规划静态实用 Node v24.20.0，不冒产品要求的 Node 22.19.0。在上述专用环境上顺序执行，保每条start/end/argv/cwd/runtime/exitCode/stdout/stderr原件：

- pnpm.cmd check:route-policy
- python scripts/generate-agent-discovery.py 后 git diff核仅产品阶段预期增量；重复生成字节不变
- pnpm.cmd check:workmesh-skill
- pnpm.cmd check:runner-skill
- pnpm.cmd ci:test
- pnpm.cmd ci:validate
- pnpm.cmd lint
- pnpm.cmd typecheck
- pnpm.cmd test
- pnpm.cmd test:conformance:integration（单独证明Native/MCP/Pi真实新套件）
- pnpm.cmd test:integration（根DB/API/conformance/Worker/recovery全部，reset只针对专用库）
- pnpm.cmd test:e2e

新delivery-recovery.conformance.test加入conformance/vitest.integration.config；根vitest排除；ci-policy与测试把新套件加入必含清单，删除每个suite负例均实际失败，保Required API step/pipefail/always证据上传。不重复添加第二CI步骤来冒既有门禁。

每条测试保运行数量、skip及原因、首败和重跑，S1三客户端/九类/raw webhook/PG阻塞/真实对象存储证据分开。fake provider全链是必需；GitHub/Gitea实账号未授权外发，保持未测；Gitea multi_file_commit/retry_check源码明确不支持，不能以fake通过冒支持。缺store场景显式unsupported，不能用fake checksum冒RustFS实际header签名。

## 规划本轮的实际静态检查

本轮只执行capture-sources.py、static-check.py、DTO/OpenAPI一致/正反样本、自包含链接/UTF-8/空白、source ZIP逐member与Git blob/工作树双核、CI分类和候选逐blob核。ci:test/ci:validate如实际运行才单列结果。产品必需checks、九类产品用例、真实provider/OS、独立方案审查与新Required CI均未运行。

## 清理与退出

本轮规划无新容器/镜像/卷/网络/服务，只有当前工作树内受控文件与短时同步工具进程，resources.json记实际。未来清理仅已登记独有闲置资源；Windows递归前核resolved绝对workspace路径、link和活动引用并逐path保全依据；遇自动审批拒绝停同一目标，不换工具/Force/ACL/移动/父目录删除绕过，G1D0C3旧拒目标保护。当前恢复目录/旧任务证据不动。
