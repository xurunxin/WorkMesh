# C2 文档归档与审阅入口

本目录仅交付规划、规格及来源证据。没有企业微信产品实现，没有真实发送，没有产品测试通过结论。

完整执行方案见 [implementation-plan.md](implementation-plan.md)，具体产品变更、错误及部署规则见 [product-design.md](product-design.md)，六项原测试、九类和 DoD 的逐项去向见 [test-coverage.json](test-coverage.json)。

平台完整执行输入为 [savedplan-8K46xBWutJwsqCy89K5Oq.md](savedplan-8K46xBWutJwsqCy89K5Oq.md)。原计划 G27jedfwL5ikAj9GiLO1R、修订输入 vYxCwh0TMRC3mOrr6cU1K 分别保留自己的正文与配套 JSON；旧正文中的 ID 误标是历史审查问题，未覆写冻结来源。两次更早用户消息中的完整 saved copy 提供旧正文，本轮用户消息提供执行正文；[platform-readbacks.json](platform-readbacks.json) 只读回 ID、顺序和当前 spec，todos 的 Saved plan 尾部截断不是完整正文读取。

每份正文从第一个标题到最后一个句号，去除容器和边界换行，原样 UTF-8 编码；保留内部两空格空白行，无末尾换行。目录内 .gitattributes 仅为源快照禁止换行转换，并将冻结 savedplan 的原有空白行及官方正文原有空白从 Git 空白规则中排除；响应体和原始 HTML 片段按二进制展示，不改写源字节。首次空白检查原件保留在 reviews/c2。可编辑的执行说明清理复制空白，不改变生产、测试或 CI 规则。工作树与 Git blob 的独立哈希见 [source-metadata.json](source-metadata.json) 和 [MANIFEST.json](MANIFEST.json)。

[current-spec.md](current-spec.md) 是本轮完整平台 spec，包括 Chief 的文档执行放行；[source-spec.md](source-spec.md) 是 R1 输入原文，哈希必须等于 d10a822ffae21cb94fcce3f9c7c198845bb3f3380358c5915ad5dea9673968fd。历史来源文件保持不变。

官方资料本轮以 HTTPS GET 取得，不涉及消息发送。完整响应在 official/*.response.bin，正文 HTML 原片段在 *.body-source.txt，可读正文在 *.body.txt；[official/retrieval.json](official/retrieval.json) 记录精确 URL、UTC 读取时间、HTTP 状态、响应头及提取边界。浏览工具访问失败的实际返回另保存在 platform-readbacks.json。早期读取没有保全完整响应、生成时间或 callID 的缺口不伪补；本轮重新捕获的响应不冒作早期原件。

[../../reviews/c2/verification.json](../../reviews/c2/verification.json) 记录本阶段文档校验和资源情况。推送后停止在 review，等待 Chief 安排另一 Agent 读取仓库方案独审；既有 plan-review 只允许归档，不表示产品方案已独审通过。最终产品验收仍要求全部适用测试、当前 Required CI、真实 main 落地及 Chief 确认。
