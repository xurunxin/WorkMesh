# API/MCP 接入手册

## 读者与目标

本手册面向接口开发者和 Agent 客户端作者。读完后，你可以登录 Human API、配对 Agent、核实 MCP 身份，并运行最小读取示例。

WorkMesh 对外提供 REST API。API 的全称为 Application Programming Interface，中文为“应用程序接口”。REST 的全称为 Representational State Transfer，中文为“表述性状态转移”。Agent 也可使用 MCP（Model Context Protocol，模型上下文协议）。

内置 WebUI 已退役。SDK（Software Development Kit，软件开发工具包）、连接器和外部 Runner 保留。

## 阅读顺序

| 文档 | 要完成的操作 |
| --- | --- |
| [环境与快速上手](getting-started.md) | 确认服务地址、配置和工具链，运行示例 |
| [Human 与 Agent REST](rest.md) | 登录、发送写请求、配对和读取事件 |
| [MCP 身份与调用](mcp.md) | 选择凭据模式，发现能力并调用工具 |
| [接口参考](reference.md) | 查找当前端点、合同和客户端实现 |
| [错误与恢复](troubleshooting.md) | 处理拒绝、冲突、丢响应和 Stop |

首次安装与升级使用[纯后端部署说明](../backend-only-deployment.md)。生产与 Lite 的镜像、TLS 和保卷要求分别见[生产说明](../production-deployment.md)和 [Lite 说明](../../deploy/lite/README.md)。本手册不另设文档服务。

## 当前边界

功能开关与授权分别生效。默认关闭的 Beta/Experimental 能力须由部署方显式启用；调用者还须拥有实时权限。工具出现在发现结果中，也须在调用时通过目标范围、revision、Lease 和批准检查。

OpenAPI、共享 Zod 合同和已注册路由决定参数。历史 ADR 的页面流程按 [ADR 0087](../adr/0087-backend-only-service.md)退役；其领域规则仍须结合当前源码判断。后续 B3 的接入恢复字段尚未交付，本手册只描述已有错误字段与客户端行为。

本机回环测试不能证明真实 GHCR 认证、低功耗设备、公网代理或通知厂商可用。设备与正式部署支持范围由部署方另行验证。原生连接器依赖系统秘密存储；仓库命令不等于已发行的独立安装包。

## 文档维护

接口或功能变更须在同次交付中更新相关说明、配置、示例和参考。执行步骤见[同步维护规则](../documentation-maintenance.md)，固定写作技能见[来源与使用方式](../skills/zh-tech-writing/README.md)。本版源码、命令与实际验证见[校验记录](../reviews/api-mcp-docs/verification.md)。
