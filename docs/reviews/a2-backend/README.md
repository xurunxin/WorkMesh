# A2 后端独立候选

本轮依据用户收窄范围及已合入的 #53 分离方案执行。当前完整规格见 [current-spec.md](current-spec.md)，来源和字节绑定见 [sources.json](sources.json)。旧 UI 未获得视觉接受，不再是本轮后端交付门禁。

## 精确保全与分离

[preservation.json](preservation.json) 保存旧 `6f059e3642291f9ab622db37e9de167d070574f2` 的全部 41 个产品增量、8 份文档、完整产品 patch 及四个可读 Git 对象的 tree。Git blob 和 Windows 工作树原字节分别归档；原件没有换哈希或改来源。Chief 提供的完整旧正文见 [history/chief-old-spec.md](history/chief-old-spec.md)，其内嵌早期源哈希只属于原早期源。

原实现、首败、三轮技术修补、D0 五项历史差异与双采集缺口、当前视觉材料仍在 `docs/reviews/a2/` 和旧 Git 历史。本轮先提交保全，再恢复延期的活动源码；不 force-push，不改变旧批准正文或失败回执。

## 保留的功能 hunk

| 文件 | 当前切片与边界 |
| --- | --- |
| `apps/api/src/delivery/repository-configuration.ts` | Human Team/active/provider SQL 分页前过滤、当前操作资格；新过滤绑定游标，旧无参数 `filters={}`。 |
| `apps/api/src/delivery/routes.ts` | `providerConnectionFingerprint` 三字段用途分离 HMAC；旧脱敏键拒绝不安全重放；Agent 拒绝 Human 新过滤；context 读投影追加持久化 action 归因，历史不可归因为 null。其余路由保持。 |
| `apps/worker/src/provider-actions.ts` | `authorizeRepositoryContextInTransaction` 外读前和 `finishAction` 落库/恢复共用；workspace 前置锁与现有 `lockAgentAuthorityPlan` 全局顺序，锁后重验 locator/requester/目标；拒绝只给原 requester，不向旧 Team 泄露；I/O 不持数据库锁。 |
| `packages/db/src/agent-lock-order-manifest.ts` | 按实际新增锁 statement 更新清单，保留其他主线消费，不改锁 rank。 |
| `packages/contracts/src/repository-configuration-contracts.ts`、其测试、`index.ts`、`pagination-contract.test.ts`、`OPENAPI.yaml` | strict DTO、新查询边界、分页封套及异步 action/context 分离；无新端点、迁移、事件、If-Match 或 Agent connect/pin 资格。 |
| `apps/api/integration/stage3-delivery.integration.test.ts`、`stage4-operations.integration.test.ts` | 撤权/恢复/两连接锁等待、请求指纹、精确受众、混合 provider 跨 Team 分页及旧 Human/Agent 正对照，保留原测试。 |
| `infra/docker/lite.Dockerfile`、`docker-compose.lite.yml`、`deploy/lite/README.md` | 保留独立构建期 `NEXT_API_UPSTREAM=http://api:3001` 修复。main 现有 Web 编译 rewrites 否则指向 Web 容器 localhost；必须以本次无源码安装重验，不能引用旧新横幅安装通过。 |

所有 `apps/web/` 原增量和根 `playwright.config.ts` 恢复为精确 main；旧新 UI 安装 verifier 保全后移出活动脚本。新验证入口只验证现有 Web、真实安装/认证/代理和后端配置落库，不恢复新 UI。

## 原六测试与 DoD 去向

依赖深度列表、深链返回重算、全部满足隐藏、non-unmet 无横幅、Back/Forward/键盘/窄屏/i18n、Lite 到新横幅消失六项及原 UIDoD 全部延后到重设计。原已实现的稳定 key、精确 action/目标/正文确认、等待与动作分离、超时可改、所有读取取消/代际门禁及迟到回调反例保留在归档源码和旧技术证据。后端候选不把这些旧通过冒作新的组合通过。

本轮验收为仓库配置后端安全/异步可追溯、API/contract/policy、拒绝受众/锁序、现有 Web/SDK/MCP 消费兼容与必要 Lite 部署兼容。新检查、独审、最新 Required CI 与 actual main 证据分别记录；没有执行的项目保持未运行。没有新增 M0/F/TA 或后续 MCP 域。

## 新候选实际验证与独审入口

精确差异、Git blob 与 Windows 工作树字节见 [candidate-source.json](candidate-source.json)；[candidate-product.patch.gz](candidate-product.patch.gz) 是相对实际 main `c768e1e3db297d8b91b53dd68b60e723a8a40e7d` 的完整产品 hunk。当前 `apps/web/` 和根 Playwright 配置与该 main 无差异；无新迁移或事件类型。

| 新运行 | 受测源码与实际结果 | 原始回执 |
| --- | --- | --- |
| `a2-backend-4d28f519` | `38e2cf8f29c51adafbda11484e713df51d3ea8f2`；契约、锁清单与两个 API 集成文件通过，56 项集成通过、零 skip。运行前后源码不变。 | [receipts.json](runs/a2-backend-4d28f519/receipts.json)、[无损原件索引](runs/a2-backend-4d28f519/archive.json) |
| `a2-backend-491ca462` | 同一后端源码；route-policy、lint、typecheck、test、integration、E2E、ci:validate 和 Web build 全部 exit 0，现有 Web E2E 69 项通过。期间仅独立 Lite 测试脚本的等待方式改变，该入口未被本批检查消费；变化和前后源哈希均保留。 | [receipts.json](runs/a2-backend-491ca462/receipts.json)、[无损原件索引](runs/a2-backend-491ca462/archive.json) |
| `a2-backend-lite-225ab467` | `9de5897ab42b4a3459bf977c7a78c78bc3d11538` 精确 Git archive 构建，四角色无源码安装、Web 代理安装/认证、真实配置 POST/重放、Worker 经 HTTPS 读取测试供应商、精确 action/context 查询以及 main 现有工作台打开均通过。 | [receipts.json](runs/a2-backend-lite-225ab467/receipts.json)、[无损原件索引](runs/a2-backend-lite-225ab467/archive.json) |

[results.json](results.json) 汇总每条命令、exit、起止时间和实际 skip；独立 recovery 夹具及其他可选 skip 未执行，不计通过。Lite 只启用本次 Gitea 测试开关，其余功能默认关闭；真实认证和 Web 代理未被 mock，TLS 验证未关闭。镜像内五个 rewrites 已核为 `http://api:3001`，运行时环境无法修正先前编译进产物的 localhost，这就是保留构建期代理修复的原因。此本机兼容通过不替代真实设备/厂商，也不覆盖原新横幅、S3 全面功能或保留的 RustFS 凭证映射风险。

专用检查容器、Lite 安装容器/卷/网络、四角色探针、CA 卷、镜像、HTTPS 服务和临时安装目录已逐项核归属后收尾，见各运行回执及 [Lite 逐路径结果](runs/a2-backend-lite-225ab467/cleanup-path-receipts.json)。原失败、旧视觉、共享资源、被拒清理目标及当前 worktree 保留。

[preservation-verification.json](preservation-verification.json) 和 [delivery-verification.json](delivery-verification.json) 核对来源原字节、历史 Git 对象、压缩原件、当前无 UI 增量和受测源码绑定。新候选尚待另一 Agent 独审及最新 PR Required CI；当前未合入 main，不宣称本卡 backend done。旧三技术阻断仍是旧组合的已闭结论，不代新组合独审。
