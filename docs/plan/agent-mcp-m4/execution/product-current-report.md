# M4 当前实现与检查报告

本文件以下运行表对应原候选 `603f5001513872d4e973566d6a4c07ec4e7b179b`；保留原数量、首败、未测及资源时点。正式审查三项修复后的入口、源码绑定、实际新检查与 CI 状态见 [正式审查答复](formal-review-response.md)，不能把原本机通过代替新 HEAD Required CI。

本批实现四项既有读取授权投影、六域具名 SDK/共享 DTO、MCP/必要 Runner、M4 受控 discovery 增量与产品生成链。方案正式复审放行不等于成果验收；此前内部两 High 修复及局部静态结论单列为阶段证据，不能代 Chief 正式成果审。完整必需检查、最新候选 Required CI、正式审查和 actual Done/main 门禁未被此报告自动关闭。

当前本地提交基线 `59881caf8935ab48e770cbcc3f63831efd4b3d94`，主线来源 `c2b3d363c037157df13beb82799d99d07a9b7db8`，批准方案 `4adc5e39680e66543613d3f4f84c57a555fd94c1`。本轮产品和证据字节在工作树，准确新提交由平台提交/推送回执提供；不循环把未来 head 写入自身。

## 实现与边界

四读取授权与正文同快照，A2A 最终派生写另重核原凭据实时有效期，并在首查询前固定 READ COMMITTED。未知目标仍明确待核。REST/Zod/SDK/MCP/Runner 同操作使用真实合同，19 项选择含原 health/completion 三绑定，实际注册 155 个与旧 138 bindings/137 映射逐字段保留；这些数量只是索引，功能结论见 [消费者与权限](consumer-compatibility-current.md) 和 [九类矩阵](nine-class-current.md)。本批无迁移、无新表、无新领域事件及权限。Loop 既有预算预留、manifest 旧 scope 兼容与 Human Loop SQL 参数类型的必要修复均有真实消费者/数据库回归。

## 实际命令

| 命令索引 | 退出 | 秒 | 原输出数量/缓存/skip |
| --- | --- | --- | --- |
| [backend-a2a-final-gate-current-identity](checks/backend-a2a-final-gate-current-identity/receipt.json) | 0 | 24.65 | Test Files  1 passed (1)；Tests  26 passed (26)；Duration  17.88s (transform 1.07s, setup 0ms, collect 3.19s, tests 14.29s, environment 0ms, prepare 145ms) |
| [optional-current-actual-mcp](checks/optional-current-actual-mcp/receipt.json) | 0 | 63.78 | Test Files  1 passed (1)；Tests  12 passed (12)；Duration  58.33s (transform 1.16s, setup 0ms, collect 2.92s, tests 55.05s, environment 0ms, prepare 125ms) |
| [finite-write-real-outbox-fault](checks/finite-write-real-outbox-fault/receipt.json) | 0 | 19.85 | Test Files  1 passed (1)；Tests  2 passed \| 11 skipped (13)；Duration  13.43s (transform 2.13s, setup 0ms, collect 5.89s, tests 6.76s, environment 0ms, prepare 247ms) |
| [actual-management-feature-discovery](checks/actual-management-feature-discovery/receipt.json) | 0 | 12.70 | Test Files  1 passed (1)；Tests  1 passed \| 12 skipped (13)；Duration  6.92s (transform 1.15s, setup 0ms, collect 2.83s, tests 3.68s, environment 0ms, prepare 118ms) |
| [product-double-regeneration](checks/product-double-regeneration/receipt.json) | 0 | 10.50 | 见完整stdout |
| [discovery-invalid-inputs](checks/discovery-invalid-inputs/receipt.json) | 0 | 29.99 | 见完整stdout |
| [final-root-lint-current](checks/final-root-lint-current/receipt.json) | 0 | 62.39 | Tasks:    18 successful, 18 total；Cached:    0 cached, 18 total |
| [final-typecheck-combination](checks/final-typecheck-combination/receipt.json) | 0 | 182.85 | Tasks:    18 successful, 18 total；Cached:    0 cached, 18 total |
| [final-conformance-typecheck-after-faults](checks/final-conformance-typecheck-after-faults/receipt.json) | 0 | 21.76 | 见完整stdout |
| [final-unit-inventory-corrected](checks/final-unit-inventory-corrected/receipt.json) | 0 | 45.60 | @workmesh/api:test:    Duration  27.90s (transform 1.43s, setup 0ms, collect 7.65s, tests 8.23s, environment 4ms, prepare 4.67s)；Tasks:    32 successful, 32 total；Cached:    27 cached, 32 total |
| [final-integration-correct-environment](checks/final-integration-correct-environment/receipt.json) | 0 | 1582.17 | Tests  81 passed (81)；Tests  291 passed \| 1 skipped (292)；Tests  97 passed (97)；Tests  147 passed \| 1 skipped (148)；Tests  1 skipped (1) |
| [final-e2e-current](checks/final-e2e-current/receipt.json) | 0 | 288.57 | @workmesh/web:test:e2e:   70 passed (4.6m)；Tasks:    3 successful, 3 total；Cached:    0 cached, 3 total |
| [direct-conformance-production-build](checks/direct-conformance-production-build/receipt.json) | 0 | 7.33 | 见完整stdout |
| [final-source-build](checks/final-source-build/receipt.json) | 0 | 90.57 | Tasks:    18 successful, 18 total；Cached:    14 cached, 18 total |
| [final-source-typecheck-current](checks/final-source-typecheck-current/receipt.json) | 0 | 72.22 | Tasks:    18 successful, 18 total；Cached:    0 cached, 18 total |
| [final-source-unit-entry](checks/final-source-unit-entry/receipt.json) | 0 | 16.45 | @workmesh/contracts:test:    Duration  6.03s (transform 2.65s, setup 0ms, collect 21.12s, tests 13.60s, environment 5ms, prepare 18.57s)；Tasks:    32 successful, 32 total；Cached:    31 cached, 32 total |
| [check-current-route-policy](checks/check-current-route-policy/receipt.json) | 0 | 5.41 | 见完整stdout |
| [check-current-runner-skill](checks/check-current-runner-skill/receipt.json) | 0 | 4.55 | 见完整stdout |
| [final-ci-policy-validation](checks/final-ci-policy-validation/receipt.json) | 0 | 5.67 | ℹ pass 16；ℹ fail 0；ℹ skipped 0 |
| [final-ci-validate-history-safe](checks/final-ci-validate-history-safe/receipt.json) | 0 | 7.80 | ℹ pass 15；ℹ fail 0；ℹ skipped 0 |
| [agent-smoke-current](checks/agent-smoke-current/receipt.json) | 0 | 10.13 | Test Files  4 passed (4)；Tests  56 passed (56)；Duration  1.63s (transform 372ms, setup 0ms, collect 1.53s, tests 465ms, environment 0ms, prepare 1.18s) |

完整所有命令（包括首败）见 [结构化回执索引](checks-current.json)。每个 receipt 有准确输入、cwd、脱敏输出、退出和 runtime、受测源码前后完整字节 SHA/长度；源码变化标记不改为 false。`source-objects` 保存与 Git 原件不相同的运行字节。177+14 项不可变来源重新全文核验见 [来源](sources-current.json)，旧 Git 检查不代新组合运行。

根集成依 DB→API→conformance→Worker→recovery 顺序的原数量行：Tests  81 passed (81)；Tests  291 passed | 1 skipped (292)；Tests  97 passed (97)；Tests  147 passed | 1 skipped (148)；Tests  1 skipped (1)。conformance 本次 6 套件包括 M4 的完整 13 项，非旧 12 项或 focused skip 结果代替。E2E 原输出：@workmesh/web:test:e2e:   70 passed (4.6m)；Tasks:    3 successful, 3 total；Cached:    0 cached, 3 total。所有 skip 及缓存均保留原行，退出零不推断 skip 场景已运行。

根集成三个 skip：API `workbench-runner.integration.test.ts` 的真实 MiniMax 条件（`RUN_WORKBENCH_LIVE` 与凭据的联合准入，本批只用受控模型）；Worker `RUN_RETENTION_UPGRADE_INTEGRATION` 未启的独立升级 barrier；`RUN_RECOVERY_INTEGRATION` 未启的双专库/S3/PG 工具整库恢复。M4 没有迁移或 retention 升级，这两项不列为本批新正例；本批真实 API 重建、持久 cursor、outbox/Worker 恢复和 Stop 则按实际已跑证据列出。不修改这些门禁，也不推已验其他 OS、真实 provider 或整库恢复。

## 首败与证据限制

保留早期部署配置、SDK/分页/Skill pin、锁清单、Loop SQL 参数类型、目标 manifest 旧 scope、原 API/测试夹具错误的独有首败；原退出不改写。根集成首轮 `final-integration-combination` exit 1：DB 通过后 API 73 failed/218 passed/1 skipped，全局 feature、鉴权 burst、master-key 格式及未建 S3 bucket 影响旧套件；修正仅在本卡私有环境，完整重跑另列，不把续跑替换原整命令。两个屏障/包装器中断有 interruption.json，缺原输出/指纹处如实缺失。旧同名私有 alias 在 CAS 引入前被覆盖的原件不补造。

早期没有 `exactBytesSource` 的回执按原长度/SHA 对后续真正保全字节逐项核验，并明确保全时点；其中 66 条 before/after 记录涉及 6 个文件的 10 个旧版本，仍缺完整运行字节原件，路径及原指纹逐条保留于 `delivery-check-current.json`。不从 Git 规范化字节重建旧运行原件。本批最终根集成/E2E 均有完整新源码引用且 sourceChanged=false，其余命令保留原标记。凭据扫描命中的两份原基线凭据检测测试字面示例以完整 main Git 源码复核，不当真实凭据、不修改原测试或原件；私有环境与运行凭据未入交付。

脱敏完整模型实收、native/Pi 进程与退出回执按内容身份保留于 [运行原件索引](runtime-evidence-current.json)。Pi 使用合法 project/item E；项目less Loop target 不能创建 Workbench conversation。目标原 Loop 未发行 webhook bootstrap，实际用准确安装 refresh→ACK→executing；foreign 安装拒绝，不冒新 delivery。A2A mapping 为特权 adapter 夹具，没有真实外部导入。无限流、其他 OS、真实 provider、外发与发布未验证；根独立整库恢复环境 skip 不算恢复正例。

旧 M3 套件本轮同名输出先完整保全至 CAS，历史 `ci-logs/delivery-recovery` 再恢复 HEAD 原字节，见 [历史保全回执](history-runtime-preservation.json)。当前运行与旧报告保持分离，不修改 #53/M5 原检查结论。

## 演示、资源与交接

按 [消费者复验步骤](consumer-compatibility-current.md) 在本卡专库运行 optional-domains 套件。六 feature 由该独立 API 夹具启用，旧根套件默认关闭负例保留；生产和用户配置未改。资源账本 [resources.json](resources.json)、[身份盘点](resource-inventory-current.json) 区分逻辑长度、去重长度和物理释放，硬链接不计为多份物理占用。当前恢复目录、M5 恢复、旧只读对象、拒目标及父目录继续保护，无 global prune。收尾结果另存精确回执，不凭 Done 自动删除。

收尾以 [精确资源回执](cleanup-current.json) 为准，仅停止本卡三容器，原生归属进程/监听退出与用户配置不变有独立回执；恢复树、卷、镜像及拒目标继续保留。交付完整字节核验见 [交付检查](delivery-check-current.json)，源码和运行证据采用内容寻址，不重复归档构建或原生 EXE。

本目录 `.gitattributes` 对受控执行文档及原件禁用 Git 换行转换，CAS 与原命令输出采用 binary diff，防止 CRLF 规范化破坏原指纹；沿用仓库既有来源保全机制，不变 Windows 属性、ACL 或任何删除拒绝边界。准确运行字节与其他产品源码提交的规范化 Git 字节仍分列。

仅 Todos＋仓库留痕；无真实 WorkMesh 远端记录。成果审查须由 Chief 在完整实际候选发起，最新 PR Required CI 和合入/Done/main 另核；当前不宣告整批验收。
