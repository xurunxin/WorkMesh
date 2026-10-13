# 基础产品阶段同步回执

## 授权来源

本卡用户最新规格记录两项回答：“先实施基础交付（推荐）”和“现有 CI 与完整虚拟机（推荐）”。当前用户接续反馈明确基础产品范围、先同步计划、保留扩展分支和条件合入；[平台当前规格原返回](sources/product-todo.md)及[当前对话原返回](sources/product-conversation.md)可逆保存。

当前 Spec 完整返回；同一工具返回中的 Saved plan 前缀仍是旧规划计划且被截断。Chief 的两条原始问句没有由本卡工具取回。两项选择按当前 Spec／接续用户原文保全，不冒称亲读 Chief 原问题或补写旧平台尾部。

实际开工查询 `refs/heads/main` 为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`；本会话已审 HEAD 为 `930e488f27907ee6aaaa051f3395897866ecc309`。没有操作共享缓存锁、以 FETCH_HEAD 冒 main 或切换分支。

## 已完成的仓库同步

当前 [spec.md](spec.md)采用完整平台 Spec 字段。[implementation-plan.md](implementation-plan.md)固定已批准基础路线、逐文件增量和真实验收。部署设计、验收矩阵和入口已注明当前阶段；原四份文件以已审 Git 字节保存至 [history](history/README.md)，原 doc 引用与来源保留。

Redis-free／filesystem 的原保证选项不删除、不实施；ADR 0071／0072 保持 Proposed。先前被拒文件目录和无标签匿名卷不处理。此前阶段同步提交没有产品、API、DB、CI 或发行脚本变化。当前例外允许立即进入已批准基础产品实现。

## 尚未完成的平台同步

本轮完整工具目录中没有 Saved plan 编辑接口；检索工具名称及描述中的 plan／build 也没有找到可调用入口。平台工具正常返回 todos／conversation，这不是 MCP server 启动失败，也不据此要求升级 CLI。

历史规格要求产品修改前同步平台字段；用户于 22:50 选择“先同步平台计划（推荐）”。随后用户于 23:41 明确选择“允许记录例外并继续（推荐）”，仅解除本阶段记录方式的硬前置。当前依据仓库计划、完整规格及对话批准记录继续产品实现，Saved plan 字段仍未同步。基础范围、真实验收、P0/P1 独审、最新必需 CI、条件合入及权限边界保持。

平台没有 WorkMesh Project／WorkItem 写工具的旧缺口同样保持，不虚构双轨写回。当前按已批准例外继续基础产品实现，尚未完成新候选产品验收。

## 当前来源指纹

| 原件 | 原正文 SHA-256 | 编码文件 SHA-256 | 计算 Git blob |
| --- | --- | --- | --- |
| [product-todo](sources/product-todo.md) | `90921b033458074c9f51b7826a9093795808ec1eff208f03105e22d4b3bec1bc` | `f1626388c8ae6b1b2dacc721639489f275750d64cccf59f0c2930ace91eebcc1` | `1196f5bc0c60447a958fc78e27d0945f57d798a7` |
| [product-conversation](sources/product-conversation.md) | `6b120dc731b20d7415bcee61816d47d67c15f3634f10446af464ce6dc810b893` | `9644f83dfc8dc1c7cde9bbcca11db6a33e6bff8402269d4a653056114323d3c1` | `c3508e4f166fa3fbe7a418b98cb1e092dcefd316` |

此前基础同步 Spec SHA-256：`8b2ef930e1e58acd10a9cfcc8c899bd9831ce3df6c6daa2ed07799e22fc8c6be`。此前执行计划 SHA-256：`627775463b813b6a373f3eccd73f044b6448efee3c5e743b11d8198804492d2b`。归档 blob 另核实际 index，计算值不证明已提交。

## 后续例外原件

22:05 的两项基础选择保留在原 product 来源中。22:50 的先同步选择与 23:41 的后续例外见 [对话原返回](sources/exception-conversation.md)；[最新卡原返回](sources/exception-todo.md)包含完整 current Spec，Saved plan 尾部截断原样保留。Chief 原问句仍未取得，不补造问题全文。

本次独立查询真实 refs/heads/main 为 c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8，工作树开工 HEAD 为 e0f285426942e53400a08f5d17dddb1a21d6d57c。未操作共享缓存锁。

最新来源指纹：

| 文件 | 原正文 SHA-256 | 文件 SHA-256 | 计算 Git blob |
| --- | --- | --- | --- |
| sources/exception-todo.md | d7dd371a77ffca5a8bf87b2bd9799e0bb046b8b79ecf996af09ae54fb869bd6a | 6d783b186e7ba9f42427c745735a232e7099641f779d1704bbbf82c7cb050145 | 69e43a87cbb86bb2fabafdbae41e0cdaf369fcc2 |
| sources/exception-conversation.md | c9f1997ec1ec4bf47b156898c10ecb25bb361016c1bd74c52ade342921be52b4 | 569811f3af74060a58b4f5e2f09edd0fa470d8911b04d5f8056287706824058c | 2a11266c66eba1d3c474a12fe1e3b1281ce6e31d |

当前 Spec SHA-256：77183e04c12c6f6113172a272273578a689ee923f3102b5045df2f5b3ac33ff2。当前执行计划 SHA-256：7a29fd3c3137bdfb4b65f3f252f8c00f620800ecd8284242407b324ff1a4c39d。
