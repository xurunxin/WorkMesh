# M2 PR214／CI413 首败与验证修复回执

本轮仅创建 PR、运行合入前 CI 和修复验证夹具，不 merge／Done。此前正式复审的产品运行时代码没有变化；两份验证文件的增量仍须正式独立复核。

## PR 与入口更正

[PR #214](https://github.com/xurunxin/WorkMesh/pull/214) 使用平台分支作为 head，没有另建／切换分支。创建 argv、native exit0、runtime、完整 body-file 原字节与远端 PR JSON 在原件 ZIP。创建时实际 head `7d54a9c7d4b81cfc7486483ec183b1bf1a15f5fa`，base `cfce77546b64c2a8d7d12949261c38e2f666d5ae`，state open、merged false。

actual main 的 M1 ci410 报告6,801字节、blob `d6502f8f16194a3048c57e97da9acd04ebba089b` 是历史 gh 创建PR213的来源全文。本轮另实核 gh2.102.0 已有 keyring 登录，auth-status exit0，令牌行在保存前脱敏；没有获取令牌、安装或新登录。Git无凭据与gh登录是独立事实，上轮未经核验CLI就断言完全无入口，判断过早。原7d54三份报告的完整Git／Windows字节保留于 pr-preparation-7d54-originals.zip，当前准备报告已更正，不覆盖原误判。

初次探测输出因GBK无法打印勾号失败，外层后来Git命令exit0不能冒Python成功，子native exit未单独捕获记null；随后ASCII JSON探测实际exit0。日志收集器runpy entrypoint与摘要脚本的两次native exit1、gh对终端控制序列的拒绝native exit1，以及文档patch重复目标拒绝（未应用、无native exit字段），均保原非秘密错误与恢复。不把这些收集错误当CI用例首败。

## CI413 实际结果

[CI #413／run38026590315](https://github.com/xurunxin/WorkMesh/actions/runs/38026590315)，pull_request、attempt1、head7d54，最终completed/failure。所有健康job持续轮询到终态，没有中断、赌博重跑或提前清服务。秒数按实际job started_at→completed_at，含安装／上传；远端子命令没有native字段时不伪填0。

| Job／准确ID | conclusion | 秒 |
| --- | --- | --- |
| Classify changes and validate CI selection／114138618406 | success | 26 |
| Worker integration／114138702222 | failure | 120 |
| API integration／114138702248 | success | 519 |
| Source gates／114138702259 | success | 244 |
| Browser acceptance (2/2)／114138702268 | failure | 97 |
| Complete disaster recovery／114138702283 | success | 274 |
| Browser acceptance (1/2)／114138702285 | failure | 89 |
| Database integration／114138702286 | success | 216 |
| Agent construction and protocol smoke／114138702289 | success | 36 |
| Required CI／114140184824 | failure | 26 |

原日志：DB81pass；API270pass＋1原条件skip；真实M0/M1/M2 conformance41pass、零skip；灾备1pass及恢复后smoke success；Source gates包含lint/typecheck/rule/skill/build/unit，unit32tasks success。Worker119pass／1fail／2原条件skip。两个E2E在浏览器用例执行前RangeError，不能称浏览器验收已过。

## 两处精确验证修复

Worker 批次新用例原 `claimDeliveries(25,0.06)` 在慢Linux runner首次合法授权完成前就可能过期，首败 `AGENT_WEBHOOK_CLAIM_EXPIRED`、fixture line403。改为 `const batch = await worker.claimDeliveries()`，用实际默认60s。首次真实HTTP／HMAC成功后，通过PostgreSQL clock_timestamp／pg_sleep等待原batch deadline；不改locked_at、attempt、来源或授权，不伪造时钟。原24队尾零HTTP／pending／retryable、重领25份原payload、旧claim CAS拒覆写等断言完整保留，仅该实际分钟用例timeout90s。接收器立即响应，不放宽生产HTTP timeout。

E2E原日志同为Playwright spawnAsync拼接全部stdout时 `RangeError: Invalid string length`。所安装1.61.1源码的gitCommitInfoPlugin先捕获整个git diff，随后才截1e5字符。本机有界流读取同准确base/head完整545,807,656字节，native0，SHA-256 `b627917ae1f72ce4c6e0478202abda5bb17f8a131c8e0d90009f23bd66da27a8`。修 `playwright.config.ts` 为 `captureGitInfo: { commit: true, diff: false }`，仅关闭可选HTML metadata的巨量diff。commit metadata、所有测试断言、trace／截图／视频及Required CI源码差异门禁保留；不改依赖版本、UI或权限，不用截断metadata替代独立全文Git绑定。

| 原回执 | 精确命令 | native exit | runtime秒 | 实际结果 |
| --- | --- | --- | --- | --- |
| run136 | C:/nvm4w/nodejs/pnpm.cmd test:integration:worker | 0 | 98.986 | 121pass／1原条件skip；默认60s队尾用例实际61.396s |
| run137 | C:/nvm4w/nodejs/pnpm.cmd typecheck | 0 | 45.132 | 18tasks success，0cached |

两运行源码前后指纹实际相同。不重复未改域充分绑定的本地检查；修订候选仍须自己的最新PR全组合，以上绿色不替代。

## 来源、原件与门禁

CI413实际checkout `a2e55dd04b9795d51b9655861882f0cce7831470`，GitHub原commit对象parents为准确cfce／7d54，tree `b3fc241f654ec636d8ec40d9dc6bdc213f8016ac` 与候选相同，十job原日志均见该SHA。创建时49产品文件及8CI输入全文按Git raw／Windows字节双列保全。修订2文件另保旧Git／新worktree全文、bytes/SHA和预期clean-filter blob；原49中48项不变、1项Worker integration fixture改动，Playwright配置另列。产品运行时代码没有改动，不能称全部49项不变或旧独审已覆盖两验证差异。

[结果／绑定](product-ci413-results.json)、[原件索引](product-evidence/ci413-original-index.json)和[无损ZIP](product-evidence/ci413-originals.zip)包含PR／连续观察／run／jobs、日志ZIP、十个逐job原日志、十份工件ZIP、全部gh命令exit/runtime/输出SHA、M1历史来源全文与收集脚本。185成员CRC和逐成员bytes/hash、328嵌套成员秘密形状扫描实际通过，无未知凭据。checkout／Git源码证明不冒远端每文件运行前后实读。

本地owner `m2-f18243ff2d68` 三容器在run136实际exit后按精确ID／label核验、保全脱敏service字节后清理，cleanupExit均0；原字节入ZIP后才规范化阅读副本。共享资源、当前恢复目录和G1D0C3拒目标未动。独有下载缓冲区暂保留，最新健康CI结束、原件保全齐后才可仅清本任务路径。

本报告提交产生新head，必须继续取得该head的最新Required CI终态；CI413失败与这里的本地绿色都不能代替。最新准确head/run/jobs/checkout由主执行最终实际核验及PR Checks给出，不为写自身head循环改文件。两验证文件差异交Chief正式增量复核；产品或base实质变化返回独审，无merge/Done证明。
