# 精确来源与生成时序

## 平台与Git来源

项目：`DzkLDn6UW-IbfoTJzN9Ro`；todo：`pMO6s_SmEL_d81kjKm6S1`；当前平台doc：`K7ASX6igBDq85SckGcuui`。当前版本字段未返回，使用JSON null；doc创建时间未返回，同样为null。计划原消息的时间只作为消息时间，不推导doc存储时间。

本轮以平台git工具执行 `ls-remote origin refs/heads/main`，实读精确main为 `c768e1e3db297d8b91b53dd68b60e723a8a40e7d`；工作树初始HEAD同值，初始status为空。原始工具输入/输出保存在 [platform-observation.json](platform-observation.json)。未用origin/main或可变FETCH_HEAD推定主线；没有在共享只读clone写入。

原#53操作索引产品基准 `74f247f9240eaf21e74ef248f71a445c1d4276d7` 到本轮精确main的 `git diff --name-only` 只有 `docs/plan/backend-agent-mcp-priority/` 七份Markdown。当前产品源码因此与原定位基准一致，原索引的基准标注不改写；本目录实际从当前完整OpenAPI和route-policy重算全集，并保留每条原索引行。

权威来源为CONTEXT、AGENT_PROTOCOL、OPENAPI、SCHEMA及现行已接受ADR。SCHEMA的全部include文件进入来源指纹，未重建已删除PRD。#9/#16未合分支未混入本目录来源。实际main以后更新时按新的精确SHA增量核对，不将本轮操作数量固定为永久指标。

## 正文来源与无损边界

- spec：本轮 `todos(id)` 的Spec至Saved plan分隔符之间完整正文，完整尾部可见；末尾采用单一LF，平台原始响应另存。
- savedplan：本轮用户消息注入的authoritative saved copy，取完整plan body；与todos已经返回的完整前缀逐字一致。todos后半被工具截断，不能声称已完整读后端doc。文件不加入归档标题、时间或版本；implementation与savedplan同字节。
- docID：conversation中的实际 `[plan](doc:K7ASX6igBDq85SckGcuui)`，不是根据未来生成顺序猜测。
- 反馈及授权：conversation实读当前补交反馈、问卡及用户选择“允许仅文档落盘（推荐）”；不改平台保存计划。

`source-manifest.json` 分别记录58项产品/合同/来源文件的Git object ID、blob大小/SHA-256、工作树大小/SHA-256以及CRLF/LF映射。本目录新文件用UTF-8及LF生成；Windows后续检出可展开CRLF，不能将工作树哈希冒充blob哈希。暂存后的真实blob核验另见review及本轮检查回执。

## 实际顺序

平台记录：原计划消息时间为2026-10-09 04:08:52 UTC；补交反馈为04:11:12 UTC；问卡答复与用户授权为04:34:51 UTC。本轮首个clock读数为04:35:28 UTC。远端main和平台资料随后读取，再生成本地文件；不声称这些读取是事务快照。

savedplan/implementation的实际文件mtime与生成开始/结束时间在 [generation.json](generation.json)。它们是本轮实读文件系统记录，不是倒填的平台生成时间。静态生成脚本首次成功于2026-10-09T04:40:20.758Z，exit=0；它只派生文档，没有连接API/MCP或运行领域写命令。后续核验及提交由review记录，提交SHA以最终实际git输出交付，不自引用预填。

## 可重复的文档审计

`node docs/plan/agent-mcp-m0/archive-audit.mjs` 只在记录的原HEAD生成本目录资料；使用本机Node的stripTypeScriptTypes执行无依赖的纯route-policy派生，PyYAML完整解析OpenAPI，再核对#53表全集。脚本的Node实验性功能警告保留，不计产品失败。

本轮未pnpm install；此前规划中Node查yaml失败反映工作树依赖未安装，未改产品或降级为正则验收。当前改用已有PyYAML解析，并记录实际runtime。文档核验不是产品测试；不新增容器、服务、测试数据库、卷、网络或外部连接。
