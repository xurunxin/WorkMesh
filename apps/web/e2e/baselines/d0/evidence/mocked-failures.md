# 通用 mocked-dev 逐项失败与交接

D0 专用视觉清单已通过，但通用入口仍失败，D0/D1 门禁关闭。首轮收集 139 项，实际 12 通过、12 失败后主动中止，115 项未执行。随后对这 12 个实际失败用例进行修订前配置与当前配置专项对照，两边各 12 失败；未声称整套 139 项全绿或所有剩余失败均无关。原始错误、页面 DTO 警告、运行日志及上下文哈希见 [mocked-failures.json](mocked-failures.json)。

## 对照边界

修订前配置来自 `0e9968dd24748f864370819a239093b42c80ba61`。临时文件仅改 import 路径、绝对 testDir 和 webServer.cwd；两边均固定 `NEXT_DEV_API_UPSTREAM=http://127.0.0.1:3201`。产品与这 12 项旧测试未改。这是相同产品基点下的配置对照，不是另一产品提交的回退，也不能验证默认 upstream 变更对全部套件无影响。每个失败单独保留，不将一个旧失败推成全部失败无关。

## 每项结论

| 序号 | 文件及实际用例 | 配置对照 | 当前已核实问题 | 可执行下一步 |
| --- | --- | --- | --- | --- |
| 1 | `e2e\mocked\accessibility-keyboard.mocked.spec.ts:623:3` — Agent and Session deep-link semantic smoke at 1920px en | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 2 | `e2e\mocked\accessibility-keyboard.mocked.spec.ts:623:3` — Agent and Session deep-link semantic smoke at 390px zh-CN | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 3 | `e2e\mocked\accessibility-keyboard.mocked.spec.ts:368:3` — covers Home detail, Agents, Settings, Operations, tabs, tables, layers, and focus restore | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 4 | `e2e\mocked\accessibility-keyboard.mocked.spec.ts:511:3` — covers compact selectors, mobile navigation, local table scrolling, top layers, and containment | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 5 | `e2e\mocked\agents-interactions.mocked.spec.ts:70:1` — keeps Peek, Team Access, selection, URL, and stable Agent navigation independent | 两边均失败；错误要点相同 | 返回 Agents 后等待 getByRole(tab, Approvals) 点击超时；旧界面导航假设尚未和当前界面契约对齐 | 独立复核当前导航设计与旧用例的返回路径；如需产品行为或验收边界变更，先由总管裁决 |
| 6 | `e2e\mocked\agents-interactions.mocked.spec.ts:154:1` — rejects malformed approval decisions before mutating the fixture | 两边均失败；错误要点相同 | 无效决策验证后读取审批详情，GET /api/v1/approvals/approval-direct 预期 200，实际 404 | 核对 agents-interactions 场景读取单条审批的 mock 路由与契约；不要把其他场景的详情路由当本场景已实现 |
| 7 | `e2e\mocked\agents-interactions.mocked.spec.ts:25:1` — restores approval URL state, keeps History read-only, and retries one bulk decision idempotently | 两边均失败；错误要点相同 | 重试后 Approved 1 request 不可见，页面保留 Approval action could not be completed 提示 | 采集第二次决策的 HTTP 返回、DTO 与 idempotency ledger，分别核对夹具响应、成功反馈及一次提交约束，不能简单删断言 |
| 8 | `e2e\mocked\agents-responsive.mocked.spec.ts:180:3` — responsive product surfaces at 320x800 | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 9 | `e2e\mocked\agents-responsive.mocked.spec.ts:180:3` — responsive product surfaces at 375x812 | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 10 | `e2e\mocked\agents-responsive.mocked.spec.ts:180:3` — responsive product surfaces at 390x844 | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 11 | `e2e\mocked\agents-responsive.mocked.spec.ts:180:3` — responsive product surfaces at 760x900 | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |
| 12 | `e2e\mocked\agents-responsive.mocked.spec.ts:180:3` — responsive product surfaces at 761x900 | 两边均失败；错误要点相同 | 页面明确出现 Agent DTO 校验错误，缺少 icon/endpoint_url/output_artifact_types/metadata/lifecycle 与归档/时间字段，随后目标内容缺失；不是仅凭空定位器认定旧 selector | 在独立旧套件维护范围补齐夹具响应至 agentResponseSchema，保持产品校验严格，然后逐项复跑 |

## 总管裁决条目

9 项有明确 Agent DTO 夹具错误。消费方 `apps/web/app/lib/agents.ts:69` 严格执行 `agentResponseSchema.parse`，契约在 `packages/contracts/src/agent-response.ts`；`agent-registry-card` 与 `agent-detail-panel` 组件仍存在，不按缺失 locator 猜测已删除。其余三项的实际错误互不等同，审批场景还需分别核对读取路由、反馈 DTO/idempotency 与导航契约。

请总管确定旧套件维护的任务归属；需要无关产品修复或改变验收边界时须明确裁决。本条没有修这些旧测试/产品，也没有删断言、放宽契约或擅自豁免。无需用户重传 PRD、设计资料或凭据。

1. 按上表每项下一步处理，保留原失败对照。
2. 顺序完整运行 `pnpm --dir apps/web exec playwright test --config playwright.mocked.config.ts` 的 139 项，再执行独立 D0 `--update-snapshots=none`；不能用 12 项专项对照代替全量通过。
3. 若要拆分基线验收与旧套件维护，由总管明确记录验收决定；裁决前 D0/D1 保持关闭，G1/P1/R1 仍独立。
