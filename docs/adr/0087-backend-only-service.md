# 纯后端 API/MCP 服务交付

Status: Accepted

## Context

用户已裁定长期退役内置 WebUI，保留 API/MCP，并优先于后续功能合入。正式方案独审已通过；本轮产品实施单独放行。旧页面延期或重新设计要求不再作为当前交付范围，历史规格、Saved plan、独审和首败保持原件。

## Decision

移除 Web workspace、UI 包、浏览器测试与发布入口。将签名 Skill 原字节移至 API 固定下载路径，配对定位符指向现有兑换接口，MCP 继续使用独立 origin。Human REST、Cookie/CSRF、领域授权和业务数据保持。

保留 Web Push 服务端订阅、撤销和投递合同。新通知使用鉴权 API 链接；旧 request_hash 全字段兼容校验和投递状态机保持。sending/uncertain 不自动重发。

## Alternatives

此前 WebUI 延期与重新设计安排按用户新裁定退役。

## Consequences

客户端不再获得内置登录或管理页面。CLI、SDK、连接器、worker、数据库、对象存储和外部 Runner 保留。浏览器曾承担的后端断言迁入 API、worker、协议或真实部署验收；纯页面断言登记退役，不能标通过。

## Migration

无新增数据库迁移。部署直接公开 API，删除 Web 镜像要求和 Next 参数。签名 Skill 保持原字节、摘要及签名。CI 删除浏览器 job，Required CI 继续对所需后端检查拒绝缺结果、失败和非计划跳过。

## Spec changes

本次精确方案与纠正见 `docs/plan/backend-only.md` 和 `docs/plan/backend-only/review-corrections.md`。后续逐卡范围见 `followup-impact.md`：先本卡实际合入，再接入文档初版，随后已批准的 API/最小客户端功能。接口或功能更新同次维护文档，不夹带新领域或自动恢复。
