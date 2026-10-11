# 方案独审修订说明

## 来源与边界

本轮处理对 `69fa7f4f196c6cef74a792054400530420c705dc` 的两项 blocking。
只修订方案、测试影响、路径影响、索引和校验材料，产品实现仍待正式方案独审及单独放行。

活动方案见 [backend-only.md](../backend-only.md)。
`doc:4L0f8ekmDAa144DUqvFlx` 和 `doc:eeEM_cmzdO-i7EqTiz7XF` 的 Saved plan 原件、规格及原问题答复保持原字节。
[review-corrections.json](review-corrections.json)保存两处精确 old／new 替换及审查提交。
校验器从最新原件应用替换，逐字比对活动方案；不补造平台版本或上游哈希。

## 目录外的 Lite 验证入口

`prepare-inventory.py` 原先只枚举 `apps/web/e2e/`。
现将 `scripts/verify-a2-backend-lite-api.mjs` 和 `scripts/verify-a2-backend-lite.mjs` 纳入源码索引，记录 `assert`、`throw Error` 检查位置、原 Git blob、实施用例、命令和责任。

两份脚本由 #61 就地后端化，保留安装认证、provider 幂等、部署 worker 精确上下文、无源码安装及镜像 save/load 验收。
退役项限于 Playwright 页面、Web 角色和 Next 代理断言；资源归属、TLS 校验和历史回执继续保留。
具体行为与验收去向见 [test-impact.md](test-impact.md#目录外-lite-脚本)。
部署验证执行 `node scripts/verify-a2-backend-lite.mjs`，由外层脚本准备隔离环境并调用内层 API 脚本。
这些产品命令本轮未执行，不能用现有单元或注入式集成测试代替真实部署结果。

## Skill 下载地址来源

原方案写作“从发现返回的 Skill URL 经真实 HTTP 下载”，与现行合同不符。
`packages/contracts/src/index.ts` 中 discovery 使用的 Skill 元数据 schema 严格拒绝 `download_url`，兑换响应扩展该字段且要求存在。
`packages/contracts/src/stage5-contracts.test.ts` 的 `requires the redeem response bundle to carry download_url` 和 `keeps the well-known manifest bundle free of download_url and secret fields` 固定此边界。
`apps/api/src/agent-connections.ts` 的兑换处理器返回 `skill.download_url`。

活动方案现写为：

> 分别启动生产 API 和 Lite API 角色，先校验 discovery，再完成配对兑换，使用 `redeemed.skill.download_url` 经真实 HTTP 下载；

生产与 Lite 均执行此流程。discovery 校验名称、版本、摘要、签名及服务地址；经现有授权创建配对并完成兑换后，从兑换响应取得下载地址。
真实 HTTP 响应体必须与原签名资产、迁移后的 Git blob 和镜像内文件逐字节一致，并通过现有摘要和 Ed25519 签名校验。
不新增 discovery 字段，不重新签名，不使用夹具静态文件代验。

Saved plan 原件仍保留原句，作为历史来源；活动方案和测试影响表已纠正。
文档校验只证明材料、来源和范围一致，镜像下载及其他产品验收仍待实施后执行。
