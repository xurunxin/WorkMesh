# M1 PR 与 Required CI 门禁回执

本轮建立 [PR #213](https://github.com/xurunxin/WorkMesh/pull/213)，目标 `main`，产品候选为已独审的 `394401880cb687d1a682b56d57b1342a86531c5c`。候选的 [CI #410 / run 37971202936](https://github.com/xurunxin/WorkMesh/actions/runs/37971202936)，attempt 1、事件 `pull_request`，十个 job 全部 success，包含 Required CI。本回执及原件是新增文档证据，产品代码、API/迁移、安全合同、43 操作决定及原规划没有修改。

此报告提交会产生新的分支 head，必须重新取得该 head 的最新 Required CI。这里记录的是 394401 的实际结果，不声称覆盖未来提交；后续精确 head/run/jobs 由 PR Checks 和主执行最终回复给出。本轮仅完成 PR/CI 门禁，不 merge、complete 或宣告整卡验收。

## 产品、审查与来源

最终执行、租约、Stop finally、失响应后的精确归属只读确认，以及公开结算等待后唯一续 Turn 的产品行为，见 [完整产品报告](product-report.md)、[最新 queued 作者修复报告](product-queued-author-repair-report.md)、[九类 DoD](product-closure-matrix.md) 和 [43 操作映射](product-operation-matrix.md)。三项成果审查 blocking 已在 394401 闭合：复用 Turn 的续接上下文、公平扫描，以及跳过失效输入并在状态机中结算失权 queued Turn；claim 前序门禁保留。此轮没有将旧审查结论套给新产品修改。

开 PR 前准确分支远端 head 为 394401，`refs/heads/main` 为 `e49eda142d61bdd248ddc42ec16f5563abd4bbc6`；完成 CI 后再次由平台只读 Git `ls-remote` 取得同一对值，原输出保存在归档 `main-observation.json`。平台工具未给 native exitCode，记录 null。

CI 日志实际 checkout PR 合成提交 `b99c50576ba01ba7c7666107d59fc90f59dc8caa`，不是把 run 的 head 字段冒作受测 checkout。GitHub Git commit 原对象确认父提交依次为 e49 与 394401；tree 为 `b4dac111ae28239fa6ddb2f0c278ef524cc27637`，与本机准确候选 tree 相同。`tested-merge.json` 和其命令回执保全该证明。本机 79 个来源成员分别记录工作树原字节与 394401 Git blob 字节，并逐一匹配原 `review-queued-source-index.json` 的运行工作树指纹；换行不同不混用 hash。该本机观察不冒作 GitHub runner 每文件运行前后实读，远端受测来源由实际 checkout 和原工件证明；远端没有逐文件前后指纹的部分仍是证据限制。

## CI 实际结果

以下秒数取 GitHub job 的 started_at/completed_at，包含安装和上传，不是推测子命令 runtime。原 jobs JSON 另保存每个 step 的状态及起止时间。远端命令 native exitCode 未单独提供时不伪填 0，实际 step/job conclusion 为 success；本机 `gh` 收集命令的退出/runtime/输出 SHA 则取 subprocess 的真实回执。

| Job / 准确 ID | 结论 | Job 秒数 |
| --- | --- | --- |
| Classify changes and validate CI selection / 113957975881 | success | 23 |
| API integration / 113958140866 | success | 531 |
| Source gates / 113958140871 | success | 408 |
| Browser acceptance (2/2) / 113958140887 | success | 365 |
| Agent construction and protocol smoke / 113958140914 | success | 36 |
| Database integration / 113958140917 | success | 154 |
| Browser acceptance (1/2) / 113958140930 | success | 669 |
| Complete disaster recovery / 113958141004 | success | 319 |
| Worker integration / 113958141023 | success | 100 |
| Required CI / 113962565550 | success | 25 |

Required CI 的原聚合输出逐项为 `source-gates: success`、`db-integration: success`、`api-integration: success`、`worker-integration: success`、`e2e: success`、`recovery-integration: success`、`agent-smoke: success`。没有取消健康运行、重跑赌博、忽略失败、降低断言或增加 skip；本轮 CI 没有失败结论。先前规划/本机首败仍留在原证据与历史，不用本次绿色覆盖。

实际摘要及完整原日志对应 [测试摘录](product-evidence/ci410-test-summaries.json)：DB 81 pass；API 257 pass＋1 商业模型凭据未启用 skip；真实 M0/M1 MCP/Pi conformance 29 pass、零 skip；Worker 119 pass＋2 原条件 skip；浏览器两分片为 38＋33 pass，共 71；灾备矩阵 1 pass，恢复后的生产服务 smoke step success。Source gates 包含 CI policy、lint、typecheck、route policy/WorkMesh skill/Runner skill、build、完整 unit，unit 32 tasks 成功。测试摘录保留各包原数量，不以任务数替用例数。

Worker 的两个 skip 是原 `retention-upgrade-barrier.integration.test.ts` 的显式环境开关，以及 `realtime-redis.integration.test.ts` 未注入 Redis URL；没有改动其条件。本机已有 120 pass＋1 skip 的组合，包含真实 Redis 用例，其准确输入/日志仍见前轮回执。CI 的绿色不消除这些条件限制，也不扩张商业模型、发布分发或其他原未测范围。

## 原件与资源边界

PR 通过 `gh pr create --repo xurunxin/WorkMesh --base main --head tds/conv-01a12031-e9de-75c4-ab40-b44affcd71f6 --title … --body-file node_modules/.m1-runtime/m1-pr-body.md` 建立，实际退出 0；正文文件使用真实换行。归档保存该精确文件及 GitHub PR JSON，后续 PR 正文状态以远端读取为准。PR 创建工具回执的原包装未另落文件，此限制不伪补为原始日志。

[原件索引](product-evidence/ci410-original-index.json) 与 [无损 ZIP](product-evidence/ci410-originals.zip) 包含 87 个来源文件：完整 Actions logs.zip、全文日志和十个逐 job 日志、全部十二份原 CI 工件 ZIP、run/jobs/PR/artifacts JSON、连续状态观察、准确 main 与合成提交对象、79 来源绑定及本轮收集脚本。每个成员按原 bytes/SHA-256 寻址，下载命令逐次记录退出和 runtime。嵌套 ZIP CRC、逐成员长度/hash 及未掩码 WorkMesh 凭据形状检查实际通过；不把可读测试摘录替代原件。原 ZIP 外部 SHA 为 `c6b7097439ec7be727042080c9eaeb6cf4e75a9dc1bb5435fd5a4472a43bf943`。

原件先下载到本任务独有 `node_modules/.m1-runtime/m1-ci-gate/`，脱敏检查及归档后才可清理；不只给 ignored 路径。此轮没有启动本机服务、Docker 或测试子进程；GitHub job 的服务收集及容器停止步骤由原 jobs/logs 保全。当前工作树、共享 Node/依赖与其他任务资源、G1D0C3 已拒目标均保留。清理本轮下载缓冲区前须验证绝对路径、归档对应及无健康命令，再仅清该独有子目录；最终执行回执另见主执行结果。

后续文档证据 head 的完整 Required CI 需继续等待真实终态。Chief 独立核最新 head/CI 后按既有门禁决定合入；这里没有 actual main/Done 或 merge 证明。
