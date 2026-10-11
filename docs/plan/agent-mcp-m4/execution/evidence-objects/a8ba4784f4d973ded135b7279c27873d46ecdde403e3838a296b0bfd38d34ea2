# 本批实际消费者与安全边界

本文件记录实现及新运行；原规划文件、原审和首败回执继续保留。方案正式复审允许实施，局部内部审查不代替 Chief 正式成果审。当前具体命令以 `checks/*/receipt.json` 为准。

## 四读取与生成合同

Initiative 使用与列表一致的 live Session、Delegation、principal、Team grant 和实际 project/work-item 关联，非空合法聚合与同 Initiative 另一项目排除都有真实测试。Automation run 和 Usage 只读取准确当前 Session；Loop origin 的 admission 回执不授予 target 读取权。纯读取保持一条 SQL 快照，不加读锁；真实 PG 屏障证明语句前撤 grant 拒绝，语句后只返回原快照、下一次拒绝。

A2A 保持独立十进制 protocol cursor，扫描最多 200 原事件，空映射页也推进扫描位置。它具有既有 delivery 派生写，初始授权和扫描之后还须最终授权。事务首条查询之前明确 READ COMMITTED，最终语句用 `statement_timestamp()` 检查原凭据、overlap、Session、Delegation、principal、Team grant、binding/task；其他调用默认 `now()` 不变。E、C、Human 凭据扫描后自然到期、已提交撤权、空/非空页、原 RR 连接、故障回滚和并发去重均由真实 PostgreSQL 用例验证，不以静态文本或旧 15 个测试代替。

M4 增量参与 discovery 生成，并同时替换四项旧 Human 查询条件和 queryDifferences 阻断。未知目标仍为 `requires_target_check`，准确 pendingChecks 由 REST 调用时重核。注册证据来自公开 `registerTool/registerResource` 实际调用，区别于已过滤的 tools/list。旧 138 bindings、137 映射及三项 health/completion 身份变体逐字段保留。生成器验证捕获源码完整字节；缺注册、未知操作、改写旧 binding 或捕获过期均在写派生文件之前拒绝。

## SDK、MCP 与 Runner

SDK 使用具名类型与共享 Zod 返回校验。集合使用原签名分页，A2A 使用独立游标；金额保十进制字符串，多币种分桶，unknown 不改成零。`listAutomationRules/listLoops` 仅暴露实际 REST 支持的分页参数，不添加服务端忽略的 Team 过滤参数。有限写固定逻辑调用的 key/body、occurredAt、occurrenceKey 和 scheduledFor；不以刷新凭据绕过 401/403。

MCP GET 在两种 mode 注册；新增 saved-view、Loop 手动运行、usage 写仅在 read-write 注册。Human 的高级 View、Rule、Loop、Template、预算及 A2A 管理权限保持不变。Runner 只使用原 executing E；GET 不追加 Activity，完整页与 cursor 保留，超消费上限明确错误。recordUsage 由命令自身记录事实，不因 Activity 包装额外要求 work:write；原恢复白名单不扩大。内嵌 Skill 与派生 manifest 一致。

实际 Loop Delegation 的 `capability_scope` 没有重复的 capabilities/workspaceId；旧 manifest `.includes(undefined)` 会返回 500。实现复用原命令 guard 的 permissions_snapshot ∩ live definition ∩ live Team grant，并保留显式更窄 scope.capabilities；缺 workspaceId 使用已认证 actor.workspaceId。没有增加能力、membership、跨 Session 或项目归属。Loop 预算沿现行 ADR 的保守 active reservation 合同计入既有 usage 后检查硬限额；旧 reservation 的 Token 数取准确 Session.budget，新记录包含 maxTokens。真实成本/Token 和 no-overlap 竞争证明只准入一个合法新 run。

## 已验证的客户端组合与明确限制

真实 HTTP MCP 验证 C 与 E，SDK 验证 origin 和 target 分离。真实 Pi Workbench 使用已有负责 Human 的 project/work-item E，实际模型收到 rollup、usage、规则/Loop、空 Template pin 和跨 Session 拒绝。native OpenCode 使用准确 target E，实际模型收到完整大 Template 正文、本人 run、usage 和 A2A 有界页；另一准确 origin E 读取 rollup/usage。模型是本机受控 loopback，未连接真实 provider。

现行 Loop admission 仅记录 queued Session/domain event/outbox，没有发行 webhook bootstrap 凭据；本批不创造新 delivery 协议。目标使用现有 installation refresh 入口，准确安装凭据实际刷新、ACK 并进入 executing，其他安装凭据拒绝；origin 凭据不替换。原项目为空的 Loop target 不授予项目读权，也不能创建 Workbench conversation；这条 Pi 组合明确不支持。A2A task mapping 使用特权数据库 adapter 夹具，不冒真实外部 task 导入。无限 A2A 流、真实外发、其他 OS/provider、发行验收及公共 Skill 发布均未验证。

## 演示与复验

使用本卡登记的独立测试部署，按 `run-check.py` 的私有环境执行 `pnpm.cmd --filter @workmesh/conformance exec vitest run --config vitest.integration.config.ts src/optional-domains.conformance.test.ts`。该套件由 Human 夹具准备六域，实际 Agent 身份完成读取/有限写，运行 PG 竞争与回滚、两种真实客户端，并重建 API 验证持久 cursor 与 Stop。完整根集成命令另有回执，不用单套件替代根检查。凭据只在本地私有环境，不提交、不经聊天索取；没有创建 WorkMesh 远端 Project/WorkItem。
