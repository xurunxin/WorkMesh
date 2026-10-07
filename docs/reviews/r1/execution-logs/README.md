# R1 检查证据

`raw-checks.zip` 与 `raw-checks-index.json` 保存本轮归档前捕获的检查原字节，以及初稿提交中实际存在的日志 Git blob。每条记录区分来源版本、worktree/git-blob、字节数与 SHA-256；新检查没有来源提交时如实为 null，未提交原件的 blobId 是内容对象身份，不冒称已存在于某个提交。

外层 `.log`、错误上下文和 conformance 文本是可读展示副本：统一 LF、移除行尾空白和多余 EOF 空行。原字节（包括空白、失败、时间、请求记录）仍在归档；空文件也单列。重复运行 `node docs/reviews/r1/archive-checks.mjs` 只验证现有归档，不用展示副本覆盖原件。规格校验器同时验证 ZIP 安全边界、CRC/hash 和展示副本对应关系。

目录含初次 bootstrap 长度错误、一次中断、PostgreSQL 启动错误、缺 S3 bucket、私网投递设置错误、Project E2E 超时和缺 npm_execpath 的诊断，以及修正后的根集成/整套 E2E/源码检查成功结果。具体命令、退出码、分类和适用范围见 `../execution-checks.md`。

检查仅使用独立测试数据库/容器、fake Agent/provider 和临时随机测试值；已知随机秘密在捕获时移除，不保存环境转储、数据库、浏览器认证文件或含会话信息的 trace。所存浏览器截图/上下文来自 fake 测试数据，conformance 是本地参考驱动，未发送真实企业微信消息。

这是独立于 G1 的检查包，不修改 G1 的 MD/JSON/ZIP/index，也不把历史 G1 run 当 R1 成功。最终 PR CI 与成果独审尚待 Chief 按精确 head 核验。
