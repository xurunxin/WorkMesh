# 逐操作当前支持与实际消费者

运行环境仅 Windows、独立六域 API、真实 PostgreSQL/Redis/RustFS、本机受控模型与 fake provider。表中“注册/单元”不等于实际模型调用；所有列以本批 `checks/` 和 `runtime-evidence-current.json` 为证据，原历史报告不改写。当前完整根检查/正式成果独审/PR Required CI/Done 门禁另见 `product-current-report.md`。

| 操作 | REST/SDK/HTTP MCP 新实测 | 真实模型实测与保留边界 |
| --- | --- | --- |
| listCycles | C 读取分页；feature 关闭拒绝 | Runner 注册/单元，未在 M4 模型调用该操作 |
| listInitiatives | E 返回本人关联项目的 Initiative | Runner 注册/单元；Team-only C 不推项目 |
| getInitiativeRollup | 合法非空、其他 linked project 排除、撤权拒绝、Human/200上限/金额 unknown 回归 | Pi origin E、native origin E 实收；C 无关联项目隐藏 |
| listSavedViews | SDK 本人/内置签名页全遍历，target 不见 origin private owner | Runner 注册/单元，M4 模型未调用 |
| createSavedView | MCP 真写；SDK 同 key 回执、异体冲突；真实 outbox 故障回滚与重试 | read-only 不注册，owner 由当前 Actor 固定；Runner 注册/单元 |
| listAdvancedViews | E MCP 可见结果排除另一 owner private | Runner 注册/单元，不授管理 |
| evaluateAdvancedView | MCP 真实 work-item 结果、private target 拒绝 | Runner 注册/单元；不支持新 layout/filter 范围 |
| listAutomationRules | C MCP 真实规则；SDK/REST 共页合同 | Pi origin E 实收；规则管理 Human-only |
| listAutomationRuns | target E MCP 本人 Loop run 页 | Runner 注册/单元，不授 origin 查 target |
| getAutomationRun | target E MCP 真 run/effects；origin E NOT_FOUND | native target 实收；Pi origin 实收跨 Session 错误 |
| listLoops | C MCP 可见 Loop | Pi origin E 实收；recent_runs 元数据不授 run 正文权限 |
| runLoopNow | C SDK 真实准入，MCP 原 key/body 重放；非法状态、no-overlap/预算竞争及真实故障回滚 | Runner 注册/单元；admission 不发行新 webhook bootstrap，不授 origin target 读取权 |
| recordUsage | target E MCP 真写；SDK dedupe、异体、准确 Session/Agent/project、故障回滚 | Runner 注册/单元与无额外 Activity；M4 模型未写 usage；仅原 command 事实 |
| getUsageSummary | SDK/MCP 本人、foreign filter 拒绝、decimal/独立币种/unknown、真实 PG 撤权 | Pi origin 与 native origin/target 实收；项目less target 不填 projectId |
| listTemplates | MCP target 精确版本 pin、完整正文；origin 合法空页 | native target 实收完整大正文，Pi origin 实收空 pin；不开放 Template 管理 |
| streamA2ATaskEvents | MCP get_a2a_task_events 有界页；真实 PG E/C/Human final gate、空映射、RR、expiry、撤权、overlap、回滚/去重 | native target 实收；Pi origin 实收 foreign task NOT_FOUND。独立 protocol cursor，不支持无限流 |
| getProjectHealthHistory | SDK 真实 published/draft 历史页与共享 DTO | 原 MCP/Runner 身份变体保留；M4 模型未调用 |
| createProjectHealthUpdate | SDK 精确批准/旧 revision/改体拒绝，MCP 草拟及 outbox 故障全回滚/同 key 重试 | 仅准确 project E，publish 需批准；Runner/MCP 原身份变体不扩大 |
| suggestWorkItemCompletion | SDK 合法提案，MCP 真写及 outbox 回滚/重试，workflow 状态保持 | Human 决定完成；Runner/MCP 原身份变体保留，M4 模型未调用 |

20 项六域 Human 管理入口使用真实 Agent HTTP 逐项拒绝，准备操作使用 Human fixture；不把无工具冒作 REST 拒绝。默认六 feature 的 REST 明确 FEATURE_DISABLED，真实 manifest 四读取均 blocked，MCP tools/list 不广告其 binding。合法身份/未知准确 target 保 `requires_target_check`；非法状态、缺能力和旧 bindings/identityVariants 回归分别在 contracts 与真实 HTTP 套件。

Pi Workbench 仍要求负责 Human 的 project/work-item context，项目less Loop target 明确不支持该消费者组合。准确目标安装 refresh 与 foreign 安装拒绝是真实入口，A2A task mapping 为受控特权 adapter fixture；没有真实外发或外部 task 导入。三 OS/真实 provider/签名发行/无限流均未测，不能据本表推全功能或整批完成。
