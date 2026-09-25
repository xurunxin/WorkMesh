# Pi Agent Runner 开发与试运行

本服务运行于独立进程或容器；WorkMesh API 保存对话、Turn、权限和公开结果。Pi Runner 从实时 capability manifest 装载受控的 Project、Issue、文档、计划、审批、租约、活动及 Session 完成工具。工具可见性与业务授权均由服务端决定；W11 的完整权限和恢复矩阵仍未验收。

## 接入

1. 在「设置 → Agent 工作台服务接入」登记 LLM 连接、密钥和模型。MiniMax 中国区可使用 `https://api.minimax.cn/v1`、`MiniMax-M3`，协议在连接里明确选择。管理员可在模型目录停用或重新启用模型，刷新后读回状态。API 加密保存密钥；执行 Turn 时，API 只通过受控的 no-store Runner 凭据响应把明文交给精确 Session 的 Runner 进程，Runner 随即在临时进程环境中供 Pi 使用并在结束后清除。密钥不会写入镜像、前端、活动或普通 Session context。
2. 注册专供此 Runner 的 Agent，授予目标 Team 的 `work:read` 和 `work:write`，保存其 installation token。在工作项中由责任人创建该 Agent 的委派 Session。
3. 生成独立的 32 字节以上随机 `WORKMESH_RUNNER_SERVICE_TOKEN`，同时提供给 API 和 Runner；只将该 Agent 的 installation token 提供给 Runner。两种 token 都属于部署秘密，不能放入 Git、镜像构建参数或前端配置。API、Runner 环境变量的同名服务 token 必须一致。
4. 生产构建 `infra/docker/agent-runner.production.Dockerfile`，将精确提交 SHA 传入 `WORKMESH_BUILD_SHA`，镜像引用设为 `WORKMESH_RUNNER_IMAGE`。在 `docker-compose.production.yml` 的 `agent` profile 中启动 `agent-runner`。开发环境可通过 `docker-compose.yml` 的同名 profile 启动。

Runner 的 `WORKMESH_API_URL` 在 Compose 中为 `http://api:3001`，仅 `WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP=1` 且主机名精确为 `api` 时允许明文 HTTP。其他网络地址必须使用 HTTPS 或本机 loopback。容器启动时无数据库、WorkMesh 主密钥、模型密钥与 Human cookie；执行 Turn 时会短暂持有该 Turn 的模型凭据。

Runner 镜像内嵌 `workmesh-workbench` 0.1.0 Skill。`pnpm check:runner-skill` 校验本地精确 SHA；Runner 每次建 Pi 会话前验证镜像文件，禁用宿主扩展、其他 Skills、prompt templates、themes 与 context files，只注入这一份 Skill。该 pin 是镜像内的完整性检查，公开签名 Skill 1.1.0 与既有 Connection pin 保持不变。W12 的公开签名新版与 Session 持久 pin 仍未交付。

Runner 每次发现自己的 queued Session 后，经现有 Agent API 完成 ACK、revisioned `executing` 转换并定期 heartbeat。Human 在工作台创建绑定该 Session 的对话并发送 Turn 后，Runner 按顺序领取、获取模型凭据、运行 Pi 并结算公开答复。停止先在 API 废除当前 Attempt 的写栅栏；随后 Runner 观察状态并 abort 模型。

## 试运行验证

- `pnpm --filter @workmesh/agent-runner typecheck`、`pnpm --filter @workmesh/agent-runner test`、`pnpm check:runner-skill` 校验模型映射、资源隔离和固定 Skill。
- 使用隔离的测试数据库、Redis 与 `RUN_INTEGRATION=1` 运行 `apps/api/integration/workbench-runner.integration.test.ts`。`RUN_WORKBENCH_LIVE=1` 且本地存在 `MINIMAX_CN_API_KEY` 时，该文件还会通过真实 MiniMax-M3 执行一个只读工具调用与持久结果回写。测试子进程不会继承该模型密钥、数据库 URL、主密钥或 bootstrap token。
- 运行中的工作台订阅持久事件游标并从服务端分页快照恢复对话，约每 3 秒再次刷新当前对话；运行时失败显示稳定错误码及重试入口。

## 当前恢复边界

Runner 崩溃并使 Session 失去权威，或 Attempt 超过五分钟未结算时，Worker 将 `dispatching` / `running` Attempt 与 Turn 标记为 failed，并在同一事务中记录事件和 outbox。`external_effects_reconciled=false` 保留未知副作用，旧 fence 被拒绝，不自动重做。操作员应核对外部效果，再由 Human 发送新 Turn。尚未提供外部效果对账、租约恢复与预算执行，因此此服务目前只适合受控试运行，不能按本路线图 W18 切换生产旧 UI。
