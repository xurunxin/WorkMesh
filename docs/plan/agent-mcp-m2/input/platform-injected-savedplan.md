## 上下文与假设

完成冻结 M2 节的规划、文档、评论读取、Decision 提案、Room／Inbox、Handoff，以及普通 child／独立 reviewer 闭环。复用 `finishSessionInTransaction` 的 required-child 阻断和 reviewer 双证据门禁，承接 M1 的生命周期、等待续接、Stop 清理与原动作确认。

假设：目标 Agent ID 由 Human 或已授权清单提供；沿现有角色、feature、scope 和消费者合同补齐。reviewer 保留现有输入及继承预算，不增加 `budget` 参数。仅用 Todos＋仓库记录。UI 重设计、F／TA 新域、公共发布、真实外发及 Human 权限扩张不在范围内。

## 受控方案与审查关口

- **`docs/plan/agent-mcp-m2/`**：建立 README、完整 spec、冻结 M2 原文、内容一致的 savedplan／implementation、安全合同、消费者兼容表、operation-decisions、九类 DoD、运行方案和来源索引。完整保存原路线七份文件、M1 交付报告及相关源码快照，分别绑定准确 commit／blob、工作树 bytes／SHA-256；不从截断工具输出重建全文，不改写 M0／M1 历史。逐操作列出 REST／Zod、SDK、policy／feature、MCP binding、manifest、Runner、角色／状态／scope、参数、输出和测试入口。
- **`docs/adr/0082-parent-child-status-projection.md`、`AGENT_PROTOCOL.md`**：冻结父子只读投影、reviewer 限额／预算及兼容语义。先提交方案包和 Proposed ADR，核全文、链接、空白与实际 CI 分类，报告准确 head 和文件入口，停 confirm。由平台另一 Agent 按既有模型／high 委托独审，blocking／high 闭合且 Chief confirm 后才实施产品。

## 产品变更

- **`OPENAPI.yaml`、`packages/contracts/src/child-session-contracts.ts`、`index.ts`、`route-policy.ts`**：统一两种创建的共享输入／typed 输出及本批协作 DTO；新增 `GET /api/v1/agent-sessions/{id}/children`，`operationId=listAgentSessionChildren`。支持 `childSessionId` 精确过滤和签名分页，返回 child ID、父 ID、required、state／revision、原 Plan/version/stable step 绑定及经授权过滤的结果 Artifact ID。保留创建接口无 `If-Match`、现有 revisioned 写入规则及原消费者字段。
- **`apps/api/src/agent/child-session-status.ts`、`agent/routes.ts`**：实现并注册投影，复用 `liveSessionReadPredicate` 和 `Paginator`，在返回数据的查询中重验准确父 E 凭据、Delegation、principal、Team grant、资源及父子创建绑定。只读直接子 Session，包含旧 Plan 绑定和子终态；父终态、撤权、错父／Team／child 拒绝。查询不创建业务事实，不返回 token、prompt 或其他子资源内容。
- **`apps/api/src/agent/child-session-policy.ts`、`collaboration/routes.ts`**：从 `createChild` 提取共享准入，供 `createReview` 复用；沿 `lockCollaborationSessionTargets` 的既有锁序校验当前 Plan、稳定 step、父／step 活跃限额、三方能力、目标并发和累计 reservation。step 限额按稳定 ID 跨 Plan 版本统计。reviewer 按继承预算全额 reservation，余额不足返回明确拒绝；不自动释放既有 reservation。Session、Delegation、reservation、review_shared Lease、prompt、交付和 event／outbox 同事务提交，继续由 `provisionNewSessionDelivery` 受控启动。使用现有表，无新增迁移或事件类型。
- **`packages/agent-sdk/src/index.ts`**：补 typed 评论读取、Decision 提案／读取、Handoff 列表、Document export、Guidance 读取及父子投影，完善规划分页。复用 `pagedPath`，按各现有接口原样传递 cursor；Document 现有 UUID／revision-number cursor 保持兼容。M2 可重复协作写和两种创建在缺省 key 时每次新调用生成新身份，单次网络重试保持同 key／body，显式 key 原样保留，避免同 step 多次合法意图被旧 key 吞掉。
- **`apps/mcp/src/index.ts`、`coordination-product.ts`**：补同一具名工具及完整分页，沿现有结构化成功／错误封装、直接 E 和单请求目标 bridge。导入恢复保留逐实体 mapping／key、部分成功及过期对账语义，并列出复合工具全部命令的权限；不宣称整项目原子。保留旧工具名称和输入兼容，read-only 模式隐藏写工具，缓存越权调用仍结构化拒绝。
- **`apps/agent-runner/src/workmesh-tools.ts`**：补规划筛选及 `parentId`／`milestoneId`、分页、文档 history／revision／diff／restore／export、Guidance、评论读取、允许的 Decision、Room／Inbox／Handoff 和两种 child 创建。父身份固定为 `api.sessionId`；按角色和实时 manifest 提供工具，reviewer Artifact 仅允许 `code_review`，加入本人 Room `review_result`，过滤 `publish_plan`。普通 child 保持实际有限能力；沿 `makeTool` 的幂等和审计包装，验证现有 `run-session.ts` 不自动发布 Plan，completion／Stop 继续走 M1。
- **`scripts/generate-agent-discovery.py`**：将 M2 决策作为受控增量合成当前规则，保留 M0／M1 冻结输入；同步生成 route-policy、MCP binding、derived manifest 及文档矩阵。每项资格谓词绑定允许正例和拒绝反例，manifest 不替代领域授权。
- **`apps/agent-runner/skills/workmesh-workbench/SKILL.md`、`src/workbench-skill-manifest.ts`、`docs/agent-integration.md`**：同步工具顺序、角色前提、分页、冲突恢复和父子完成流程，重新生成内嵌 Skill pin；公共签名 Skill 保持既有发行流程。
- **相关现有测试及 `packages/conformance/src/planning-collaboration.{fixture.ts,conformance.test.ts}`**：扩展 stage2、documents、agent-lock-order、SDK／MCP／Runner 测试；复用真实 MCP 夹具、配对、HTTPS 假模型和实际 Pi 子进程建立 M2 链。同步 **`packages/conformance/vitest.integration.config.ts`、根 `vitest.config.ts`、`scripts/ci-policy.mjs`／`.test.mjs`** 的真实套件 include、单元 exclude、必含检查及逐套件删除负例；必要位置变化由原生成器更新 `packages/db/src/agent-lock-order-manifest.ts`，随后无更新开关复验。

## 验证与交付

1. 开工重新通过平台只读 Git 读取真实 `refs/heads/main`，按准确 SHA 消费 M1 落地及新差异。规划阶段只记录实际静态核验，未来产品测试保持未运行。
2. 将冻结 M2 两张九类验收表逐项映射到实际测试：多页读取与后页撤权、restore 新 revision、层级／relation 循环、Document 冲突、Inbox metadata→claim→read→ACK／reply、Handoff Human 接受及目标接续、逐实体导入恢复。
3. 分别跑普通 child 和 reviewer 的真实创建→受控交付→exchange／ACK→执行→证据→完成→父查询→父完成。覆盖 reviewer 缺任一本人证据、structured review／noArtifactReason 不豁免、所有未 completed required-child 状态及准确 blocker IDs；补错父／scope、三方撤权、旧 Plan、跨版本限额、同／异 key、混合创建预算竞争、Lease 冲突、故障全回滚、交付重放及重启／Stop／pause。父子投影断言零业务写及无秘密；父 Stop 后不假定子自动级联停止。
4. Windows 使用实际 `pnpm.cmd` 入口执行 `lint`、`typecheck`、`test`、`test:integration`、`test:e2e`、`build`，以及 `check:route-policy`、`check:workmesh-skill`、`check:runner-skill`、`ci:test`、`ci:validate`。保留 M0／M1 原回归和原门禁；真实 Required CI 必须包含新 conformance。
5. 在 M2 目录落盘精确命令、退出码、runtime、数量／skip、首败、受测源码前后指纹及实际资源登记。先脱敏保全，再仅清本人闲置容器／进程／路径；保护共享资源、当前恢复目录及已拒目标。最终提交成果说明、演示步骤、限制和偏差，完成独立成果审查、最新 PR Required CI、actual Done／main 核验后验收，收尾报告准确 head 与受控入口。
