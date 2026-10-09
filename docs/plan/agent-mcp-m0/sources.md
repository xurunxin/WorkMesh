# 来源、平台正文和字节绑定

## 当前计划与历史

当前平台docID为WS-FdgmfTwloZE8hNXvAb，从本轮conversation实际读回；计划消息实际时间为2026-10-09 05:05:49 UTC，不把消息时间冒作后端doc创建时间。版本字段及doc创建时间未提供，均null。正文取本轮注入的authoritative saved copy，原文写入savedplan.md及implementation.md；工具todos计划仍截断，仅可核可见前缀，不声称已全文读后端doc。本轮不调用edit_plan或创建平台计划。

完整当前spec从本轮todos的Spec至Saved plan分隔符读回，与现有spec.md逐字核；steering追加完整独审、实际平台修订记录和本轮同步授权。原计划doc:K7ASX6igBDq85SckGcuui、原21文件、截断/版本null/时序和原ENOBUFS首败由可达提交00a5e34e48f4a099f7a85dbf8dd41c79d8ee2294保全；history/original-manifest.json列每个blob大小、SHA-256和OID，关键原件另复制，不伪补历史工具原文。

## 基准与实际main

本工作树产品基准是c768e1e3db297d8b91b53dd68b60e723a8a40e7d，上一文档head是00a5e34e48f4a099f7a85dbf8dd41c79d8ee2294。本轮平台git用ls-remote origin refs/heads/main实读add4340e9c52575c2fd9615b3b114ac9acd3e30e，再fetch主线，并始终以该精确SHA读取差异，不把共享FETCH_HEAD当固定main。

实际main新增已合PR210的C2后端变化：通知config增加configuredProviders部署披露及server接线、Worker投递/配额恢复、环境/compose和相关合同文档/证据；锁文件增加Worker的zod依赖。相关接口当前OpenAPI/route-policy及MCP/SDK/Runner源码未变，操作集合仍为277。Human通知管理未变为Agent权限。source-manifest.json列完整差异路径，并对M0来源逐项记录base和当前main的blob；通知config/server/lock及ADR0076实际差异不隐藏。没有混入#9/#16未合分支，没有在本轮合并产品代码。产品放行后先整合真正已合main的这些增量并重核组合检查。

#53 approved operation-index来源74f247f9240eaf21e74ef248f71a445c1d4276d7到c768的产品树未变，只追加原分批方案文件。引用#53的原行保留其历史语义，当前277是实际集合基数，非永久指标或端到端通过率。现行CONTEXT、AGENT_PROTOCOL、OpenAPI、SCHEMA及已接受ADR为权威，不重建移除的PRD。

## 精确Git与运行字节

source-manifest.json现在逐项保存114项M0涉及的源码、所有API注册入口、现行guard/domain、RequiredCI接线、完整SCHEMA includes和#53来源。每项分列base Git OID/bytes/SHA-256、当前工作树bytes/SHA-256/CRLF计数、映射以及精确当前main的OID/bytes/SHA-256；不能把c768工作树称为已测试add434产品。

本目录新文档UTF-8 LF；Windows后续检出可能CRLF。暂存blob核验见archive-byte-manifest.json，报告自引用排除，不因此免除报告自身Git提交。历史关键原件从原commit读取Git blob复制，指纹不冒作原Windows运行原字节；原报告中的当时worktree映射保持原含义。

## 本轮真实生成顺序与边界

先实读当前branch/head、平台conversation/todos、精确main及差异，首个本轮clock工具观察为2026-10-09 05:08:55 UTC，随后保存观察和原归档，再同步当前正文/说明，生成结构化操作与source表，然后执行文档核验、暂存字节检查和Git检查。platform-observation-current.json的recordedAt为读取后的归档时点，不冒工具调用事务时间。生成脚本startedAt/completedAt、实际Node/Python和正文哈希见generation.json；各命令真实返回及首败见sync-check-receipt.json。

archive-audit.mjs使用原可达JSON中的完整OpenAPI/policy/原索引输入，重新定位当前源码、生成结构化资格/variant/绑定/反例，并核base到当前工作树产品无变化；archive-check.py再用PyYAML独立解析当前OpenAPI，核集合、具体拒绝、全部证据锚点/OID、历史原件和来源字节。未执行领域命令或产品服务。

本轮未pnpm install或运行lint/typecheck/unit/integration/e2e/Pi/conformance/RequiredCI；没有容器、镜像、卷、网络、测试库或长期服务。只运行退出即结束的Git/Node/Python文档进程；受控生成脚本属于交付文件，没有可删临时目录。当前worktree、恢复目录、旧证据保留，不global prune、不force、不移动/父删绕过已拒目标。
