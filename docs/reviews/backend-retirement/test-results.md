# 后端化实际验收记录

## 范围与运行来源

产品实施依据已审提交 `66a3764bb54bef4c1549528f902f78854aa2f3f2` 的活动方案与精确修订；两项用户通知选择保持。独立读取和复核 main 为 `f2591a3bebeca9640b0d828ac3ad07fb5daf8e3c`，未删除共享锁或取共享 FETCH_HEAD。原件与产品差异分别保全。

宿主为 Windows、Node 25.4.0；实际使用已有 pnpm 9.15.4，复用共享 store，以 copy 安装隔离可写依赖。CI 与容器使用锁定 Node。测试数据库、Redis、对象存储、Compose、builder 和临时凭据均为本任务独有；没有真实通知、厂商调用、新登录或外部发布。准确命令和源 SHA、镜像 ID、原始输出见日志清单、`runs/*/receipts.json` 与 `ci-artifacts/`。

## 本机命令与结果

| 命令 | 实际结果 |
|---|---|
| `pnpm install --frozen-lockfile`，私有 copy 依赖、共享 store | 通过；`install.log`，正常原生 postinstall；归属在 `dependency-owner.json` |
| `pnpm build`、`pnpm typecheck`、`pnpm lint` | 各 17 个 workspace 通过；`build.log`、`typecheck.log`、`lint.log`；没有 Web 构建 |
| `pnpm ci:test`、`pnpm ci:validate` | 最新本机 20 项策略测试通过，自检通过；`ci-policy-deployment.log`、`ci-validate-deployment.log`；删除、跳过、吞错、缺结果和取消仍拒绝 |
| `pnpm validate:lite:self-test` | 通过；16 个违规变体拒绝，`lite-self-test.log` |
| `pnpm check:route-policy`、`pnpm check:workmesh-skill` | 通过；`route-policy-generation-retry.log`；固定 Skill 的 LF、摘要、签名保持 |
| `pnpm test` | 失败；私有 APPDATA 复验中连接器 71 项通过、管道及嵌套终端 2 项失败，25/28 个任务成功；`unit-private-appdata.log`。不修改安全规则或超时 |
| `pnpm test:integration` | 本机完整复验失败并停在 DB 阶段：14 文件通过、3 文件失败，68 项通过、7 项失败、6 项跳过；`integration-final.log`。后续包没有由该根命令执行 |
| 定向 API 退役套件 | 6 项真实 PostgreSQL/API 用例通过；`retirement-six.log`；固定 Skill、Cookie/CSRF、通知授权、精确上下文、SSE 重启和真实 worker→fake Agent 审批纵向 |
| 企业微信通知集成 | 19 项通过；包含完整旧哈希校验、合法待发/显式 retry、篡改拒绝、撤权、并发 claim/fence、checkpoint 回滚和不确定投递零自动重发；CI 原件另验 |
| 留存升级维护脚本 | 定向 33 项通过；`unit-targeted-retry.log`；维护、freeze、停止和恢复门禁保持 |
| `pnpm smoke:agents:ci`、`pnpm test:conformance` | 本机通过；六组 adapter/fixture 结果不代替真实集成协议或镜像部署 |

宿主完整检查失败不表示通过。数据库 DDL/TRUNCATE 等待 DataFileImmediateSync 与本机资源压力均有诊断原件；没有关闭 fsync、增加 hook 时限、改变数据库合同或重启共享 Docker。管道/ConPTY 的宿主失败只按观察记录，不把不同 Node 的 CI 成功冒成本机修复证明。

## CI 与真实部署

运行 `38176577167` 绑定产品提交 `7209be0641cc224b19b88bc36b0d3a03996b0b63`。实际 PR 合成检出 `47faa50156178fccebf3d6ea2db33c11550688f5` 的 tree 与分支提交相同；父提交、三平台前后源码绑定、开发镜像与恢复报告见 `ci-artifacts/verified-bindings.json`。API 29 文件通过、304 项通过/1 项跳过，DB 17 文件/81 项通过；MCP 真实集成协议 6 文件/96 项通过。源码、三平台原生连接器、三后端开发镜像无缓存构建、正常 postinstall 和完整灾备通过。恢复后 API、worker、MCP ready、真实 MCP 初始化与持久 Agent heartbeat 均通过。

该次 worker 有一个 Web Push 完整 URL 断言首败，Required 失败；已按明确配置 API origin 修正，后续 CI `38178554946` 的 worker 检查通过。首败 ZIP 保留，见 `ci-artifacts/test-summary-7209.json`。取消的中间 CI 不当通过；最终 Required 仍须对最后交付 head 核验。

本机 Lite `backend-lite-47db4f07` 实际完成镜像构建、save/load 身份、三个角色加载、无源码 API/worker 安装和测试 CA/TLS 下真实 worker 精确上下文，随后 Skill 验收因脚本把配对创建的 201 写成 200 而失败。已纠正调用为合同的准确 201，原件在 `runs/backend-lite-47db4f07/34.log`。该次不能标完整部署通过。后续本机独有 builder 的 pnpm 下载网络失败在 `runs/backend-lite-558fdf2d`，没有进入产品验收。

必需源码检查现执行 `python3 scripts/validate-development-images.py`、`node scripts/verify-a2-backend-lite.mjs` 和 `pnpm validate:production-images`。Lite helper 从真实镜像运行 `sh infra/lite/verify-image-roles.sh <该轮镜像>`，覆盖三角色与未知/MCP 拒绝；两类部署都从 discovery 校验后授权配对兑换，再使用 `redeemed.skill.download_url` 真实 HTTP 核对 Git blob、镜像内原件、响应字节及 Ed25519。生产还执行 MCP initialize→verify_connection→get_workmesh_context。CI 原件中的实际执行和结果将在完成后补充，不能用静态 validator、假资产或注入 worker 代验。

## 保留、收尾与交接

52 个原测试源、23 个既有后端目标及新迁入套件见 `backend-assertion-map.json`；它们是精确源码去向，不是全部通过声明。纯页面和视觉项退役；79 份截图/基线按原字节保全。41 个已审方案/规格/答复来源逐字复核相同；固定写作规范按原来源手检，没有全局安装。终端原字节 ZIP 与阅读视图 SHA 分别登记，未放宽全仓空白规则。

资源清理、原拒绝路径保留和私有依赖去向见 `cleanup.md`。尚未在真实低功耗设备、真实通知厂商或正式生产环境验证；没有发布。本轮回成果 review，方案通过不等于产品通过。独立成果审查闭合 blocking/high、最终 head 的最新适用 Required CI 成功并确认 PR/main 实际落地前，不 merge 或 Done；后续顺序保持退役→接入文档初版→既定客户端适配→后续交付。

CI `38178554946` 的 Lite 实际部署（`backend-lite-e07a9c8f`）完整通过，原件在 artifact `11717163412`；实际源码为 PR 合成检出 `811b3cb356ba1688d784eb8eee6ee3f6782500d1`。生产三个镜像构建和 save/load 通过，随后探针把生产入口当作 Lite 的分派入口而失败；`backend-production-4978c9fa/26.log` 显示实际启动了 API。修订探针读取真实生产 Compose migrate command，并分别核对实际服务启动日志；不改生产入口或放宽无源码部署、ready、TLS、Skill 与 MCP 后续要求。首败原 ZIP 保留，本轮产品验收仍待复验。

CI `38179856023` 的 API/协议、worker、DB、灾备和三平台原生全部成功；Lite 再次完整通过。生产迁移、API 入口探针及三个镜像构建/save-load 通过，worker 实际进入 readiness 后按不可达数据库预期报 `WORKER_STARTUP_FAILED`，验收脚本只识别 identity 阶段，因而失败。artifact `11717457465` 的 `backend-production-f85136c6/30.log` 保留原输出；按 worker 现有源码补齐两种实际启动阶段日志，并继续要求后续真实 Compose ready/worker/Skill/MCP 全部通过。该首败没有标成生产通过。

投递链接复核发现直接使用配置 URL 会保留 userinfo；Web Push 改为 URL origin 标准化，既有真实 PostgreSQL 成功投递用例使用带测试用户名/密码/查询/fragment 的配置并仍要求无凭据的准确 API 链接，原幂等、订阅撤销与状态断言保持。仅修正链接构造，不改权限、数据或发送门禁。
