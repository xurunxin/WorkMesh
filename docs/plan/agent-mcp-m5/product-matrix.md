# 实际消费者／两路径／九类矩阵

此表消费冻结 M5、已独审实施包和最新 [实施规格](product-spec.md)。状态表示本轮证据类型，不表示完整联合验收。原规划矩阵保留历史原文；实际退出、数量和源码绑定以 [命令回执](product-checks.json) 及 [原件索引](product-evidence-index.json) 为准。

| 链／画像 | 实际结果 | 限定证据与缺口 |
| --- | --- | --- |
| O-N／O-G | 环境门禁失败；领域链未运行 | 安装、私有路径／配置、MCP 握手与目录发现有实际证据；零模型 round trip |
| P-N／P-G，OpenCode collaborator | 未完整运行 | 外部门禁阻止 O/P 组合；不以两个 Pi 的补充链勾选 |
| Pi→Pi 核心交接补充 | 已有新运行 | 两真实 Pi Connection、两 Human、两 Team 准备；A 文档／Plan／Handoff；H2 accept；B 新 Plan／Artifact／完成；旧 A 四个准确 REST 拒例。批准等待／全 N3 不在此补充链 |
| Pi→Pi fake Git 补充 | 已有新运行 | 实际 producer/reviewer；准确 action／head／repository scope、独立双证据及 structured review、H2 merge approval、Worker、required child 和父完成。领取／ACK／初始 Plan／context 属准备阶段 |
| 协议对照 | 原套件在新组合上重新执行 | MCP/SDK fixtures 分列；`opencode-style` 不算厂商客户端 |
| Windows 已安装客户端 | 部分支持／OpenCode 隔离失败 | 原生 executable 与 Bun shim 分别绑定；未新安装／登录 |
| 个人 Lite／团队成品部署／企业实机 | 未测 | 独有 Postgres/Redis/store 与测试功能配置不是成品部署画像认证 |
| 其他 OS／真实模型或 Git 账号 | 未测 | 不缩减原三 OS、无源码发行或公共 release 门禁 |

| 原九类 | 新 M5 实际 Pi / 受控准备 | 尚缺的联合证据 |
| --- | --- | --- |
| F1 正常 | Pi 核心交接及 fake Git 补充链；Model/tool/领域事实 | 四条 O/P 完整主链、全 N3、批准等待在本链 |
| F2 越权／撤权 | 完整 HTTP 拒绝模型实收；Handoff 后准确旧 E 四 REST 拒绝；Human REST revokeDelegation 后原 E401／零第二业务 HTTP | 外部模型错误实收、跨 Team 正负对照完整链；membership 删除探针仍200，明确失败并待合同复核 |
| F3 非法状态 | Stop 后重放准入关闭；终态 source Delegation 拒绝 | 双消费者全部状态／feature/profile 案例实收 |
| F4 幂等 | 三白名单单 toolCall→两个同 key/body/完整 headers/E/If-Match HTTP→一组业务／event／outbox；两失响应；完整拒绝／5xx 不重放；真实 timeout/body 中断；第二 HTTP 拒绝保留 durable 未对账、服务端 E 到期零第二请求、后台 refresh 换 E 后仍重放冻结旧 E | 外部 MCP 重启原 key、Runner 本机到期边界与 shutdown signal 在真实子进程的竞争；后两项目前为单元证据 |
| F5 旧 revision | 同 owner/Session R-first/P-first；唯一 Pi Attempt running 后合法准确 E 竞争；新 intent 合并／stable ID | O/P 模型两轮屏障、共享 Document 的实际 O/P 竞争。R 冲突与 P 冲突不混计 |
| F6 事务失败 | 新 Plan outbox trigger 故障；完整 5xx、Plan/event/outbox/receipt 回滚 | 双客户端 Handoff/Room/settle 等完整联合故障矩阵；原套件回归单列 |
| F7 重放 | 原 webhook/Inbox/outbox/continuation 套件新组合回归 | 新 O/P 链 HMAC 重投、cursor resync 及零重复 effect |
| F8 并发 | 合法 E 竞争补充；required review 与完成；Stop 准入 | 两实际客户端、两 Connection claim、真实锁屏障／双提交顺序完整矩阵 |
| F9 重启／恢复／Stop | 实际 API PID 退出重启、同 Runner/Attempt/DB/port/预算；原 E Stop_ACK 与零活跃 Lease；Human 只停止当前 Turn 后 Attempt aborted／Turn stopped／Session executing，零第二业务请求 | MCP/Worker/Runner 各实际 PID 的四链恢复、unknown/checkpoint 两客户端事实 |

MCP/REST/Zod/SDK/policy/feature/derived manifest 沿已有合同，服务端权限、公开参数、事件和数据库迁移均未改变。仅 Runner 三个内部操作启用有界传输重放；GET/provider intent/签名传输/控制/settle/Stop finally 排除。外部模型禁两签名传输工具；Pi E 不获 C 的协调 CRUD，也不获 Human 角色或 cookie。
