# 当前静态核验与独审门禁

本轮只同步完整受控文档与两个Proposed ADR，未改产品。准确提交head最终回复给出，不写入自身文件。不代表平台另一Agent或Chief确认，本轮hash/prompt FK两合同项待其完整定向复审；原来源方案层面已闭、等待恢复路径已明确。

## 实际核验与历史

当前回执 [static-checks.json](static-checks.json)；命令 python docs/plan/agent-mcp-m1/static-check.py --staged --record（另行准备全文绑定）。逐项重读217个完整Git成员、commit/父/tree、冻结M1完整节、Spec/plan两对一致、平台prefix/null、42已有operation合同参数/响应/源码锚点+1新增提案，并从精确源码规则核hash格式/完整比较与prompt实际列、新unique/FK顺序；旧错误CHECK/FK及strip/去unique/id-only实际变异拒绝、九类适用性、来源/等待迁移提案、69和004554两个历史ZIP成员、相对链接、空白、docs-only和真实CI分类。提交后只读--commit HEAD核受测与blob一致。

旧static首败/链接失败及gPL工具原返回保留，原旧checks在 [history索引](history/candidate-69-manifest.json)。旧首败是可读Spec末尾分隔LF，旧链接失败是报告尚未生成并有工具显示截断缺口；其结果不用于新合同通过。本轮首败已完整保存static-failure-current.json：新增Runner assignment合同没有parameters字段，检查器错误地按必有字段索引；改为准确缺省空列表后重新核验，不改源合同。后续失败另编号保全，修正后独立保存成功回执，不清首败。

静态看SQL只能校验文字/结构来源，不算执行迁移或竞态安全验收。所有产品服务/DB迁移/本机产品checks/真实Pi与Stop测试/最新PR RequiredCI未运行，平台独审未闭合，Chief confirm未收到。JSON/ZIP/脚本使实际分类full，不修改属性或门禁。

## 平台另一 Agent 仅两合同项定向审查

当前独审完整原文在review-feedback-contracts.md。原来源方案层面已闭、自动等待续接路径已明确，不无变化重开；保留其合同、DoD及回归场景。

- 批准hash：DTO/Zod/DDL/Worker和实际consume全部保现行sha256:<64位小写hex>完整字符串，真实正例直接用requestApproval返回hash；禁止裸hex/strip，格式合法但错误hash亦拒。
- prompt FK：主线表无workspace_id；新迁移先建UNIQUE(session_id,id)，再用(agent_session_id,trigger_prompt_id)→agent_session_prompts(session_id,id) ON DELETE RESTRICT；workspace仍锁内单独授权，升级/clean、准确/错误Session、旧行/重复/事务回滚正拒具体化。

check-wait-contract-source.py读精确Git全文提取canonical prefix、Zod regex、完整比较谓词、prompt列/主键，匹配提案和真实变异反例。其Python regex/元组关系不是执行Zod/SQL/FK、Worker权限或实际requestApproval测试；未来产品测试未运行，不能凭静态标通过。

## 资源与停止位置

仅只读git、Python文档生成/检查、Node分类等短进程，无容器/镜像/卷/网络/监听服务/长期进程。本目录/history及ADR是交付资料保留；无删除、prune、权限/属性调整、旧worktree或已拒目标操作。

提交完整文件→停confirm供平台AI审核定向hash/prompt FK两合同项→blocking/high闭合→Chief confirm产品实施。产品之后还需完整适用checks、独立成果审查、最新PR RequiredCI、actualdone/main；文档提交或合入不验收本卡。

本轮首次新语义核验失败完整保存在static-failure-current-2.json：末项用文档一句话作精确匹配（“以/仍核”和“授权限/授权限”不一致），此前源hash/FK与所有变异已实际通过。移除该脆弱措辞断言，改核实际源agent_sessions复合unique、guard按actor workspace限定Session及独立授权合同后重新运行；不改旧失败回执。另static-patch-failure-current.json保存文档补丁未应用的工具失败摘要，未虚构shell退出码。
