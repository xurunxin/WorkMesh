完成精确 provider action 只读确认、Git 与证据交付，以及独立 reviewer → 当前 head 审批 → Worker 重验发送闭环；REST/Zod/SDK/MCP/Runner 与发现规则保持一致。reviewer 仓库读权限必须显式限定并满足三方授权，省略保持既有合同；审批仍由 Human 决定。

每次仓库写 HTTP 前重验完整授权、当前默认分支、context、head/checks/review/approval 和租期。旧写动作缺合法 checkpoint 时停止外发并转人工对账；context 第八次 claim 耗尽进入终态。查询不返回 payload、秘密或 provider 原始错误。零数据库迁移，merge 不部署、不自动改变 Issue 状态。

正式成果复审无 blocking/high，准确已审 head：ac0c13e0916a6de232c3cab4bbabd92a95b886e9。本机 10 项必需检查 exit 0；API delivery 51、Worker provider 40、M3 conformance 20、E2E 70 通过，含真实 PG 锁竞争及 60 秒跨租期。缓存和环境 skip 按原记录披露，不冒重新运行或通过。完整来源、首败和恢复原件见 docs/plan/agent-mcp-m3/review-fixes-report.md 与 product-report.md。

三客户端 fake 全链与本机 GitHub/Gitea HTTP 已测；真实 provider 账号和外发未获授权、未测，Gitea 多文件 commit/CI retry 仍不支持。UI 重设计及新增 F/TA 域不在本批范围。合入前须本 PR 最新准确 head 的全部 Required CI 成功，再交 Chief 正式合入；本次仅创建 PR。

CI417 首败为 conformance 生产构建漏排测试夹具（TS6059）；仅补 delivery-recovery.fixture.ts 排除项，直接 tsc 与全仓 build 已成功。完整首败和精确源码差异见 docs/plan/agent-mcp-m3/product-pr-ci-report.md；配置增量及最新 head 的 Required CI 仍按门禁复核。
