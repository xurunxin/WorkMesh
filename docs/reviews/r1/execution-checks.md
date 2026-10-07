# 本轮规格修订检查记录

本轮基点 `f137787faa0979b59dd70668001b09bb5e132421`，实际main `5743f027ec86e8726d2cfdd38e0e038bdebeae49`；最终本回合head由平台生成，以下结果不得标为尚不存在提交的PR CI。G1证明/历史run保持原件，不代替这些检查。环境/精确时间见 [JSON结果](execution-check-results.json) 和 [环境](execution-environment.json)。

## 必需检查

| 命令 | 实际退出码/结果 | 证据 |
| --- | --- | --- |
| pnpm lint | 0；成功退出 | execution-logs/final-source/lint.log |
| pnpm typecheck | 0；成功退出 | execution-logs/final-source/typecheck.log |
| pnpm test | 0；18 workspace成功；Worker2项条件跳过，详见原日志 | execution-logs/final-source/test.log |
| pnpm test:integration | 0；DB77/API154/Worker78/Recovery1通过（共310），2项设计跳过 | execution-logs/run6/integration.log |
| pnpm test:e2e | 0；标准根命令，65通过/0失败 | execution-logs/run9/e2e.log |

## 当前CI策略与附加核验

JSON/脚本/局部gitattributes使本PR走full selection；不能使用纯文档免测，也不能用旧G1 CI376替代新head。`pnpm ci:validate`、`pnpm ci:test`均退出0；构建18任务成功，route policy、两类Skill工件、agent smoke、conformance六种参考adapter/fixture全部退出0；带独立测试环境值的 `docker compose config --quiet` 退出0，仅验证配置。源码脚本和选择/聚合规则保持原仓库规范，未修改CI。

本地Windows Node24.20.0、pnpm9.15.4；workflow指定Ubuntu/Node22.19.0及E2E两分片，恢复job包含生产镜像。上述本地检查不是等价的Actions run：最新PR/head必需CI仍待平台提交后核验。没有变更机器全局Node、CI规范或发布权限。

最新main的只读可达性验证为44/44输入、P1 16/16、归档280项/61members、0 errors，输出另存reachability-latest-main.log。原工作树验证器报主计划/ADR与base不等，原因是本R1已获准修订这些文件；不冒称旧相等规则通过，也不重开G1。修订后由规格静态校验器核对原件不变、冻结段保留及新规格一致性。

`node docs/reviews/r1/verify-specs.mjs` 与历史交接校验器检查29/29卡、261行九类矩阵（139独立适用断言）、154条原checkbox、DoD/旧原文哈希、真实id/stages/实现及最终验收无环、ADR实际状态、P1/D0和原claim段；这里只证明静态一致性。新feature测试仍待各执行者创建/扩展，现有文件不等于新用例已跑。`git diff --check` 对工作树及最新main差异执行，不做空白规则豁免；最终结果见static-check-results.json。

## 失败、修正和复测边界

- `execution-logs/`：bootstrap生成仅24字节，不满足配置32–256；根集成/E2E退出1。处置：纠正为32随机字节canonical base64url，秘密不落盘；失败保留。
- `execution-logs/run2/`：前回合中断，无终止退出码。处置：未记成功；本回合确认无该检查存活进程。
- `execution-logs/run3/`：PostgreSQL socket未ready。处置：TCP readiness后再创建DB，记录启动失败。
- `execution-logs/run4/`：API artifact 404，独立bucket尚未创建；E2E Project详情超时1失败/64通过。处置：按最新CI显式初始化ObjectLock/versioned bucket；UI超时根因未定，保留截图/上下文，单项和标准整套复测分别通过，不以重跑证明原因已修。
- `execution-logs/run5/`：Worker拒私网用例受helper全局ALLOW_PRIVATE_AGENT_WEBHOOKS=true影响。处置：集成恢复默认false；E2E自己的API fixture显式true，根集成run6全链成功。
- `execution-logs/run7/`：诊断直接pnpm exec缺npm_execpath，setup失败。处置：使用原package script，run8定向2/2通过。
- `execution-logs/final-source/compose.log`：Compose未提供必须的bootstrap/cursor环境值。处置：仅传临时随机测试值给config --quiet，compose-configured.log退出0。

bootstrap依据 `packages/config/src/index.ts:93` 与 `scripts/generate-bootstrap-token.mjs:3`，修改检查助手生成长度，不改产品配置校验；S3初始化依据workflow的API bucket步骤；Worker默认拒私网断言 `apps/worker/integration/stage1-lifecycle.integration.test.ts:219`。UI超时属于既有基线检查，产品相对main完全未变；定向复测2项（含bootstrap）和单独整套复测65项通过，初次失败原因仍未定位，交Chief/独审核验稳定性，不称已修复产品。

所有检查进程已结束，run6/run9原始日志/JSON列实际开始结束时间及退出码；没有外部挂起job被预填成功。独立容器测试不接触真实数据/真实通知。原字节ZIP及双来源索引、可读展示规则见 execution-logs/README.md，首次失败与中断不删除。

## 尚待闭合

生产者已修订high，但最终独立复核尚未安排结论；#6合并前卡片额外要求范围仍须Chief核验来源。设备发布/渠道部署决定、F4数字预算仅关闭对应实现阶段，不假称已批准；可审具体方案见decisions.md。最新PR/head Required CI未取得，不能确认本任务完成/合入。Chief成果独审及上述门禁通过后才按委托合入，逐卡同步读回；当前未同步、未放行产品。

## 成果反馈修订的检查版本

本次基于已提交 `18027999536ac9ea34961c06ddba8b6bcf60b37d` 定向修订。此前五项必需检查与日志继续作为前一生产者工作树的实际结果保存，不把退出时间或版本重写。产品/CI原件未改，按用户“不无理由重跑已成功全量检查”要求，本次只运行规格/阶段/门禁静态校验、校验器语法、历史原件/归档、CI策略和差异空白检查，具体结果见review-feedback-checks.json。新head的Required CI由平台提交后核验；不自行豁免选中的CI任务。
