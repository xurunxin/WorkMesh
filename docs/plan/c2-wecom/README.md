# C2 文档归档与审阅入口

本目录仅交付规划、规格及来源证据。没有企业微信产品实现，没有真实发送，没有产品测试通过结论。

完整执行方案见 [implementation-plan.md](implementation-plan.md)，具体产品变更、错误及部署规则见 [product-design.md](product-design.md)，六项原测试、九类和 DoD 的逐项去向见 [test-coverage.json](test-coverage.json)。

平台完整执行输入为 [savedplan-8K46xBWutJwsqCy89K5Oq.md](savedplan-8K46xBWutJwsqCy89K5Oq.md)。原计划 G27jedfwL5ikAj9GiLO1R、修订输入 vYxCwh0TMRC3mOrr6cU1K 分别保留自己的正文与配套 JSON；旧正文中的 ID 误标是历史审查问题，未覆写冻结来源。两次更早用户消息中的完整 saved copy 提供旧正文，本轮用户消息提供执行正文；[platform-readbacks.json](platform-readbacks.json) 只读回 ID、顺序和当前 spec，todos 的 Saved plan 尾部截断不是完整正文读取。

每份原始计划正文从第一个标题到最后一个句号，去除容器和边界换行，保留内部两空格空白行及原有末尾边界。原始正文、官方响应和正文提取原件均无损保存到 [raw-evidence.zip](raw-evidence.zip)；[raw-evidence-index.json](raw-evidence-index.json) 按旧路径、来源提交、工作树/Git blob 分别登记字节数、SHA-256 和内容寻址 member，相同字节共用 member。读取不依赖旧 Git 对象，使用 G1 校验器验证路径、普通文件、完整成员、CRC、双哈希及 Git blob ID。

独立 savedplan Markdown 和官方 *.body.txt 现在是清理行尾空白、展开制表符的可读副本，不冒作原字节；配套 JSON 的原 bytes/sha256 和 body 保持原义，新增 rawEvidence/readableCopy 明确两类来源。原始响应与 HTML 片段不再保留独立副本，先验证 ZIP 与原件逐字节一致后才移除。目录属性不设置 whitespace 豁免或 -diff，ZIP 由 Git 自行判为二进制；所有可读副本正常接受既有 git diff --check。工作树与 Git blob 的当前哈希见 [MANIFEST.json](MANIFEST.json)，旧来源哈希见 [source-metadata.json](source-metadata.json)。

首次空白检查原件及旧校验原件保留在 reviews/c2。旧检查使用空白豁免所得的退出零不证明 CI 门禁通过；修正记录见 [review-fixes.json](../../reviews/c2/review-fixes.json)，本次重新检查完整 origin/main...HEAD 范围，不修改 CI 策略。

[current-spec.md](current-spec.md) 是本轮完整平台 spec，包括 Chief 的文档执行放行；[source-spec.md](source-spec.md) 是 R1 输入原文，哈希必须等于 d10a822ffae21cb94fcce3f9c7c198845bb3f3380358c5915ad5dea9673968fd。历史来源文件保持不变。

官方资料本轮以 HTTPS GET 取得，不涉及消息发送。完整响应、正文 HTML 原片段及提取文本的原字节在 ZIP，按索引中的旧 official 路径读取；可读正文仍在 *.body.txt。[official/retrieval.json](official/retrieval.json) 保留精确 URL、UTC 读取时间、HTTP 状态、响应头及提取边界，并补充 ZIP 读取映射。浏览工具访问失败的实际返回另保存在 platform-readbacks.json。早期读取没有保全完整响应、生成时间或 callID 的缺口不伪补；本轮重新捕获的响应不冒作早期原件。

[../../reviews/c2/verification.json](../../reviews/c2/verification.json) 记录本阶段文档校验和资源情况。推送后停止在 review，等待 Chief 安排另一 Agent 读取仓库方案独审；既有 plan-review 只允许归档，不表示产品方案已独审通过。最终产品验收仍要求全部适用测试、当前 Required CI、真实 main 落地及 Chief 确认。
