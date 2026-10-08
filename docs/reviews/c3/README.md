# C3 实施与验收交接

本次实现八家国内提供方及 OpenAI 的只读预置目录。目录带官方出处、地区、核对日期与确认方式；选择只填可编辑草稿，连接保存和模型登记分别由用户显式提交。没有数据库迁移、新领域事件、提供方探测或付费调用。

## 输入与审查边界

完整计划见 [c3-model-presets.md](../../plan/c3-model-presets.md)，当前完整规格见 [current-spec.md](current-spec.md)，来源与内容哈希见 [input-binding.json](input-binding.json)。历史 R1 规格、快照与前置计划交接保持历史含义；本次未重复保存平台计划，未提供的平台版本字段保持 `null`。

当前产品改动在原会话工作区，交由平台正常提交与推送；不把此前远端仅计划交接提交称为产品交付。独立审核、最新 CI 与 Chief 确认仍是后续门禁，本文件不代替它们。

## 行为与部署

- 默认关闭的 `WORKMESH_BETA_MODEL_PRESETS` 控制公开只读 `GET /api/v1/workbench/model-presets`；没有目录写接口。部署文件及网关地址会出现在公开响应中，文件不得含凭据。
- 启用并设置 `WORKMESH_MODEL_PRESETS_FILE` 时，完整本地 JSON 替换内置目录，再过滤该目录的 `disabledIds`。关闭时不读文件；启用后缺失、非法文件和未知禁用 ID 阻止启动。目录冻结，文件更改须重启生效。
- 保存继续通过既有 `normalizeLlmBaseUrl`、私有主机授权和 allowlist。预置不验证凭据，保存不验证可达性或兼容性。

部署步骤与只读挂载示例见 [production-deployment.md](../../production-deployment.md)。官方逐家核对和读取缺口见 [official-source-review.md](official-source-review.md)、[official-sources.json](official-sources.json)：百炼地域与业务空间域名、Coding Plan 专属端点、国际 Key 与支持地区不能互相推导；火山重读返回 JavaScript 空页的限制明确保留。核对字段不表示实际服务调用成功。

## 演示与验证

启用目录后打开 `/settings/agent-workbench`，选择预置并查看出处，编辑 URL 与模型草稿；刷新目录保持编辑。用户填写凭据后点击保存服务，新连接没有自动登记模型。再填写能力上限并显式登记模型；刷新页面后凭据不回显。此链路不访问提供方服务。

原验收、九类适用性与 DoD 映射见 [test-coverage.json](test-coverage.json)，逐命令结果和失败记录见 [results.json](results.json)。必需检查的实际结果如下：

| 检查 | 本轮结果 |
| --- | --- |
| `pnpm lint`、`pnpm typecheck` | 各自完整运行成功 |
| `pnpm run test -- --maxWorkers=2` | 完整单元集合：1675 通过、2 个 Linux 专属用例跳过；未改超时或断言 |
| `pnpm test:integration` | 313 通过、2 跳过；包含显式启用的恢复集成。跳过真实 MiniMax 调用和可选保留升级测试 |
| `pnpm test:e2e` | 全量 68 通过、无跳过；此前定向列表与实际运行均为 3 项，全部通过 |
| 路由策略、CI 配置、双语文案校验与 API 构建 | 均成功 |
| 部署产物与只读卷 | 加载器、目录 JSON、契约字节一致；两次启动各五次读取、完整替换、禁用过滤及文件字节不变均通过 |

已在精确实施前提交 `8aee051c23eca1fc7653f688d6570c5808c0011d` 与产品提交 `c0bb931bf5dbf5c297835ee321b4de69f47e7695` 的独立源码副本、同一环境下各执行全部 **47 项**模拟浏览器回归：两者均 **15 通过、32 失败**，零跳过、零 flaky。原报告 32 项已逐项对应，47 项状态、逐用例 timeout 与全部失败指纹一致；本组未发现新增回归，未分类项为零。模拟套件仍失败，相同首个失败后未执行的步骤不计通过。

逐项原因、实际断言及源码绑定见 [mocked-regression-comparison.md](mocked-regression-comparison.md)、[mocked-regression-comparison.json](mocked-regression-comparison.json)。Settings 旧路由、Operations 选择器、溢出、sticky、焦点及 Home URL 时序分别有可执行对照，不再以单个 Agent 夹具解释全部失败。本轮只追加审查证据；未修改产品、删除断言或增加超时，也未使用正式 E2E 的历史通过替代这部分验收。原报告和失败原件保留，仍交独立复核与最新 CI 门禁。

本轮原始报告、日志、DOM、截图及几何附件见 [mocked-regression-evidence.zip](mocked-regression-evidence.zip)，无损字节与 CRC 索引见 [mocked-regression-evidence-index.json](mocked-regression-evidence-index.json)。Git blob 与 Windows 归档副本的 CRLF 字节分别绑定于 [mocked-regression-sources.json](mocked-regression-sources.json)，可运行 `python -X utf8 docs/reviews/c3/fixtures/verify-regression-evidence.py` 独立核验；不混称 Git 字节与运行字节。

日志及大小/哈希索引见 [execution-logs.zip](execution-logs.zip)、[execution-log-index.json](execution-log-index.json)；浏览器失败原件见 [browser-failures.zip](browser-failures.zip)、[browser-failure-index.json](browser-failure-index.json)。测试秘密与认证状态不进入提交，原始 trace 的保留边界写入索引。早期状态码预期、注册表数量、部署硬链接误改、挂载/链接准备失败、超时及 Machine offline 中断均留档，不以最后成功覆盖历史失败。

产品/输入的工作区与暂存 Git blob 字节分别绑定于 [source-binding.json](source-binding.json)；已有计划当前 ID 的实读绑定见 [current-plan-readback.json](current-plan-readback.json)。不把本地 dirty 检查冒称未来提交 CI 或合入验收。

## 资源收尾

本任务资源归属、完整 ID/路径、操作与结果见 [resources.json](resources.json)。必要脱敏证据保存后，已逐项移除本任务五个命名测试容器及五个专用测试卷；临时验证容器由 `--rm` 自动移除。没有创建专用镜像或网络，共享基础镜像未删除，未使用 global prune。服务和临时路径的最终清理结果以该登记为准。

独审返修新增资源的实际 ID、测试副本路径及清理结果另见 [mocked-regression-resources.json](mocked-regression-resources.json)；保留历史资源登记，不覆盖上轮清理记录。

当前 dirty 工作区、源码与已归档证据保留。测试端口已被其他工作区复用的服务未操作；仅凭端口不判断资源归属。旧 worktree 未满足实际合入、成果保全且无人引用条件，本次不删除。临时配置只进入测试子进程；部署准备误改的包声明已恢复，产品配置示例保留为本次正式改动。
