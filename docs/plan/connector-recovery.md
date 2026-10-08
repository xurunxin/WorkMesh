## 上下文

服务端已有 `authIdempotentTransaction` 加密重放及到期擦除，缺口在客户端丢失请求身份和过早提交配置。本次新增 `apps/connector`，按“持久化请求身份 → 完整协议验证 → 秘密存储与配置提交”执行，保留现有重放窗口、凭据生命周期和新 key 拒绝规则。

执行前复读最新 `main`、本卡依赖及冻结规格，记录差异。内部保留持久化与协议验证两个检查点，作为同一纵向交付验收；继续使用 Todos＋仓库记录，完成后交独立复核与 Chief 确认。

## 已确定的约定

- 管理员提供无秘密的本地 JSON 预期清单；完整 `wmp_` 配对码通过隐藏输入或扫码设备输入的原始文本读取，不接收 URL fragment、命令行秘密参数。
- 默认配置目录位于当前用户的系统配置目录。正式配置、Skill 和提交记录均由连接器管理；客户端配置输出沿用现有环境变量引用格式，由启动入口读取秘密并注入子进程。
- 系统秘密存储不可用或锁定时明确失败。发布、无源码设备安装、网页清单生成、Enrollment 恢复及服务端错误元数据扩展不在本卡范围。

## 文件改动与恢复规则

- **`apps/connector/package.json`、`tsconfig.json`、`tsconfig.build.json`、`pnpm-lock.yaml`**：建立 `@workmesh/connector` workspace，提供构建、静态检查、单元测试、平台测试及 CLI 脚本。复用仓库已采用的 MCP SDK 和 `@workmesh/contracts`；新增并锁定 `@napi-rs/keyring`、`koffi`。

- **`apps/connector/src/config.ts`**：定义严格 Zod 清单、pending、提交记录和正式配置。清单明确绑定部署、MCP/Skill URL、Connection、Agent、Team、principal、client、profile、Skill pin 和能力集合；正式配置仅保存秘密引用、已验证的非秘密事实及完成记录。重试必须匹配原清单和请求，不能覆盖未决身份。

- **`apps/connector/src/platform-security.ts`**：通过 Koffi 调用 POSIX `flock` 和 Windows `LockFileEx`，锁定固定文件并覆盖恢复、身份建立、验证和提交全过程；锁文件不删除，句柄不继承给子进程。进程死亡后由系统释放锁，等待者重新读取状态。[Windows 锁语义](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex)

  POSIX 目录使用并验证 `0700`、敏感文件使用并验证 `0600`；Windows 在写入敏感字节前设置当前用户 SID 为所有者、禁用继承且仅保留该 SID 的允许权限，再读取实际安全描述符验证。拒绝不安全权限、符号链接及重解析点。

- **`apps/connector/src/pending.ts`**：在首次网络请求前，独占生成随机 Idempotency-Key，保存完整配对码所在的精确请求字符串、目标、origin 和 user-agent。临时文件采用同等保护，写入并同步后同目录原子替换；所有重试直接使用保存的字符串和上下文。

  断网、丢响应或崩溃保留 pending；损坏记录拒绝自动重建身份。未完成临时文件只在持锁且确认未发送时清理。pending 不保存兑换响应或安装令牌。

- **`apps/connector/src/protocol.ts`**：复用 `agentWellKnownResponseSchema`、`agentConnectionRedeemResponseSchema`、`agentConnectionCurrentIdentitySchema`，验证 discovery 与清单一致；兑换后立即核对令牌指纹。下载 Skill 原始字节，拒绝非规范 UTF-8/LF，计算 SHA-256 并验证 Ed25519 签名，不先做文本归一化。

  使用 MCP SDK 执行 `initialize → verify_connection → get_workmesh_context`，逐项对照清单、兑换结果和实时响应中的身份、profile、Skill、能力集合及 Coordination Session。必须确认 `authenticated_credential` 为当前 active 凭据且指纹匹配；撤销、过期和 overlap 均禁止提交。只访问清单批准的端点，拒绝重定向，安装令牌仅发送到批准的 MCP URL。

- **`apps/connector/assets/workmesh-public-key.pem`**：携带与 `skills/workmesh/public-key.pem` 一致的可信公钥，并用测试约束二者一致；不从兑换响应取得信任根，不需要签名私钥。

- **`apps/connector/src/secret-store.ts`**：封装新增、读取、读回验证和删除。使用 Windows Credential Manager、macOS Keychain、Linux Secret Service；Linux 显式设置 `store: 'secret-service'`，禁用默认 keyutils 回退。[上游后端选择接口](https://github.com/Brooooooklyn/keyring-node#linux-backend-selection)

  每次提交使用独有秘密引用，不覆盖旧秘密；后端异常转为无秘密错误，不输出原始异常对象或令牌。

- **`apps/connector/src/commit.ts`**：全部验证成功后才进入提交。先持久化受保护的提交记录，包含旧配置原字节、新配置摘要、独有秘密引用和阶段；然后新增秘密并读回核对、暂存已验证 Skill、最后原子替换正式配置。所有暂存内容在替换前完成同步，POSIX 同步目录，Windows 使用对应原生替换与刷新机制。

  配置替换是提交点：替换前失败或重启时保留旧配置，删除本次新增秘密与暂存文件；替换后崩溃依据新配置摘要完成收尾，保留其秘密引用。补偿删除失败则保留记录并阻止新提交，绝不删除旧引用。完整提交后清理 pending；完成记录只含配对码摘要等非秘密元数据，使并发等待者和成功后同码重跑识别已提交操作，重新验证当前身份后幂等返回。

- **`apps/connector/src/connect.ts`**：串联上述步骤并提供可注入的依赖接口。输出安全的重放截止信息、错误码和恢复指引；窗口外或密文擦除后不得换 key 重试旧配对码。明确放弃 pending 的操作先完成补偿，再清理请求身份。

- **`apps/connector/src/cli.ts`**：提供 `connect --expect <file>` 和 `run -- <client-command>`。`connect` 自动完成全部校验和提交，输出可粘贴的无秘密客户端片段；模板格式对照 `apps/web/app/lib/mcp-onboarding.ts` 的 `mcpClientFacts`。`run` 从秘密存储读取令牌，仅注入子进程的 `WORKMESH_INSTALLATION_TOKEN`，处理退出码和停止信号。

- **`apps/connector/src/connect.test.ts`**：覆盖完整流程、逐字段拒绝、秘密边界和故障恢复。使用真实子进程竞争与强制终止，检查网络捕获中的 key/body/context 始终一致；验证各提交阶段崩溃、秘密写入/读回/删除失败、配置替换失败及旧配置原字节完整性。断言失败也不得打印秘密值。

- **`apps/connector/integration/native-storage.test.ts`、`vitest.platform.config.ts`**：在三种系统上实测秘密存储写入、跨进程读取、删除及不可用拒绝；实测权限、锁释放和替换恢复。Windows 读取实际 ACL，并使用不同用户身份验证读取被拒绝；POSIX 验证权限及不同用户读取失败。平台测试不以缺后端为由跳过。

- **`apps/api/integration/stage5-agent-connections.integration.test.ts`、`apps/api/package.json`**：增加连接器测试依赖，复用现有 `buildApp`、`createWorkMeshMcpHttpServer` 和数据库夹具，调用真实连接器完成黄金路径。保留既有重放同体断言，补齐服务端重启、响应丢失、同 key 异体、陌生 claimant、新 key 拒绝、窗口外/擦除、撤销/过期/overlap 及事务回滚测试；服务端运行时不增加表、列或生命周期逻辑。

- **`.github/workflows/ci.yml`、`scripts/ci-policy.mjs`、`scripts/ci-policy.test.mjs`、`scripts/validate-ci.mjs`**：将连接器平台测试矩阵接入现有 Required CI 汇总，准备实际系统秘密存储夹具；失败、取消或意外跳过均不得放行。为 API 夹具新增导入同步更新 **`scripts/ci-test-inputs.mjs`、`turbo.json`** 的外部输入声明。

- **`AGENT_PROTOCOL.md`、`OPENAPI.yaml`**：修正恢复说明，明确请求身份绑定、现有重放窗口和完整验证后的本地提交顺序；不改变请求 DTO、端点、事件或数据库契约。

- **`docs/adr/0079-connector-local-security-and-commit.md`、`docs/plan/connector-recovery.md`、`docs/reviews/b1-b2/`**：记录原生依赖、权限边界、秘密存储、提交点和恢复状态机；保存本计划、无秘密清单样例、逐项测试映射与执行证据。映射覆盖冻结清单的全部原测试、九类适用性及 DoD，保留历史 R1 快照；本批 Todos 控制面例外明确落盘。

## 验证

- 运行 `pnpm --filter @workmesh/connector test`、`pnpm --filter @workmesh/connector build`，在 Windows、macOS、Linux 上运行 `pnpm --filter @workmesh/connector test:platform`；记录实际数量、退出码、ACL 和后端结果。
- 在专用测试数据库及完整 PostgreSQL、Redis、S3、bootstrap 和加密密钥夹具下，执行 `pnpm --filter @workmesh/api exec vitest run --config ../../vitest.integration.config.ts integration/stage5-agent-connections.integration.test.ts`。
- 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`；集成测试结束后再启动 E2E。运行 `pnpm ci:validate`、`pnpm check:route-policy`、`pnpm check:workmesh-skill` 和 `git diff --check`。
- 演示管理员提供清单与完整配对码后，单次 `connect` 完成全部验证；中断后重跑复用身份；启动入口通过秘密引用工作。扫描 stdout、stderr、配置和拟提交证据，确认无明文令牌及配对码，数据库迁移差异为空。全部适用检查成功、证据入库并完成独立复核后，才提交 Chief 确认。
