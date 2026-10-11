# 后端化实现与验收入口

本轮依据已独审通过的活动方案实施产品退役。方案审查输入为 `66a3764bb54bef4c1549528f902f78854aa2f3f2`；独立读取远端 `refs/heads/main` 得到 `f2591a3bebeca9640b0d828ac3ad07fb5daf8e3c`，其为本分支祖先。共享 cache 的锁没有删除，未将共享 `FETCH_HEAD` 当主线。

## 实现范围

内置 WebUI、Service Worker、UI workspace、Next 构建、浏览器任务和专用验证入口已退役。固定签名 Skill 迁入 API；生产与 Lite 打包该资产，配对返回 API 兑换定位符，MCP 保持独立 origin。旧定位符仅为加密幂等回执保持兼容，不恢复页面。

保留 Web Push REST、订阅和投递。通知改用既有鉴权 JSON API，旧摘要逐字段重建、严格匹配并保持原值；原投递 checkpoint、revision、claim/fence 和不确定状态门禁继续适用。领域授权、数据库和内部执行服务没有删除，没有新数据库迁移。

CI 删除浏览器 job 后保留七类必要检查，API 变更及 fake Agent/Skill 消费者触发 API 集成。发布清单改为 API、worker、MCP，恢复 smoke 增加 MCP 初始化。目录外 Lite 两脚本采用原生 HTTP、Cookie 和 CSRF；仍执行真实部署 worker、TLS、无源码安装和镜像 save/load，不能由注入测试代替。

## 证据与使用

- [启动与接口安装](../../backend-only-deployment.md)、[服务边界决策](../../adr/0087-backend-only-service.md)。
- [已审活动方案](../../plan/backend-only.md)、[原浏览器与目录外脚本去向](../../plan/backend-only/test-impact.md)、[逐卡衔接](../../plan/backend-only/followup-impact.md)。后续顺序为 #61 → #62 → #7 → #20，未开发能力不标完成。
- `webui-path-receipt.json` 记录逐路径 Git blob 与迁移/退役归属；`webui-history/` 保全原截图与基线，历史规格、审核和首败不改写。
- `platform-source.json` 保全本轮工具实际返回全文及完整 Spec 段，Saved plan 截断单列缺口。已审原件沿用批准提交，`source-preservation.json` 逐文件复核。
- [实际验证记录](test-results.md) 区分首败、复验、未测与正在运行；日志不等于产品全部验收通过。`runs/` 将实际镜像提交、身份、部署、TLS 和定向清理绑定。

中文部署与后端说明按固定来源 `ffda9353768dece8aabd26ccb3a4978025e9437c` 的 SKILL.md、manual-structure.md 和 typography.md 手检；来源文件哈希见已审 `sources/writing-skill.json`。没有全局安装，未发现 autocorrect。原来源文本保持原字节。

## 当前关口

本记录为实施检查点，产品验证仍在执行。方案通过不等于产品通过；完成所有适用验收并提交结果后回 review，由正式成果独审闭合 blocking/high，最终 head 的最新 Required CI 成功并实际合入 main 后才 Done。本次不直接合并，也不实施 B3、后续新领域或外部发布。
