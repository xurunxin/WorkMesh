# 当前静态核验与独审门禁

本轮只同步完整受控文档与两个Proposed ADR，未改产品。准确提交head最终回复给出，不写入自身文件。不代表平台另一Agent或Chief确认，两项blocking仍待其完整定向复审。

## 实际核验与历史

当前回执 [static-checks.json](static-checks.json)；命令 python docs/plan/agent-mcp-m1/static-check.py --staged --record（另行准备全文绑定）。逐项重读217个完整Git成员、commit/父/tree、冻结M1完整节、Spec/plan两对一致、平台prefix/null、42已有operation合同参数/响应/源码锚点+1新增提案、九类适用性、来源/等待迁移提案、历史ZIP成员、相对链接、空白、docs-only和真实CI分类。提交后只读--commit HEAD核受测与blob一致。

旧static首败/链接失败及gPL工具原返回保留，原旧checks在 [history索引](history/candidate-69-manifest.json)。旧首败是可读Spec末尾分隔LF，旧链接失败是报告尚未生成并有工具显示截断缺口；其结果不用于新合同通过。本轮首败已完整保存static-failure-current.json：新增Runner assignment合同没有parameters字段，检查器错误地按必有字段索引；改为准确缺省空列表后重新核验，不改源合同。后续失败另编号保全，修正后独立保存成功回执，不清首败。

静态看SQL只能校验文字/结构来源，不算执行迁移或竞态安全验收。所有产品服务/DB迁移/本机产品checks/真实Pi与Stop测试/最新PR RequiredCI未运行，平台独审未闭合，Chief confirm未收到。JSON/ZIP/脚本使实际分类full，不修改属性或门禁。

## 平台另一 Agent 定向审查

- blocking归属：实际提交actor/E Token/安装/Connection来源是否唯一、同原事务保存、两种expired key reset、凭据删除保留证据、旧null/unproven failclosed，双C先refresh和双nativeinstall反例；没有任意历史Token证明或query补写。
- blocking等待：WAIT_REQUESTED→模型与在途静止→释放本人Lease→公开等待settle完整原子事务；精准批准/输入条件、Worker锁序/唯一消费/续Turn、claim/credential/start fresh校验，paused不自动解除、Stop/撤权先提交零续接。
- Proposed ADR0080/0081、具体DTO/policy与DDL结构/约束/FK/NULL语义/旧夹具及滚动兼容，默认opt-in关闭和内部启动门禁，旧settle/Pi内部completion无独receipt不假認。
- 完整M1具名SDK/MCP/Runner/manifest/REST/Zod一致，普通terminal E和Human控制不放宽、确认零业务写与拒绝审计例外、Stop原E/独立finally signal/稳定key/body/失败残留。
- 九类真实正拒、并发/失响应/重启、source/runtime字节和准备/清理/RequiredCI入口具体，静态结果不冒产品完成。

## 资源与停止位置

仅只读git、Python文档生成/检查、Node分类等短进程，无容器/镜像/卷/网络/监听服务/长期进程。本目录/history及ADR是交付资料保留；无删除、prune、权限/属性调整、旧worktree或已拒目标操作。

提交完整文件→停confirm供平台AI审核定向两block→blocking/high闭合→Chief confirm产品实施。产品之后还需完整适用checks、独立成果审查、最新PR RequiredCI、actualdone/main；文档提交或合入不验收本卡。
