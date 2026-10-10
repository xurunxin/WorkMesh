# M2 合入前 PR 与 Required CI 准备

正式复审已由用户转述确认两项 blocking 全闭、无新增 blocking/high。本轮只准备 PR 与 CI 证据，不修改产品代码，不合入或标记 Done。

## 精确来源与可用入口

- 仓库：`xurunxin/WorkMesh`。
- 平台分支：`tds/conv-01a121fb-781b-7b58-9bca-a596b92a8cbe`。
- 已审候选：`1fb8c0e49f74f1a6b34ee69158bcbe2292e288ec`；产品提交：`1cfb38178f56005d524d865d80115db3bbcdbecb`。
- 本轮平台只读 `ls-remote` 的 main：`cfce77546b64c2a8d7d12949261c38e2f666d5ae`，等于候选 merge-base；平台分支远端与已审候选一致。正常无改推送已实际完成。
- PR 号、实际 PR head/base 和 run ID 尚未取得，均记 null，不能用旧 PR213/CI411 替代。Chief 本轮已核按平台分支查 all-state PR 无结果；本 Agent 没有 `pull_requests` 工具，未冒称自行完成该查询。另实际读取 `refs/pull/*/head`，未见与已审 head 相同的 ref；这不替代完整 PR 状态/分支查询。
- PR 正文已准备于 [product-pr-body.md](product-pr-body.md)。创建后须读取实际 PR 元数据，再取得最新精确 head 的 Required CI。正常流程若另映射 GitHub 候选分支，须记录平台分支→PR head 分支、准确 SHA/tree/merge-base、双向 diff 与实际 base；本轮未创建或切换其他分支。

## 实际平台能力阻塞

当前工具枚举及运行时检查均没有 `pull_requests`、`create_pull_request` 或 `dispatch_workflow`。唯一可用的 PR 写工具 `merge_branch` 明确“opens and merges”，不能作为只开 PR 的接口，且本轮用户明确禁止直接合入。工作树 git 没有远端凭据，不通过 gh/git、另分支或更改 workflow 触发规则绕过平台正常流程。

已正常重新推送已审分支，随后 `workflow_runs(branch=平台分支)` 仍返回无匹配运行。现行 `.github/workflows/ci.yml` 的 push 仅监听 main；PR 创建或正常非合入的 CI 触发入口未提供，因此没有正在运行的健康 CI 可继续轮询。需要 Chief 在正常流程完成仅创建 PR 的步骤并提供准确 PR/run 标识后，主执行才能继续核查最新运行；这是缺执行入口，不是需要重新审批已授权产品范围。

## 必需 job 与真实状态

对准确 main→已审 head 全部 651 个差异路径运行现行 `classifyChanges`（仅分类，不是重跑产品 checks），结果 full：全部七个选择门禁均 true。现行工作流共九个 job 定义，E2E 两个 shard，预计十个实际 job。以下均未运行，没有 GitHub job ID，不能标 pending/success 或用本地结果替代：

| job ID | 显示名称 | 本轮 GitHub 状态 |
| --- | --- | --- |
| changes | Classify changes and validate CI selection | 未运行；run/job ID null |
| source-gates | Source gates | 未运行；run/job ID null |
| db-integration | Database integration | 未运行；run/job ID null |
| api-integration | API integration | 未运行；run/job ID null |
| worker-integration | Worker integration | 未运行；run/job ID null |
| e2e (1/2) | Browser acceptance (1/2) | 未运行；run/job ID null |
| e2e (2/2) | Browser acceptance (2/2) | 未运行；run/job ID null |
| recovery-integration | Complete disaster recovery | 未运行；run/job ID null |
| agent-smoke | Agent construction and protocol smoke | 未运行；run/job ID null |
| required-ci | Required CI | 未运行；run/job ID null |

API integration 原有 `pnpm test:conformance:integration` 必須运行真实 M0/M1/M2；原 include、root exclude、逐套件删除负例及 Required CI 聚合保持。Required CI 依赖全部所选 job；读取实际状态后仅全部满足现行策略才能交 Chief 正式合入，不能因无 run 将空结果当通过。

## 源码与证据绑定

[product-pr-ci-preparation.json](product-pr-ci-preparation.json) 保存平台原返回、UTC、实际分类命令/退出码、完整九 job 元数据、八份 CI 输入全文字节摘要与 Git blob，以及全部 49 份受测产品 Git/Windows 工作树双列。49 份当前工作树摘要和 Git blob 均逐项等于既有修复 commit-binding；全文 main→候选 `git diff --check` exit 0，开工工作树干净。此核验不是新增产品测试。

本轮新增三份准备文件只属于证据；其提交后的精确 head 由 push 返回及后续 ls-remote 核定，不为写自身 head 循环修改。旧 520-artifact 索引继续绑定旧冻结包，不将新增文件冒称已入旧索引。旧 product-report、所有首败/unknown/skip、原始 ZIP 和受测绑定不覆盖，无产品 blob 改动，无资源启动/删除。

## 后续获取结果的准确条件

创建后保存 PR number/URL、head branch/SHA、base branch/SHA及合成 merge SHA/tree；运行查询绑定 PR 最新准确 head，拉取各实际 job/step 的 status、conclusion、attempt、日志和 always-upload 证据，绑定 Actions 受测源码与当前产品 blob。健康运行持续观察到真实结束，不中断、不留后台收尾。产品代码变化或 base 实质变化须明确 diff 返回独审；纯证据变化先核全部产品 blob 不变。若真实 CI 失败，保原 run/日志与首败后修具体原因，不松 skip/断言/门禁；本轮无 CI run 可报告成功。
