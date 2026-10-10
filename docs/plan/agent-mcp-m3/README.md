# M3 受控规划交付

状态：规划候选，停 confirm 供 _oY 正式独立方案审查；尚未产品实现，尚未运行 M3 产品测试或取得本候选 Required CI。

本次修订回应三条blocking，先读 [独审修订入口](review-response.md)、[Worker恢复矩阵](worker-recovery.md)、[发送前锁与事务](worker-authority.md)、[reviewer锁内replay](review-replay.md)。原候选原件保全，不称已获重新审查批准。

## 审阅入口

1. [准确 spec](spec.md)、[冻结 M3 全节](frozen-m3.md)、[同步计划](savedplan.md)、[执行副本](implementation.md)。
2. [Proposed ADR](../../adr/0083-exact-provider-action-query-and-review-repository-scope.md)、[精确 action 安全合同](security-contract.md)、[reviewer 范围兼容](scope-compatibility.md)、[OpenAPI 提案](openapi-proposal.yaml)、[DTO 提案](dto-proposal.ts)、[policy 提案](policy-proposal.json)。
3. [操作矩阵](operation-matrix.md)、[机器决策](operation-decisions.json)、[消费者兼容](compatibility.md)、[真实调用链](lifecycle.md)。
4. [九类具体验证](verification.md)、[原九类逐行承接](acceptance-matrix.json)、[来源与读取限制](sources.md)、[来源原字节索引](source-manifest.json)。
5. [本轮核验与首败](planning-report.md)、[静态结果](static-checks.json)、[候选文件指纹](artifact-manifest.json)、[本轮资源](resources.json)。

主线和冻结来源以 source-manifest.json 中精确 Git 对象为准；source-snapshot.zip 保存完整 Git blob 和本轮工作树字节，不将 Windows 换行字节当成历史 Git 原件。

本轮仅修改本目录和 Proposed ADR。实施前先闭独审 blocking/high，并由 Chief confirm；此包不代产品测试、成果独审、最新 PR Required CI 或实际 Done/main。记录只在 Todos＋仓库，不存在真实 WorkMesh Project/WorkItem 同步。

## 演示

在 change review 对本文件点预览，依次打开上述合同、范围兼容、逐操作矩阵和验证入口。全部未来测试标未运行，已有 M2 的通过状态单独归属其原候选。
