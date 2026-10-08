# C3 官方资料核对记录

本文件是规划交接材料，与 [完整计划](../c3-model-presets.md) 一起供独审读取。详细字段和短摘录见 [official-sources.json](official-sources.json)。记录生成于本轮文档前置；不是最终预置目录，不表示任何模型已运行或账号已开通。

## 核对方式与结果含义

仅通过 web 的官方文档读取核对资料，没有访问模型推理、模型列表鉴权 API、付费服务或登录控制台。机器确认表示已读到所述资料；不是凭据确认、网络可达确认或 WorkMesh 协议兼容确认。未取得有效正文和未完成模型交叉核对均保留为待补事项，不凭搜索摘要补齐字段。

远端页面不是事务快照。每条 sourceUrl、实际重定向来源、定位说明和本地短摘录保存在 JSON 中；本地 SHA-256 仅绑定这些核对记录的字节，不声称归档了完整远端页面。

## 提供方结果

| 提供方 | 官方材料与读取结果 | 本轮核对到的字段与条件 | 实施前待补 |
| --- | --- | --- | --- |
| MiniMax | [官方资料](https://platform.minimax.cn/docs/api-reference/text-openai-api)；正文已读取 | `https://api.minimax.cn/v1`；正文明确预览模型仅经 M Plan 与 MiniMax Code 提供。入门示例不能直接当标准按量条目；标准 API 选型与账号条件尚待单独核对。 | 标准按量模型及对应调用说明交叉核对 |
| DashScope | [官方资料](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)；正文已读取 | `https://dashscope.aliyuncs.com/compatible-mode/v1`；北京等地区已推荐业务空间专属域名，文档说明原域名继续使用；业务空间域名需部署方真实 WorkspaceId。Key 按地区绑定。固定北京域名及所选模型需实施前复核，不生成示例 WorkspaceId。 | 实施前复核固定域名、模型地域和开通条件 |
| 智谱 | [官方资料](https://docs.bigmodel.cn/cn/guide/start/model-overview)；模型概览正文已读取，调用说明读取失败 | 模型概览不足以确定标准调用 URL 和现有 apiType；不能从概览营销文案推出 WorkMesh 兼容性。 | 重读官方标准 API 调用说明，确定 URL、协议与精确模型 ID |
| Moonshot·Kimi | [官方资料](https://platform.kimi.com/docs/get-api-key)；入门和模型列表正文已读取 | `https://api.moonshot.cn/v1`；记录中国站端点和使用该平台 Key 的要求；不加入国际区。模型能力和示例额外参数不自动填入配置。 | 实施前核对所选模型的精确字段及标准计费入口 |
| DeepSeek | [官方资料](https://api-docs.deepseek.com/zh-cn/)；入门正文已读取，模型价格页读取失败 | `https://api.deepseek.com`；官方示例使用无额外路径的 base URL。旧模型别名的服务变化仅作出处维护依据，不沿用本机探测结论。 | 补读当前模型列表，交叉核对最终 modelId |
| 火山 | [官方资料](https://docs.volcengine.com/docs/ark/quick-start?lang=zh)；快速入门正文已读取，认证说明页未取得有效正文 | `https://ark.cn-beijing.volces.com/api/v3`；北京地区，示例使用标准模型 ID；不填虚构 ep 接入点。账号开通与认证条件仍须完整复核。 | 补读官方认证和模型列表、确认标准调用开通条件 |
| SiliconFlow | [官方资料](https://docs.siliconflow.cn/docs/userguide/quickstart)；入门正文已读取 | `https://api.siliconflow.cn/v1`；中国站示例，modelId 中的 Pro/ 和供应方路径须原样保留；控制台模型列表未登录读取，不声称当前账号已开通。 | 从可读官方模型资料交叉核对示例模型的当前状态 |
| 百度千帆 | [官方资料](https://cloud.baidu.com/doc/qianfan-docs/s/Fm9l6ocai)；SDK 说明和模型列表页面已读取；列表返回正文范围未确认精确模型项 | `https://qianfan.baidubce.com/v2`；示例为 API Key 调用；不把管理 API 的 AK/SK 鉴权混入配置。modelId 为正文示例，还需与当前列表精确交叉核对。 | 确认当前模型列表中精确条目及地区条件 |
| OpenAI | [官方资料](https://developers.openai.com/api/docs/quickstart)；入门、模型列表和支持地区正文已读取 | `https://api.openai.com/v1`；全球条目按官方支持地区使用；支持地区页面没有列入中国大陆，不能写中国大陆可达。账号、模型权限与部署网络均未经验证。 | 实施前再次确认支持地区和精确模型条目 |

## 定向复核重点

- MiniMax：[官方 OpenAI SDK 文档](https://platform.minimax.cn/docs/api-reference/text-openai-api) 的入门示例模型带专属套餐限制。当前计划要求标准文本 API，不能机械将预览示例当作标准按量条目；本轮没有冻结最终 modelId。
- DashScope：[官方接口说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope) 推荐北京等地区的业务空间专属域名，并说明旧域名继续使用。WorkspaceId 必须来自部署方真实业务空间，不能编造；首批固定域名记录须保留地区 Key 条件和专属域名说明。[官方模型页](https://help.aliyun.com/zh/model-studio/models) 已读取，但不由此推断账号已开通。
- OpenAI：[支持地区](https://developers.openai.com/api/docs/supported-countries) 未列中国大陆。首批全球条目只是用户批准收录的资料，不保证中国大陆网络可达。已读取 [入门](https://developers.openai.com/api/docs/quickstart) 和 [模型列表](https://developers.openai.com/api/docs/models)，没有发送真实 API 请求。
- 智谱：已读 [模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview)，标准调用说明多次读取失败；URL、现有 apiType 和精确模型标识的组合尚未完成官方复核。不能用本地历史配置或其他提供方资料代替。
- 火山：通过 [快速入门](https://docs.volcengine.com/docs/ark/quick-start?lang=zh) 的正文读取到北京端点及 Responses 示例，认证说明页没有有效正文。模型开通条件须补读，不能填虚构 ep 标识。
- DeepSeek、SiliconFlow、千帆：示例 modelId 的当前状态或模型列表交叉核对仍需完成，不能把历史示例或模型能力上限作为已验证配置。
- 所有提供方：目录不得填入凭据或已验证标志；本地既往探测不能代替当前条目的官方出处，也不能推广为兼容性结论。

这些待补资料是实施时的目录内容验收事项；本轮只交付可读的规划材料，产品测试全部未运行。
