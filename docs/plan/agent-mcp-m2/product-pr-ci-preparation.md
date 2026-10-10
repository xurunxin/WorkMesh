# M2 合入前 PR 与 Required CI 准备

正式复审已由用户转述确认两项 blocking 全闭、无新增 blocking/high。本轮已实际创建 PR214 并取得 CI413 终态；产品运行时代码无改动，两份验证夹具／配置的增量另交正式复核。不合入或标记 Done。

## 精确来源与可用入口

- 仓库：`xurunxin/WorkMesh`。
- 平台分支：`tds/conv-01a121fb-781b-7b58-9bca-a596b92a8cbe`。
- 已审候选：`1fb8c0e49f74f1a6b34ee69158bcbe2292e288ec`；产品提交：`1cfb38178f56005d524d865d80115db3bbcdbecb`。
- 原轮平台只读 main 观察为 `cfce77546b64c2a8d7d12949261c38e2f666d5ae`，等于候选 merge-base；该观察原件保留。创建PR前本轮再次实读远端：平台分支7d54、main仍cfce，与PR创建元数据一致。
- 上轮尚无 PR/run 的观察按原7d54全文保留。本轮使用 gh 仅创建 [PR214](https://github.com/xurunxin/WorkMesh/pull/214)，exit0；创建时 head `7d54a9c7d4b81cfc7486483ec183b1bf1a15f5fa`、base `cfce77546b64c2a8d7d12949261c38e2f666d5ae`。PR head 分支就是平台分支，没有另建分支。实际 [CI413/run38026590315](https://github.com/xurunxin/WorkMesh/actions/runs/38026590315) 已全部 completed/failure，详情和新head后续门禁见 [product-ci413-report.md](product-ci413-report.md)。
- PR 正文已准备于 [product-pr-body.md](product-pr-body.md)。创建后须读取实际 PR 元数据，再取得最新精确 head 的 Required CI。正常流程若另映射 GitHub 候选分支，须记录平台分支→PR head 分支、准确 SHA/tree/merge-base、双向 diff 与实际 base；本轮未创建或切换其他分支。

## 平台工具与 gh 实证更正

平台工具枚举确实没有仅创建 PR 的接口，merge_branch 会执行合入，本轮未调用。但上轮未经检查 gh 就断言完全无入口，判断过早：工作树 Git 无凭据不代表 gh CLI 未登录。原三份报告的完整 Git／Windows 字节保存在 [pr-preparation-7d54-originals.zip](product-evidence/pr-preparation-7d54-originals.zip)，原误判与历史缺口不覆盖。

actual main 的 M1 product-ci410-report.md 确切记载主力用 gh pr create 创建PR213且exit0，这是M1历史来源，不能推断本轮登录。本轮独立核验现有 `C:\Program Files\GitHub CLI\gh.EXE` version2.102.0、auth-status exit0，已有keyring登录可用；令牌行保存前脱敏，未读取令牌值、安装CLI或新登录。按既有授权使用当前受控正文作为body-file，仅创建PR214并持续等CI413各健康job至真实终态。Git和CLI两种事实已分列，当前不再声称“无可用创建入口”。

## 必需 job 与真实状态

上轮对准确main→已审head全部651路径实际分类为full；以下表仅保留创建PR前的历史状态，不能当本轮最新状态。现已实际取得CI413十job：六success，Worker／两个E2E／Required CI failure；准确IDs、step、runtime和首败见CI413报告。两处验证修复后的新head还须取得自己的最新Required CI，不能以本地绿色或旧head部分成功代替。

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

原三份准备文件是7d54证据增量，旧520-artifact索引仍绑定旧冻结包，不冒新增文件已入旧索引。本轮CI413独立索引及ZIP保全原JSON/logs、创建时49文件及8CI输入全文双字节；修订原49中的1份Worker test fixture（其余48不变），Playwright配置另列，产品运行时代码没有改动。run136/137真实exit0；三份本任务独有容器在exit后按owner/ID保全日志再清，旧product-report／首败／unknown／skip及G1D0C3拒目标不覆盖。

## 后续获取结果的准确条件

已保存PR214、CI413和实际checkout `a2e55dd04b9795d51b9655861882f0cce7831470` 的parents/tree证明及全部原件。修订提交后继续绑定最新PR准确head/base及Required CI，健康运行至真实结束，不中断、不留后台。本轮两验证文件差异交正式增量复核；产品／base实质变化仍返回独审。保原failure和unknown，不松断言／skip／门禁，不以CI413报告冒未来head已通过，也不直接合入／Done。
