# C3 官方资料核对

本次仅阅读公开官方资料，不携带凭据，不访问推理、模型枚举或鉴权 API。机器确认表示资料核对，不代表 WorkMesh 调用成功。核对日期与结构化记录见 [official-sources.json](official-sources.json)，产品字段见 [内置目录](../../../apps/api/src/data/model-presets.json)。既往规划前置记录仍保留未定稿状态；本文件记录本次选定字段。

| 提供方 | 调用说明与交叉核对 | 选定内容及条件 |
| --- | --- | --- |
| MiniMax | [OpenAI SDK](https://platform.minimax.cn/docs/api-reference/text-openai-api)、[标准文本 API](https://platform.minimax.cn/docs/api-reference/text-post) | `https://api.minimax.cn/v1`、`openai-completions`、`MiniMax-M3`。SDK 环境变量与模型表交叉核对标准 API 的 model 枚举。SDK 入门示例是受 M Plan/MiniMax Code 限制的 Flash Preview，因此本条选标准模型表中的 M3；不使用原生 chatcompletion_v2 路径。 |
| DashScope | [调用说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)、[模型列表](https://help.aliyun.com/zh/model-studio/models) | 北京固定域名 `https://dashscope.aliyuncs.com/compatible-mode/v1`、`qwen3.8-max`、`openai-completions`。文档保留原域名，新接入推荐真实业务空间专属域名；Key、模型权限和地域必须对应，不构造 WorkspaceId。 |
| 智谱 | [快速开始](https://docs.bigmodel.cn/cn/guide/start/quick-start)、[模型概况](https://docs.bigmodel.cn/cn/guide/start/model-overview) | cURL 的 `/api/paas/v4/chat/completions` 去除协议后缀，填 `https://open.bigmodel.cn/api/paas/v4`、`glm-5.3`、`openai-completions`。Coding Plan 专属端点不可混用；此前 SDK 专页超时，本次快速开始正文已成功读取。 |
| Moonshot·Kimi | [获取 Key 与调用示例](https://platform.kimi.com/docs/get-api-key)、[模型列表](https://platform.kimi.com/docs/models) | 中国区 `https://api.moonshot.cn/v1`、`kimi-k3`、`openai-completions`；国际平台凭据及域名不能直接混用。 |
| DeepSeek | [首次调用](https://api-docs.deepseek.com/zh-cn/)、[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) | `https://api.deepseek.com`、`deepseek-flash`、`openai-completions`。PARAM 表与样例一致；不从官方标注的上下文或其他能力推断本机可用性，不填写能力上限。 |
| 火山引擎 | [快速入门](https://docs.volcengine.com/docs/ark/quick-start?lang=zh)、[模型列表](https://docs.volcengine.com/docs/ark/model-list?lang=zh) | responses 示例的 `https://ark.cn-beijing.volces.com/api/v3`、`doubao-seed-2-1-pro-260628`、`openai-responses`。正文曾成功读取，重读有 JavaScript 空页；官方模型列表的索引正文交叉核对该标识，保留此读取限制，不声称完整页面快照。按北京账号与开通条件使用，不生成 ep 接入点。 |
| SiliconFlow | [快速上手](https://docs.siliconflow.cn/docs/userguide/quickstart)、[更新公告](https://docs.siliconflow.cn/docs/release-notes/overview) | `https://api.siliconflow.cn/v1`、`Pro/deepseek-ai/DeepSeek-R1`、`openai-completions`。公告列出该模型的服务调整；保留 Pro 路径，使用中国平台 Key，账号权限、余额及服务状态由用户核对。 |
| 百度千帆 | [Python SDK调用](https://cloud.baidu.com/doc/qianfan-docs/s/Fm9l6ocai)、[模型列表](https://cloud.baidu.com/doc/qianfan-docs/s/7m95lyy43) | `https://qianfan.baidubce.com/v2`、`deepseek-r1-distill-qwen-32b`、`openai-completions`。SDK 入门示例与模型列表 DeepSeek 蒸馏版一致，使用 API Key 而非旧 AK/SK/OAuth 端点。 |
| OpenAI | [入门](https://developers.openai.com/api/docs/quickstart)、[模型列表](https://developers.openai.com/api/docs/models)、[支持地区](https://developers.openai.com/api/docs/supported-countries) | `https://api.openai.com/v1`、`gpt-6-astra`、`openai-responses`。入门 responses 示例与模型标识交叉核对；仅限官方支持的国家和地区，中国大陆未列入，需满足项目、账号和模型权限。 |

出处是可回查链接与字段核对记录，不是完整远端页面快照。未来变更按官方最新资料复核；地区、业务空间、Coding Plan 与国际域名不互相推导。此次没有真实探测或付费调用。
