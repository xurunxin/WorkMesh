# C2 后端独立交付

当前权威范围是 [完整当前 spec](current-spec.md)，来源是用户本轮正式收窄验收的授权。[Chief 交付的完整旧正文](historical-spec-chief.md) 仅供历史保全，旧视觉要求和旧绿色不代表新后端候选验收。

[保全索引](preservation.json) 记录旧 `5c870d9fe3c30736b8ce87292e1d0bf35838ae83` 与真实 main `c768e1e3db297d8b91b53dd68b60e723a8a40e7d` 的完整字节、SHA-256、八份 UI 工作树/Git 字节和 quota 修复的 first-parent patch。[无损 ZIP](preserved-source.zip) 可恢复延后源码；旧失败、trace ZIP、视觉未验收和清理缺口继续保留于原历史 docs/Git。版本和不可得生成时间保持 null。

[六原测试与九类去向](coverage.json) 登记本轮后端断言及 main 现有消费者兼容。登录 returnTo、焦点/BackForward、401 缓存隔离和新视觉均延后且未接受；本轮检查不计它们通过。候选保留单向低敏 Markdown、真实 Redis 额度/epoch/sentinel、C1 checkpoint/当前授权/fence/unknown、共享 HTTP 消费者和默认关闭配置。

本阶段先提交规格和保全输入，再在同分支恢复 main 的 UI 消费者、保留逐功能后端 hunk、重生锁增量和执行新组合检查。无新迁移、API、事件、Agent 代管权或真实外发。后端成果仍须独审、适用必需检查、最新 PR Required CI、actual main 与 Chief 确认。

<!-- C2-BACKEND-CANDIDATE -->

规格先行与逐功能候选分离已执行；当前真实运行、source/blob/ZIP 证明和待独审/CI/main 门禁见 [完整后端复核入口](review.md)。
