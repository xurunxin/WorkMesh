# 独审问题修订验证

## 修订范围

独审输入为 PR 223 的 `9fee9858bdaa03693401159013055ebcf41a284a`。本轮修订 REST 鉴权说明、README 和快速上手的 Compose 命令，并为现有示例验收补直接 REST 正反例。API、SDK、MCP 和 Compose 的业务实现均未改动。

[REST 说明](../../../integration/rest.md)明确 C 请求用 `X-WorkMesh-Installation-Token`，E 请求用准确 Session Bearer。安装用途的 token exchange/refresh 另要求安装 Bearer。SDK 的 `coordinationToken` 和 `installationToken` 分别用于这些调用路径。

[README](../../../../README.md)和[快速上手](../../../integration/getting-started.md)明确默认开发 Compose 不传 Coordination 开关。镜像接入使用完整生产 Compose 命令，提供私有环境文件、同源镜像、build SHA、秘密和两个 HTTPS origin。旧栈升级继续使用既有退役与迁移屏障。

## 实际验证

Windows 本机使用局部 Node 22.19.0 和 pnpm 9.15.4，复用现有可写依赖及共享 store。工具来源与哈希见 [runtime.json](runtime.json)。使用已有测试 CA，两个不同的回环 HTTPS origin 和本人独有 PG/Redis，保持 TLS 校验。没有真实第三方调用或生产凭据。

| 命令 | 结果与边界 |
| --- | --- |
| `pnpm verify:integration-examples` | 通过。直接 REST header 返回 200，schema、Connection、Actor、Team、principal、能力和指纹均匹配；相同令牌改用 Bearer 返回 401/UNAUTHENTICATED。原有 Human/Agent CLI、SDK/MCP、签名 Skill、幂等、revision 与拒绝例也通过 |
| `python docs/reviews/api-mcp-docs/review-fixes/check-compose.py` | 通过。生产及开发 Compose 分别解析 true/false 四组测试配置；生产 API/worker/MCP 收到对应开关，开发配置三者均无该环境项。静态凭据均为空 |
| `pnpm check:integration-docs` | 通过；最新链接、端点和技能计数见 [checks.json](checks.json)。仅静态引用检查 |
| `pnpm --filter @workmesh/conformance typecheck` | 退出码 0，实际执行 `tsc --noEmit`。pnpm 对 C:/I: 工作树路径别名打印筛选提示，随后明确执行目标 workspace；不计提示本身为成功证据 |
| `git diff --check` | 工作树修改通过；提交后另核完整 main 至修订 head 区间，避免遗漏新文件 |

真实请求日志见 [examples.log](examples/examples.log)，准确命令、UTC 时间、退出码及容器/卷不存在回执见 [results.json](examples/results.json)。Compose 只保存开关与静态凭据为空的投影，详见 [compose-results.json](compose-results.json)。临时测试环境文件已移除；未保存完整 Compose environment。

记录中的 `sourceHead` 为修订前基线，运行时包含未提交修改。本次涉及文件的工作树原字节、LF 等价哈希与基线 Git blob 见 [source-files.json](source-files.json)，不能将这些修改冒作已经位于旧 head。提交后已逐文件核对 `e1f6f9149786302af22458ffbca3838a43007b26` 的 11 个运行/合同文件，仅接受 CRLF/LF 等价。完整 main 至该提交的空白检查通过；随后只补本段与两份验证回执，不改运行源码。

## 写作、资源与交付

继续使用固定 zh-tech-writing 主文件和两份参考。读者目标为选择正确凭据与启动现有 Coordination 配置。通读修改文档，对照全部 AI 腔项，手检中英文空格、全角标点、引号、括号、缩写和标题。`autocorrect` 仍缺失，未安装全局工具。

2 个容器、2 个卷、API/MCP/TLS 监听器和数据库池均已按本人归属关闭。局部工具按登记收尾；私有依赖保留供复审，共享 store、历史证据和原 195 个拒绝目标未触碰。工具收尾回执见 [runtime.json](runtime.json)。

本轮只核配置解析，不拉取生产镜像或启动生产栈。真实 GHCR、正式公网代理、设备与通知厂商仍未测。两项修订仍须独立复审，最终 head 的 Required CI 通过后才按正常流程标 ready、合入。
