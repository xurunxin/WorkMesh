## 上下文与假设

完成 M5 的联合验收设计：证明外部客户端与内置 Runner 能完成既有领域闭环，并正确处理授权、异步结果、冲突和恢复。

已重新读取真实 `main`，当前工作树与 M3 合入源码一致。首轮固定采用 Windows 上的实际 OpenCode 进程及 Pi Runner，以本机受控模型驱动确定性工具调用、fake Git 验证交付。模型夹具、协议夹具和实际客户端运行分别记录。

本轮实际完成并提交 `docs/plan/agent-mcp-m5/` 完整规划工件，停 confirm 供 _oY 方案独审；不把落盘留到产品实现回合。使用 Todos＋仓库记录。UI、M4 可选域、F／TA 新域、真实外发及公共发行不在范围内。

## 规划工件变更

所有新增文件位于 `docs/plan/agent-mcp-m5/`，不修改冻结历史报告。

- **`README.md`、`savedplan.md`、`implementation.md`**：保存内容一致的中文方案、依赖和实施顺序；明确方案独审、Chief confirm、产品实施、成果独审、最新 Required CI、Done／main 各关口。本轮提交后停 confirm。
- **`spec.md`、`frozen-m5.md`、`sources.md`、`input/`**：归档当前完整规格、冻结输入 M5 全文、平台注入的原 saved plan 全文及本轮反馈、路线七份完整 Git 原件与 M0／M1／M2／M3 落地合同和产品／修复／CI 来源。原计划关联 `doc:KlfDrOUAFsJU7CSWbjbOp`，独立文档原件未取得单列，不能以注入副本冒后端全文读回。分别登记 commit、blob、完整内容哈希和工作树字节；截断、缺旧原件、历史首败和旧 skip 保留原含义。
- **`environment.md`、`environment.json`**：记录实读客户端路径、OS、可得版本、能力入口、官方文档来源及读取时间，并核现有配置／登录是否需要新外部授权；已有安装不表示已接入。禁止本轮新安装、登录或凭据授权，保护用户配置，后续使用独立本任务临时配置与受控本机模型／fake Git。关键能力缺口形成具体原问题卡。个人 Lite、小团队、企业逐项列出计划测试范围和真实缺口，不把现有他人服务当作测试环境。
- **`operation-matrix.md`、`consumer-matrix.md`、`security-contract.md`**：逐操作关联 REST／Zod／SDK／policy／feature／MCP／manifest／Runner，注明 C、E、安装身份、Human 前提、revision、幂等身份、分页和结果确认方式。消费 M0 冻结规则及后续受控增量；不依据工具数量判定覆盖。
- **`acceptance-matrix.md`、`resources.md`**：将冻结九类要求逐行映射到测试、断言、证据和适用理由，规定源码前后指纹、命令退出、模型实收、持久事实及资源清理回执格式。

## 联合验收实施设计

复用 `createMcpCoverageFixture` 的真实 API、授权准备和重启机制，`createPlanningCollaborationFixture` 的签名投递、失响应代理及 Pi 子进程，以及 `createDeliveryRecoveryFixture` 的 `FakeGitProvider`、Worker 和上传验证。`McpReferenceDriver`、`runClientConformance` 继续证明协议兼容；实际 OpenCode 由独立进程驱动，不能以 `opencode-style` 夹具替代。

两客户端分别运行无 Git 核心链和有 Git 交付链：

1. 新建授权 Connection，规划、领取、ACK、执行、文档／Room／Inbox 协作、证据及完成。两 Human 使用独立 REST 登录，两个 Team、两个 Agent 覆盖交接与撤权；Human cookie 不进入客户端或 Runner。
2. Git 链验证 context、Lease、branch／commit／PR、精确 `getProviderAction`、当前 head 检查、显式限定仓库读范围的 reviewer、Human 批准和 Worker 发送。reviewer 必须交付本人 `review_result`、`code_review` Artifact 和 structured review，完成后父确认 required child。
3. 覆盖正常、越权、非法状态、幂等、旧 revision、事务失败、重放、并发、重启／Stop。分别重启 MCP／API／Worker／Runner；验证 cursor resync、Lease 丢失、原动作确认、unknown 零盲重发及原 E Token 的 Stop_ACK。ADR0068 原子 settle 回滚和明确拒绝后的可见 warning 必须由数据库及客户端证据证明。

HTTP 每请求重新建立身份；执行工具使用明确的目标 bridge 或准确 E 入口，不依赖前次请求留下的 Token。公共准备与客户端实际工具调用分列。必需只读投影缺口进入 ADR／合同复核关口，不假设端点存在。

在 `implementation.md` 中冻结后续新增联合验收 driver／fixture／测试／reporter 的文件清单与命令；新 conformance 套件同时接入 integration include、根单元 exclude、CI 必含校验和逐套件删除负例，跨包 fixture 排除生产构建但保留 lint／typecheck。

## 验证与交付关口

本轮只验证规划包：完整 Git 来源、冻结文本、九类覆盖、操作合同、链接、UTF-8、全文空白和实际 CI 分类；执行 `git diff --check`，提交规划工件并报告准确 head。所有产品用例保持未执行。

独审消除 blocking／high 且 Chief confirm 后，按规划准备独有环境，运行两客户端四条完整链及故障矩阵，并执行：

```text
pnpm.cmd check:route-policy
pnpm.cmd check:workmesh-skill
pnpm.cmd check:runner-skill
pnpm.cmd ci:test
pnpm.cmd ci:validate
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:integration
pnpm.cmd test:e2e
pnpm.cmd --filter @workmesh/conformance build
pnpm.cmd ci:source build
```

结果保存实际数量、skip、缓存、首败、runtime 和受测字节。Lite 与团队夹具结果限定到实际配置；企业、其他 OS、真实模型／Git provider 未测明确列出，不缩减旧分发门禁。脱敏保全后仅清本人闲置资源；审批拒绝目标保留，不绕过。

最终验收须同时具备独立成果审查、最新 PR Required CI 和实际 Done／main 证据，并交付演示步骤、限制及规格偏差。
