# 消费者兼容与当前依据

| 消费者 | 保持与增量 | 实际源码依据／未来验证 |
| --- | --- | --- |
| REST/Zod | 新 getProviderAction；原 POST response 不破坏旧字段；严格新输出不套 raw result；repoIds additive | OPENAPI、contracts/index、child-session-contracts；六 kind 与五 status 正反矩阵 |
| 原计划来源 | input 中原注入全文保持；savedplan=implementation为当前修订 | 原 doc 独立全文不可取得；todos Saved plan 截断，conversation仅doc引用；不声称后端全文回读 |
| review old input | 省略 repositoryIds 原三项能力与scope；显式 1..100 唯一UUID，仅增加repo:read | collaboration:createReview、M2 security-contract；省略/显式/空/重复/超额/缺三方能力 |
| parent/shared context | 支持WI/Project共享，同context；父Session专有拒绝 | delivery:applicableAgentRepositoryContexts 的实际SQL与子INSERT project_id空；不得冒天然兼容 |
| SDK | 原名和显式泛型保留；新增typed读取默认验证schema | SDK index.ts；旧未知额外响应字段不被新执行schema剥离 |
| MCP C/E | E自身；C显式target E局部bridge；安装identity不新增action GET | M0 binding + discovery + HTTP每请求独立client；并发不串身份，readonly缓存写拒 |
| discovery | M3受控增量合成；M0/M1/M2历史不改 | generate-agent-discovery.py；规则、binding、Runner逐操作一致，不以数量验收 |
| Runner | 当前E固定identity、全结构化错误与完整关键结果；GET不普通Activity | workmesh-tools:makeTool/operationKey/boundedResult；模型实收逐值校验；不假设现50k摘要能满足review |
| artifact transfer | SDK/MCP原签名响应兼容；Pi受控传输不暴露签名到模型/活动 | artifact-storage:createUploadUrl、ADR0070；RustFS实际headers/checksum与拒redirect |
| lists | listRepositories/listArtifacts沿签名cursor；listWorkItemArtifacts原数组；delivery默认bounded envelope保留 | pagination.ts与各routes；>一页且late授权变化，不将200上限冒全集 |
| delivery targeted | additive pullRequestId过滤；当前head完整checks/reviews/findings/approval；取数前scope过滤 | 当前getProjectDelivery多表LIMIT 200；精确模式不能悄删阻断项，>200 findings反例 |
| upload cancel | Idempotency-Key，无If-Match；finalize expiry committed错误沿原合同 | OPENAPI cancelArtifactUpload参数、delivery cancel/finalize函数；不是用户新增裁定 |
| health | get分页；source=agent草拟；批准后publish仍精确hash/sources/If-Match | operations/routes.ts:project.health.publish、projectHealthInputSchema；不是Human-only update发布 |
| H保留 | connect/pin、Approval决定、publishProjectUpdate、completion裁决 | route-policy与handler双层；缓存调用显式拒，无Human cookie注入 |
| Worker/provider | GET只读已有结果与references；保checkpoint/finish/claim/发送前重验 | provider-actions.ts；零迁移是本规划选择，未运行M3竞争/恢复测试 |
| external outcome | action终态与Session终态分开；unknown无新POST/自动重发 | DB仅五status；M1 complete/stopAck与Pi settle保持原入口 |
| CI | 新real suite include/unit exclude/逐suite删除负例 | conformance/vitest.integration.config、ci-policy(.test)、ci.yml Required API既有步骤；docs JSON/Python不冒prose |
| 公共发行／OS | 本批不测试公共签名发行与三OS，不更改#5原门禁 | 不新增前置、不冒支持；加入场景前消费其新已验收来源 |
