# 后端化实现与验收入口

本轮依据已独审通过的活动方案实施产品退役。方案审查输入为 `66a3764bb54bef4c1549528f902f78854aa2f3f2`；独立读取远端 `refs/heads/main` 得到 `f2591a3bebeca9640b0d828ac3ad07fb5daf8e3c`，其为本分支祖先。共享 cache 的锁没有删除，未将共享 `FETCH_HEAD` 当主线。

## 实现范围

内置 WebUI、Service Worker、UI workspace、Next 构建、浏览器任务和专用验证入口已退役。固定签名 Skill 迁入 API；生产与 Lite 打包该资产，配对返回 API 兑换定位符，MCP 保持独立 origin。旧定位符仅为加密幂等回执保持兼容，不恢复页面。

保留 Web Push REST、订阅和投递。通知改用既有鉴权 JSON API，旧摘要逐字段重建、严格匹配并保持原值；原投递 checkpoint、revision、claim/fence 和不确定状态门禁继续适用。领域授权、数据库和内部执行服务没有删除，没有新数据库迁移。

CI 删除浏览器 job 后保留七类必要检查，API 变更及 fake Agent/Skill 消费者触发 API 集成。发布清单改为 API、worker、MCP，恢复 smoke 增加 MCP 初始化。目录外 Lite 两脚本采用原生 HTTP、Cookie 和 CSRF；必需源码检查实际执行真实部署 worker、TLS、无源码 Lite/生产安装、镜像 save/load、Lite 角色脚本及签名 Skill，生产环境还验证 MCP，不能由注入测试代替。

## 证据与使用

- [启动与接口安装](../../backend-only-deployment.md)、[服务边界决策](../../adr/0087-backend-only-service.md)。
- [已审活动方案](../../plan/backend-only.md)、[原浏览器与目录外脚本去向](../../plan/backend-only/test-impact.md)、[逐卡衔接](../../plan/backend-only/followup-impact.md)。后续顺序为 #61 → #62 → #7 → #20，未开发能力不标完成。
- `webui-path-receipt.json` 记录逐路径 Git blob 与迁移/退役归属，`history-preservation-check.json` 复核 79 份历史原字节与实际提交 blob；`webui-history/` 保全原截图与基线，历史规格、审核和首败不改写。
- `backend-assertion-map.json` 将已审的 52 个测试源绑定到现有 23 个后端测试文件、准确 Git blob 和用例声明；新迁入用例与真实部署入口分别列出。源码索引不代替运行结果。
- `platform-source.json` 保全本轮工具实际返回全文及完整 Spec 段，Saved plan 截断单列缺口。已审原件沿用批准提交，`source-preservation.json` 逐文件复核。
- [实际验证记录](test-results.md) 区分首败、复验、未测与正在运行；日志不等于产品全部验收通过。`runs/` 将实际镜像提交、身份、部署、TLS 和定向清理绑定。`ci-artifacts/` 保全 GitHub 原 ZIP、实际 PR 合成检出及源码 tree、三平台前后绑定、镜像和恢复回执；终端日志原始字节存入 `raw-logs/`，同名 `.log` 为去除行尾空白的阅读视图，二者的 SHA-256 由 `log-source-manifest.json` 分开记录；没有放宽空白门禁。

中文部署与后端说明按固定来源 `ffda9353768dece8aabd26ccb3a4978025e9437c` 的 SKILL.md、manual-structure.md 和 typography.md 手检；来源文件哈希见已审 `sources/writing-skill.json`。没有全局安装，未发现 autocorrect。原来源文本保持原字节。

- `integration-resources.json` 记录本轮 PG/Redis/S3 容器、私有卷的归属与清理后不存在证明；`private-appdata-owner.json` 记录专用 APPDATA 收尾，`development-builder-cleanup.json` 核对首败专用 builder 不存在。共享 store、工作树复验依赖、业务数据及共享 Docker 设置保持。
- `required-status-source.json` 为 GitHub main 严格 `Required CI` 设置的实际读取原件，没有浏览器 context。

- [资源收尾与保留](cleanup.md) 关联私有环境/shim、容器/卷、APPDATA、builder 的实际回执及测试清理边界拒绝目录；未删目标不写成已清除。

## 当前关口

产品代码 `21c1c52552e05553be7f87d87f3da78f90254aa6` 的完整 CI（含 Required CI）、真实 Lite/生产安装、签名 Skill、MCP 与恢复验证已成功，绑定及原件见 `ci-artifacts/verified-product-468.json`。本机失败、跳过及未测范围在实际记录中单列，均不计通过。本轮交付报告与证据后进入成果 review；新增交付提交仍须核其最新 Required CI。方案通过不等于产品通过；由正式成果独审核查实现与验收并闭合 blocking/high，最终 head 的最新 Required CI 成功并实际合入 main 后才 Done。本次不直接合并，也不实施 B3、后续新领域或外部发布。
