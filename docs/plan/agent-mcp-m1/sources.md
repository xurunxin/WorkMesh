# 本轮来源、历史与字节绑定

## 当前真实主线与冻结输入

main-observation-current.json保存本轮平台git ls-remote origin refs/heads/main完整返回，精确SHA e49eda142d61bdd248ddc42ec16f5563abd4bbc6；读取不可变Git对象，不依赖共享FETCH_HEAD/构建HEAD。source-manifest.json核commit原对象、父69085317c88d84b702af727dc0ac7152589626d8与883d279d3b5978680672a6c1d7364d421d0afd10、同tree；本轮main等M0实际merge，不声称有新main产品差异。

冻结#53来源c768e1e3db297d8b91b53dd68b60e723a8a40e7d的整组priority文件与当前main同组全文独立归档；完整M1节原提取字节和可读末尾LF规范化分列。不以行定位代正文。M0合同/映射/产品报告/恢复报告/CI407及证据全文作为已落输入；旧ZIP缺原件等历史缺口保持，不拿旧checks验本轮。

本轮source-snapshot.zip保存217个全文Git成员：authority文档、全部现行ADR、完整OPENAPI与schema/旧迁移、API/SDK/MCP/Runner、Worker等待协调实际入口、Pi contracts、DBmanifest/生成器/集成、CI/conformance/M0完整来源。成员清单而非工具显示前缀绑定每项head/path/gitBlobOid/bytes/SHA-256；本轮工作树原字节另列。capture-sources.py只归档，不运行服务。

## 平台注入与工具返回

当前planDocId UlypOW9r_NCpezuKHk6KQ从本轮用户提供的完整saved copy绑定；savedplan.md和implementation.md原文逐字节一致。platform-observation-current.json保留本轮完整可见工具返回，其中Spec段在Saved plan分隔前完整，plan被工具明确truncated，visiblePrefix只做前缀比对；version/planCreatedAt没有返回记null，completePlanReadback=false。不可把工具前缀、工具显示截断、当前完整注入或元数据null混为一谈，不通过edit_plan自引用循环造全文。

current-spec.md/spec.md来自本轮完整Spec工具段，steering保本轮明确授权、独审阻塞与用户所选等待；plan-fulltext-binding.json记录各原字节指纹与来源类型。这里只做末尾一个LF可读规范化，不修改原toolreturn。

## 旧候选原件

history/candidate-69.zip逐文件保存旧候选69f84207b6cc85a46609bdb781ecb377f4e0d743的27个Git blob及本轮修改前工作树，history/candidate-69-manifest.json逐member独立指纹/旧GitOID。包括旧gPL完整文档、旧source ZIP、旧错误归属、旧静态回执和首败/链接失败。ZIP是二进制容器，独立比字节，不套UTF-8或CRLF说明。旧根static-first-failure.json/static-link-failure.json/platform-observation.json不改，旧checks原件已在ZIP；当前static-checks覆盖为新实际核验，与历史明确分开。

本轮探索曾读取两个不存在的猜测迁移文件，实际退出1；随后rg --files定位0010_workbench_conversations.sql/0012_workbench_turn_lineage_and_tools.sql并读取成功，正文已按真实源校正，见[探索失败原回执](exploration-failures.json)。这是静态探索错误，不是SQL/产品测试失败或虚构原件。

## 实施源码依据

源录中guard.locateAgentSessionAuthority以trusted actor credentialHash定位；agentMutate/generic mutate reserve及expired key reset；refreshAgentToken能删旧Token且允许不同安装同目标；connection-installation-token创建镜像不记origin；finishSessionInTransaction内层无独回执。runPi非executingabort/RUNNER_ABORTED跳settle；workbench-runner list/claim/credential/start/settle实际fence、Conversation/Turn/Attempt锁；worker.reconcileWorkbenchAttempts只调和旧活动Attempt，不消费新wait。这些事实分别进入安全/迁移/等待/生命周期/逐operation文件，没有把拟新增helper当已实现。

静态受测工作树、暂存blob和最终commit blob分别登记，Windows可存在CRLF差异。静态回执不hash自身，提交后只读核回执blob与受测文件对应，head只在最终回复登记，不循环提交自身head。
