# B3 阶段纠正与方案审查交接

## 阶段与审核状态

方案独审前实施已构成阶段偏差。13:12 的 `confirm_builds` 仅放行方案文档准备，未批准产品编码。审核 head `24666130705719094a7c0bd27d769a04909da117` 已提交产品代码；本次审查不能补写为事前批准。

当前仅修订方案、来源和阶段记录，停在 review。正式方案独审通过且 Chief 随后单独放行，才允许产品修订。ADR 0088 为 Proposed；本地历史检查不代表正式验收。

评审阻断项 3、4 尚未修复：SDK/MCP 接纳目录外恢复文字，CLI 未保留 429/503 的实际等待时长。现有产品代码与相关接入文档不能当作可用交付。具体修订方案和待运行测试见[活动方案](../../plan/b3-connection-error-recovery-active.md)和[活动测试映射](active-test-mapping.json)。

## 既有分支行为（未验收）

接入错误在原 `error` 对象中增加 `next_action` 和 `human_action`。类型不匹配还返回 `supported_clients`，与 discovery 共用部署支持列表。安全的 `details.reason` 区分 slug、类型和 enrollment policy 拒绝；同时猜错 slug 和类型时，先说明 slug。

SDK 目前只校验 `recovery` 的字符串形状，未核对目录；MCP 直接传递这些字段。评审已复现目录外指令传播。CLI 已核对目录，但缺少实际等待时长。这些限制必须修复后重新验证。

恢复说明、参考和可运行示例在同次交付中更新。文档入口为 [接入说明](../../integration/README.md)，新增说明见 [错误与恢复](../../integration/troubleshooting.md)。写作来源与实际示例验证分别见 [技能来源](documentation-source.json)和[文档核验](documentation-verification.md)。

## 保持的合同

endpoint、subject-client 桶和失败退避继续按 operationId 隔离。IP 和 socket 桶继续共享。`limiter.ts`、`inventory.ts`、`SCHEMA.sql` 和 `pnpm-lock.yaml` 均无改动。

没有迁移、新事件或新 job。凭据窗口、服务端重放、attempts、状态码和响应头保持原规则。普通 MCP 业务拒绝保持原恢复机制。CLI 不自动换类型、换 key、刷新身份或改写 pending。

## 来源与必要同步

按照 `AGENTS.md` 对协议变化的记录要求，补充 [ADR 0088](../../adr/0088-agent-connection-error-recovery.md)。ADR 记录拟议字段、消费者和兼容边界，状态为 Proposed，不代表已获产品实施批准。

准确主线、完整当前规格和 savedplan 的绑定见 [inputs.json](inputs.json)及[来源清单](sources/manifest.json)。旧方案和来源原件保留；活动方案另存，逐条适配差异见[修订说明](plan-adaptation.md)。当前真实 main 仍为 `abf6813a439feab4b17b0602cc9295216634586e`，包含 #61/#62；未以共享 `FETCH_HEAD` 判断主线，未删除共享缓存锁。

历史产品 head 的运行字节、LF 等价投影和预期 Git blob 见 [source-files.json](source-files.json)。本轮方案及来源另见 `sources/manifest.json` 和 `plan-adaptation.json`。运行记录中的 `sourceHead` 是整合的主线底座，不冒充尚未提交的实现 head。正式验收必须另绑定平台实际提交与对应 Required CI。

旧断言按新增错误形状扩展，保持错误码、一致性和不泄密要求。路由策略已用既有命令重新生成，生成内容未发生语义变化。SQL 锁清单用既有生成器更新行号；115 个 SQL 指纹、owner、rank 和豁免规则均一致，记录见 [lock-manifest-generation.json](lock-manifest-generation.json)。

验证脚本另修复 S3 就绪探测的提前退出。每次 HTTP 探测使用有引用的截止计时器和 AbortController，原 60 次就绪重试保持。修正只影响独有测试环境的探测与收尾，不修改领域测试超时或产品行为。首次 exit 13 及其手工清理回执保留。

## 验证与完成门禁

既有产品 head 的历史本地结果见 [verification-results.json](verification-results.json)：全仓 lint、typecheck、单元测试和构建通过，完整后端集成、conformance、显式灾备恢复及本机原生 CLI 用例通过。未运行的跨系统 native 矩阵与远端 CI 单列为待运行，不冒称通过。历史测试没有覆盖本次发现的目录外指令与 CLI 等待时长问题，不能作为活动方案的验收结果。

运行日志与大体积原件保存在 [runtime-originals.zip](runtime-originals.zip)和[early-verification-originals.zip](early-verification-originals.zip)。两个 manifest 记录每个成员的准确字节和 SHA-256，压缩包的 Git 暂存字节已核验。文档中的运行路径指 ZIP 内同名成员；各次 `results.json` 另保留在仓库中供直接审阅。

本人创建的容器、卷、失败连接器目录及取消用例目录已定向收尾，详见 [cleanup.md](cleanup.md)。工具策略拒绝了后续生成目录批量收尾。原始调用与实际返回见 [policy-rejection.jsonl](sources/policy-rejection.jsonl)，八个完整目标及来源绑定见 [policy-rejection-source.json](policy-rejection-source.json)。返回自身含截断标记，具体理由未知。原目录全部保留，未拆批、改权限或换命令重试。复核发现其中的 `packages/conformance/conformance-results` 是既有已跟踪结果，不应列为本人新增临时资源；保留回执已纠正。私有依赖、空的测试 APPDATA 及当前工作树继续供独审复验使用。

逐条原验收、九类覆盖及实际用例名见 [test-mapping.json](test-mapping.json)。历史失败与最终复验分别保留；具体结果以各次记录为准，不以测试目录存在或历史 CI 当作本组合通过。

本地检查、原件哈希和资源收尾结果见本目录的验证记录。连接器实际 CLI 用例已在当前 Windows 原生存储和 PTY 上执行。其他适用系统的完整 `test:platform` 矩阵仍以当前提交的 Required CI 为准，不声称本机代验其他系统。

本轮交付方案和来源供正式方案独审，产品代码保持原状。既有产品提交不因文档纠正而获得追认。正式方案独审和 Chief 单独放行后，才能修订产品并核最终准确 head 的必需检查、独审与主线落地。本轮不合入，不把 B3 整卡标为 Done。
