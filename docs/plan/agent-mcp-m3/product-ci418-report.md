# M3 CI418 成功与构建配置增量审查

[PR215](https://github.com/xurunxin/WorkMesh/pull/215) 的 [CI418/run38058175401](https://github.com/xurunxin/WorkMesh/actions/runs/38058175401) 已 completed/success，十job含Required全部success。head `7b826b9377bb5267d74164c489af9fa35c73dddd`，base `ef4cb5e1458d911d98433c443dba46e6c224caa0`，attempt1，pull_request。实际十job日志均含合成checkout `2464c7aefdde95c0efcef70ed84f806142e4ddb7`，parents为上述base/head，tree `cf9afc02f0173855cb4a24796cef9fe8df64daf3` 等于产品head tree。

[完整原件ZIP](product-ci418-originals.zip)、[逐成员摘要](product-ci418-archive-index.json)、[run/jobs/工件/commit全字段](product-ci418-results.json) 保全十job、十二工件及收集命令native exit/runtime。GitHub artifact digest、实际下载digest、成员脱敏后digest分列；全部成员及嵌套ZIP保留，远端未给子exit记null。

| Job／ID | conclusion | runtime 秒 |
| --- | --- | --- |
| Classify changes and validate CI selection／114230812022 | success | 37.0 |
| Browser acceptance (1/2)／114230935496 | success | 283.0 |
| API integration／114230935502 | success | 811.0 |
| Browser acceptance (2/2)／114230935508 | success | 434.0 |
| Worker integration／114230935530 | success | 430.0 |
| Agent construction and protocol smoke／114230935542 | success | 48.0 |
| Complete disaster recovery／114230935550 | success | 340.0 |
| Source gates／114230935555 | success | 429.0 |
| Database integration／114230935591 | success | 204.0 |
| Required CI／114233522755 | success | 34.0 |

## 真实验证与修复

分类full；策略16测试及四批套件删除负例通过。DB81、API278/1原条件skip、M0/M1/M2/M3真实conformance61/0skip、Worker146/2原条件skip、E2E38+33、灾备1及agent smoke成功。Source gates typecheck18/build18实际执行，均0cache；unit32任务成功/14cache，逐包统计在ZIP中。不冒缓存回放为重新执行，不混写Ubuntu与Windows条件skip。

[CI417首败](product-pr-ci-report.md) 保持完整原件。唯一产品/验证配置变化是 `packages/conformance/tsconfig.build.json` 生产exclude增加 `"src/delivery-recovery.fixture.ts"`，原rootDir与前三批模式保持；真实integration include仍含四批，lint/typecheck不排夹具。直接tsc与全仓build本机起止无变回执均exit0；CI418又实际重验build成功。充分无变旧本机checks不重复跑。

[1114精确Git/Windows绑定](product-ci-build-fix-commit-binding.json) 逐行实读，相对_oY已审ac0c13e仅该构建配置变化，其余1113 blob/runtime未变。旧Git/新runtime/Git全文见准备ZIP。原正式复审不冒覆盖这项增量，需另一Agent正式增量复核，不以内部自审替代。

## 后继head与收尾

本报告与归档形成纯证据后继head，必须核1114产品/测试blob与CI418全同并取得自己的最新RequiredCI；CI418不代后继。报告不循环写自身未来SHA。后继run原API/日志/工件保全在Actions及本轮独有恢复缓冲，最终回复列准确head/run与保全SHA；不拿CI418 ZIP冒后继原件。

健康命令/CI均等到终态，未取消/盲重跑/合入/Done。仅Todos＋仓库记录，真实provider账号/外发、UI/F-TA未测/范围外，不扩权限凭据。[逐path缓冲保全清理](product-ci-buffer-cleanup.json) 不递归、不碰共享node/cache/store、当前恢复目录与G1D0C3。最终停review交Chief正式merge_builds。原metadata生成一处路径引号SyntaxError已纠正，属于报告生成exit1而非产品测试；完整原run未改。
