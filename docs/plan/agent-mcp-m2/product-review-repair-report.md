# M2 成果独审两项 blocking 修复

原候选 b60faad71a12e5433cc58ae67ed37dbddddbf9bc 的两项审查反例成立，已修复并补实际验证；最终候选仍停复审，未自confirm、merge/Done或运行新PR Required CI。旧报告全文/Git与Windows字节在 product-before-review-repair.zip 分列，旧首败/unknown/skip不变。

## 发送 claim 过期和撤权分开

`session-webhook-authorization.ts` 返回 `authorized | revoked | claim_expired | claim_lost`，事务全程250ms timeout，先读原 workerId/attempt_count/status 和 clock_timestamp 租期，再按原来源/authority锁重验，最后在原delivery行锁位置重验。`agent-webhook.ts` 原撤权错误仍不可重试，claim过期/丢失改为 `AGENT_WEBHOOK_CLAIM_EXPIRED` / `AGENT_WEBHOOK_CLAIM_LOST` 且retryable；实际fail沿原退避回pending，CAS拒旧attempt覆盖新事实。未引入无限重试，原attempt上限耗尽仍按原策略dead。

真实PostgreSQL+本机HMAC HTTP receiver的25条批次测试：0.06秒短租期模拟默认60秒排队尾部，首条许可提交后HTTP延迟0.08秒，24条队尾过期零HTTP、明确pending及错误码，新Worker取原payload/签名全部投递，唯一deliveryId共25；旧claim再次deliver拒且fail不能覆写delivered。不是假时钟/privileged交换payload替代HTTP。现有Stop/撤权/Token来源/缺旧ID/selfclaim/concurrent fence正拒在M2全套继续核验；commit后在途许可不宣称可撤回。

## Runner 完整合法文档读取

`workmesh-tools.ts` 对准确GET及三operationId `getDocument` / `getDocumentRevision` / `exportDocumentMarkdown` 使用 `JSON.stringify(reported)`，其余成功写摘要/分页策略保持。现有Markdown上限200,000字符，正文含JSON转义膨胀仍完整返回；不新增接口或Agent权。unit覆盖60,000普通字符、200,000 NUL字符（schema/工具输出边界，不称Postgres可持久NUL）及引号/反斜杠/换行。实际HTTP/MCP/Pi创建60,000普通字符和60,000 U+0001正文，模型选择三种读取，末轮模型实收逐值与REST/DB一致，JSON超过360,000字符；原始captures见最新M2运行ZIP的review-repair-large-document.json。

## 实际命令与证据

| 原回执 | 精确命令 | native exit | 秒 | 原stdout汇总 |
| --- | --- | --- | --- | --- |
| run-125.json | C:/nvm4w/nodejs/pnpm.cmd -C apps/agent-runner exec vitest run src/workmesh-tools.test.ts | 0 | 3.810 | Test Files  1 passed (1)<br>Tests  22 passed (22) |
| run-126.json | C:/nvm4w/nodejs/pnpm.cmd test:integration:worker | 0 | 38.406 | Test Files  8 passed | 1 skipped (9)<br>Tests  121 passed | 1 skipped (122) |
| run-127.json | C:/nvm4w/nodejs/pnpm.cmd typecheck | 0 | 27.235 | Tasks:    18 successful, 18 total<br>Cached:    13 cached, 18 total |
| run-128.json | C:/nvm4w/nodejs/pnpm.cmd test:conformance:integration | 0 | 327.761 | Test Files  3 passed (3)<br>Tests  41 passed (41) |
| run-129.json | C:/nvm4w/nodejs/pnpm.cmd -C packages/db exec vitest run src/agent-lock-order-inventory.test.ts | 0 | 3.005 | Test Files  1 passed (1)<br>Tests  8 passed (8) |
| run-130.json | C:/nvm4w/nodejs/pnpm.cmd test | 0 | 23.664 | @workmesh/artifact-storage:test:  Test Files  2 passed (2)<br>@workmesh/artifact-storage:test:       Tests  22 passed (22)<br>@workmesh/ui:test:  Test Files  4 passed (4)<br>@workmesh/ui:test:       Tests  50 passed (50)<br>@workmesh/observability:test:  Test Files  2 passed (2)<br>@workmesh/observability:test:       Tests  16 passed (16)<br>@workmesh/git-provider:test:  Test Files  2 passed (2)<br>@workmesh/git-provider:test:       Tests  13 passed (13)<br>@workmesh/domain:test:  Test Files  9 passed (9)<br>@workmesh/domain:test:       Tests  65 passed (65)<br>@workmesh/agent-sdk:test:  Test Files  3 passed (3)<br>@workmesh/agent-sdk:test:       Tests  53 passed (53)<br>@workmesh/a2a-adapter:test:  Test Files  1 passed (1)<br>@workmesh/a2a-adapter:test:       Tests  4 passed (4)<br>@workmesh/contracts:test:  Test Files  28 passed (28)<br>@workmesh/contracts:test:       Tests  210 passed (210)<br>@workmesh/config:test:  Test Files  2 passed (2)<br>@workmesh/config:test:       Tests  34 passed (34)<br>@workmesh/web:test:  Test Files  114 passed (114)<br>@workmesh/web:test:       Tests  789 passed (789)<br>@workmesh/db:test:  Test Files  8 passed (8)<br>@workmesh/db:test:       Tests  28 passed (28)<br>@workmesh/mcp:test:  Test Files  4 passed (4)<br>@workmesh/mcp:test:       Tests  50 passed (50)<br>@workmesh/fake-agent:test:  Test Files  1 passed (1)<br>@workmesh/fake-agent:test:       Tests  4 passed (4)<br>@workmesh/agent-runner:test:  Test Files  13 passed (13)<br>@workmesh/agent-runner:test:       Tests  74 passed (74)<br>@workmesh/recovery:test:  Test Files  1 passed (1)<br>@workmesh/recovery:test:       Tests  7 passed (7)<br>@workmesh/api:test:  Test Files  34 passed (34)<br>@workmesh/api:test:       Tests  180 passed (180)<br>@workmesh/worker:test:  Test Files  24 passed (24)<br>@workmesh/worker:test:       Tests  211 passed | 2 skipped (213)<br>@workmesh/conformance:test:  Test Files  1 passed (1)<br>@workmesh/conformance:test:       Tests  1 passed (1)<br>Tasks:    32 successful, 32 total<br>Cached:    26 cached, 32 total |
| run-131.json | C:/nvm4w/nodejs/pnpm.cmd lint | 0 | 22.168 | Tasks:    18 successful, 18 total<br>Cached:    15 cached, 18 total |
| run-132.json | C:/nvm4w/nodejs/pnpm.cmd build | 0 | 79.681 | Tasks:    18 successful, 18 total<br>Cached:    15 cached, 18 total |
| run-133.json | C:/nvm4w/nodejs/pnpm.cmd test:integration:worker | 0 | 42.527 | Test Files  8 passed | 1 skipped (9)<br>Tests  121 passed | 1 skipped (122) |
| run-134.json | C:/nvm4w/nodejs/pnpm.cmd typecheck | 0 | 27.312 | Tasks:    18 successful, 18 total<br>Cached:    14 cached, 18 total |
| run-135.json | C:/nvm4w/nodejs/pnpm.cmd ci:validate | 0 | 1.906 |  |

全部run回执分别保运行前后完整指纹、原stdout/stderr ZIP、准确runtime/退出与skip。runtimeBinding明确列开始/结束后变更，早期run126及run128期间仅文档/测试或guard timeout位置调整，不冒全局不变；run128中的Runner与M2测试体始末字节均不变；guard仅将timeout设置移到第一次只读查询前，run133用当前guard全Worker复验，不为此纯锁超时位置调整重复已充分绑定的大文档Pi调用。root integration按原run099未改DB/API+本次实际Worker及三套conformance组合，E2E run106 UI源码未改保原70通过，不冒新head全根integration/E2E重跑。原rule/Skill/ci:test源码无变化保已充分绑定回执，rootunit无UPDATE开关复验锁清单；CI真实M0/M1/M2 include及逐套件删除负例未删。

49份原完整产品工作树和本次实际源码增量/Git旧blob/clean-filter预期提交blob另见product-review-repair.json与source ZIP。原product-source-manifest/commit-binding属于旧b0受测事实保留，不能冒本次guard/body修复已绑定旧commit；新产品commit后逐blob复核另登记。91操作当前MCP/Runner实收入口结果重新生成；18行旧闭合矩阵仍是原运行事实，本轮G1大正文读取/C7过期队尾重领补证据在本报告，不删除旧断言或把首败重写成功。

所有健康命令实际exit后各独有service ID/owner核验再清理，原服务日志保全脱敏字节再可读规范化，shared镜像/store/他人服务/G1D0C3及当前恢复目录未动，无新volume/network。原历史缺exit仍unknown。无migration/新事件/权限/UI/F/TA/真实外发扩展。
