# 来源、全文归档与边界

## 准确对象与本轮读回

平台只读git本轮重新fetch origin main，准确FETCH_HEAD=`87f88b89297c5c1e346f7ef99118c410f4b4a905`；parents=`ef4cb5e1458d911d98433c443dba46e6c224caa0`、`d27cb9be3a19befeae431df08276c9ca94d7dbed`；tree=`a8590e0818418e23fc299056ff3d479c65915c78`，与M3候选tree一致。起始本任务HEAD同main，起始headToMainDiff为空；结束时只新增本目录，不据本地origin/main判断合入。

冻结路线源=`c768e1e3db297d8b91b53dd68b60e723a8a40e7d`，完整七文件在 [source-snapshot.zip](input/source-snapshot.zip)；M5原始177–201行逐字提取到 [frozen-m5.md](frozen-m5.md)，原父文件完整bytes另外保全，标题间空行不倒写。逐项commit/path/blob/bytes/SHA-256及当前worktree另一独立指纹见 [source-manifest.json](source-manifest.json)。ZIP以内容寻址member保全原byte，不将二进制套UTF-8／换行规则。

本轮捕获条数与ZIP member数量以source-manifest及静态回执实际统计为准，包含权威产品文档／ADR、实际REST/Zod/policy/SDK/MCP/Runner/Worker/conformance源码、domain／DB／config／provider／store源码、DDL、原M0–M3合同／矩阵／报告，以及冻结七文件。捕获不等于对全仓或每个操作做完运行审计；当前完整OpenAPI解析280operation与实际发现280rule/138binding是静态来源计数。selected操作各自对齐main，不将冻结277行索引倒写成当前数量。

## 平台计划与反馈

原平台计划引用 `doc:KlfDrOUAFsJU7CSWbjbOp`。本轮authoritative injected saved copy全文与`todos(id=OHtiaCWGLuE1ZKuaYcslS)`返回的Saved plan逐字一致，保存 [platform-savedplan.md](input/platform-savedplan.md)。原卡Spec全文完整读回、无截断marker，保存 [spec.md](spec.md)。raw工具可见全文和conversation、前置todo／CI只读响应保存在 [platform-observations.json](input/platform-observations.json)；工具返回结构的UTF-8序列化不是平台HTTP原始传输byte。

当前可调用工具没有独立doc原件reader，conversation只给doc引用，不给独立doc全文。独立文档原件、doc创建时间、doc revision均未取得／null；不把注入副本或todo metadata称独立doc原件。`savedplan.md`由原全文施加本轮已成功edit_plan的三个准确替换生成，是已接受编辑的预期修订，展开设计在implementation.md；新doc版本由平台生成，不自编。[末次原卡读回](input/final-platform-readback.json)仍与原saved全文一致，没有返回新修订全文，因此不能称新doc已完整读回；本地副本与预期修订一致，平台final后的独立新doc原件仍未取得，不循环edit自引用。

反馈原文 [input/feedback.md](input/feedback.md) 明确本轮实际写入提交、停confirm，不将“执行时先提交”留到产品回合。UI／新域／外发／凭据连接未扩权。

## 前置及历史限制

#57当前todo done，PR215 merged为Chief已有只读观察；本轮git实读准确main/tree，平台`workflow_runs(runId=38059540722)`实读CI419十job含Required全部success。raw可见结果已保存，未下载CI419 Actions全日志/工件原件，不拿M3目录的CI418 ZIP冒CI419原件。

M3 `product-report`／`review-fixes-report`／`product-pr-ci-report`／`product-ci418-report`及原operation/acceptance/recovery矩阵均按当前main完整blob归档。CI417 TS6059首败、CI418构建exclude增量、CI419后继来源分列；三blocking修复、principal成员／defaultbranch／attempt耗尽／checkpoint限制保留。M0冻结decision与M1原action provenance／wait、M2子session投影／累计限额等一并归档，不修改旧报告。

旧Windows Linux-only单元skip、live MiniMax／retention upgrade／recovery环境skip、真实provider未测及Gitea不支持保持各自旧来源含义，不作为M5通过或必需检查豁免。新组合必须重新运行，精确运行byte与Git对象另外绑定；历史报告引用的每个旧ZIP不是本轮全量下载对象，缺旧原件不伪补。

## 环境和本轮验证边界

本轮重新平台fetch main并读FETCH_HEAD，准确main/parents/tree仍同上，实读记录在input/sync-main-observation.json。本轮起始candidate=32a544fecab58601a1ab9ff3e794896a813b9f22；其全部47规划blob与修改前worktree及commit原byte保全于review-base-manifest.json/input/candidate-before-review.zip，旧报告、首败、运行数量/skip/unknown含义不改。原Git候选可达，归档member逐项再核hash和git对象；没有历史中间worktree原件的缺口不补造。

平台先前修订指针doc:QAcj7PdkfqiTL-yH2pwkf，当前注入saved全文保存input/platform-plan-before-sync.md。本轮todos返回Saved plan尾部明确truncated，只核可见前缀逐字相同，不能为其计算后端全文hash或声称完整读回；工具可见内容/conversation/fetch保存在input/sync-platform-observations.json。savedplan.md由完整注入copy施加input/platform-sync-edits.json两个已接受准确替换生成。本轮独立doc原件、创建/revision、新平台全文读回仍未取得/null；文件指纹只证明对应输入文件byte，不证明独立doc原件。

原卡spec.md、冻结177–201和完整source-snapshot/source-manifest不改。本轮feedback与独审原文另存，review-response记录三blocking待_oY正式复核，不把平台编辑或生产者修订冒已闭合。源码采用当前main精确对象，当前运行byte逐项再读比对；旧Git/LF与Windows worktree/CRLF指纹分列，不借旧绿色。

实际client/runtime/helper命令stdout/stderr在环境ZIP与runtimeZIP，日期／运行时／exit在各JSON；官方来源原HTML包括读取时间、requested/finalURL、hash，不以搜索前缀冒全文。未读取secret值／用户凭据正文，未安装／登录／连接外部账号。现有配置只读metadata由resources保护。

原规划实际回执planning-checks/planning-final-static/planning-commit-verification保留原时点；本轮同步回执采用review-checks及review-static/commit-verification，不覆盖旧回执。未来全部产品／客户端／OS／部署用例未运行；规划candidate不是M5产品候选，旧Required CI不能代本轮PR或产品新head。资源owner、无secret读取、无服务/登录/安装、G1D0C3拒目标保留边界仍按resources。
