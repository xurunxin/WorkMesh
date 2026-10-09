# 真实MCP套件的必需CI接线

本文件为产品实施后的确定接线，当前不修改CI、不启动服务。现行来源：.github/workflows/ci.yml的api-integration job、scripts/ci-policy.mjs的classifyChanges/evaluateResults、scripts/validate-ci.mjs的jobSections与根脚本断言。agent-smoke现有conformance CLI使用reference-fixture内存driver，保留但不能替代真实链。

## 必需入口与选择

根package.json新增test:conformance:integration：
node scripts/require-integration-env.mjs && pnpm --filter @workmesh/db test:reset && pnpm --filter @workmesh/conformance test:integration

根test:integration依次执行db、api、test:conformance:integration、worker、recovery。包conformance的test:integration为vitest run --config vitest.integration.config.ts；新配置仅include src/mcp-coverage.conformance.test.ts，passWithNoTests=false，forks、maxWorkers=1、fileParallelism=false。普通vitest配置exclude该文件，避免单元运行偷跑真实服务。conformance rootDir=src，fixture放src，不跨包直接import API/Runner源码；通过子进程实际入口启动。包新增官方MCP Client和pg/@types/pg测试依赖，沿现行MCP/API包使用的版本并同步锁文件；数据库事实断言和失败注入仅对专属test库。

CI在现有api-integration job的Run API integration步骤之后新增Run real MCP coverage，运行：
set -o pipefail
pnpm test:conformance:integration 2>&1 | tee ci-logs/mcp-coverage/execution.log

ci-logs/mcp-coverage预先创建；不设置continue-on-error、不用环境缺失skip。套件零测试、fixture缺失、ready超时或进程异常均非零退出，进入api-integration失败，再由既有required-ci/evaluateResults阻断。前置API集成失败时新步骤不会被冒作通过。

classifyChanges把mcp、agent-sdk、agent-runner、conformance加入api-integration选择集，保留api、worker和full规则。contracts沿依赖传播影响这些包；脚本或workflow改动仍沿现行full。ci-policy.test.mjs分别验证四包的单文件变动会必选job，以及选中job失败、取消、意外skip均不能被Required CI接纳。

validate-ci.mjs同步根脚本精确断言，核包脚本→配置→准确include→非空要求，以及workflow步骤位于API集成之后、pipefail、无continue-on-error和证据目录上传。防漏接验证在本任务隔离副本分别删除workflow调用、移除根串接、清空include或令fixture失败，validator或真实命令必须非零；不在主工作树篡改门禁。

## 服务准备与隔离

复用api-integration现有Postgres、Redis、固定RustFS及bucket准备。它已设置RUN_INTEGRATION、含test数据库、随机bootstrap派生、SESSION_SECRET、32字节主密钥、Runner service token和S3配置。串行结束原API测试，再reset该job专属test库；本机运行使用本任务专属test库，绝不reset共享或生产数据库。fixture先用真实连接确认DB迁移/reset已完成、Redis可用、HeadBucket成功；不能把端口存在当ready。

fixture登记run ID、数据库、S3前缀、所有子进程PID/入口/端口及状态目录。动态分配且绑定loopback端口；启动API实际server监听入口时NODE_ENV=development，单元仍test；启动只读和读写MCP两服务。HTTP等待API/MCP readyz，stdio通过真实initialize响应判就绪，fake模型健康检查后才启动Pi Runner。Secret只进子进程环境/fixture内存，准备Human cookie不进入Agent/MCP/Pi。

模型夹具使用configuredModels读取的credential.baseUrl/apiType；创建真实workbench model connection/conversation/Turn及其E Session，预先ACK到executing，设置WORKMESH_AGENT_SESSION_ID、WORKMESH_AGENT_INSTALLATION_TOKEN、WORKMESH_API_URL与WORKMESH_RUNNER_SERVICE_TOKEN后，以pnpm --filter @workmesh/agent-runner run:session --once启动真正Pi。fake服务响应有效流式tool-call并记录模型请求tools；不得只调用createWorkMeshTools替代Pi。Runner当前捕获session失败后也可exit=0，套件必须同时断言模型请求非零、实际tool结果、Turn已settled及public answer，出现session_failed/turn失败或无模型请求即测试失败，不能只用进程退出码计通过。真实fixture从预授权、配对兑换到Connection取证，使用真实REST进行准备，所有外部URL为本机fake provider，不真实外发。

## 执行、失败与证据

真实套件创建官方MCP Client的HTTP/stdio连接；资源客户端测试initialize、tools/resources/templates list及readResource；仅tool客户端不使用readResource。C同身份两个mode、直接E及安装/目标bridge分别测试；Pi独立E Session只收到实际具资格工具。错误、Token目标、数据库事实、幂等receipt/event/outbox、durable cursor和重启后恢复按verification映射断言。

fixture在finally保全脱敏stdout/stderr、JSON/JUnit/transcript、模型实收tools schema、请求/错误及数据库事实摘要，记录runtime、skip、首败、准确源码head/blob与工作树换行。执行日志和各组件日志落入ci-logs/mcp-coverage/；原api-integration的always Upload raw API logs覆盖ci-logs，if-no-files-found=error，沿现有artifact名称与保留策略。失败日志不能被后续成功覆盖。

服务启动/运行/清理失败均保留原首败；仅终止登记且仍匹配的己有子进程、清闲置专属状态目录/S3前缀，不停止job提供的共享服务，不global prune。CI服务生命周期沿job结束回收；本机精确清理按spec，已拒目标不重试或绕行。artifact存在只证明文件上传；RequiredCI验收另核该命令真实运行、测试数非零和全部适用用例，无产品证据预填。
