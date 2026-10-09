# 适用测试、九类验收与DoD映射

所有产品用例均为待实现/待运行。本轮只执行文档静态核验；不把库内存夹具、静态工具数量、源码注册或旧PR绿色记为M0端到端通过。每条operation的acceptanceCases指向本文件，同一类对该操作的适用性由现行method/合同/批次决定；不是要求277条全部执行九类新产品用例。

## 九类验收映射

| 稳定case ID / 类别 | 具体测试落点 | 真实判定 / 不适用边界 |
| --- | --- | --- |
| M0-DISCOVERY / 正常 | contracts/src/route-policy.test.ts、client-profile-contract.test.ts；mcp/src/index.test.ts、http.test.ts；conformance/src/mcp-coverage.conformance.test.ts | 全集双向相等；旧默认响应strict schema仍可读；qualified增加字段正确；C只读/读写和E分别initialize/listTools/listResources/listResourceTemplates；resource与仅tool前提相同；真实Pi模型输入仅实际适配且具角色资格工具。每条静态工具有输入及返回出处；未适配项明确不支持 |
| M0-ROLE / 越权、撤权 | apps/api/integration/route-policy-authorization.integration.test.ts、stage5-agent-connections.integration.test.ts；MCP/SDK/Runner测试及真实conformance | 缓存Human工具call返回结构化FORBIDDEN；createComment/updateComment仍不可Agent写；E Project/Issue/Milestone/relation写不因work:write广告；发现后分别撤grant/delegation/connection再call，原拒绝不刷新、不重发；跨Team NOT_FOUND不泄露；允许读正对照继续成功 |
| M0-STATE / 非法状态 | contracts/client-profile-contract.test.ts；API route-policy集成；Runner permission-matrix.test.ts、workmesh-tools.test.ts | queued manifest允许但context拒绝；ACK后允许前提读取；paused/stopping/terminal按现行门禁披露或拒绝；feature开启不覆盖状态；profile不支持和混合credential失败关闭；精确Session/kind/actor错配不能复用缓存 |
| M0-IDEMPOTENCY / 幂等 | packages/agent-sdk/src/index.test.ts；MCP index.test.ts；真实conformance与API数据库事实 | 在现有代表写append_activity提交后丢响应，同key/body重放只有一次领域事实；同key异体冲突；重连/重新发现后逻辑身份保留；同正文新动作的新key产生新事实；导入同hash/plan恢复同mapping，现有再次相同import限制单列 |
| M0-REVISION / 旧revision | MCP/SDK测试；真实conformance调用现有transition/plan命令 | 用旧If-Match得到原structured error及可读currentRevision（按现行具体命令）；command状态不改、event/outbox不增。客户端显式读回后重建意图，用新身份提交；不能先盲改再冒成功。只读操作不适用If-Match |
| M0-TRANSACTION / 事务失败 | API权限集成＋真实conformance现有append_activity失败注入 | 在代表下游写的event/outbox位置注入本机测试失败，状态/receipt/event/outbox回滚，MCP/SDK/Runner保留原错误。M0没有新领域command，新增command事务回滚不适用；Human-only身份解析前拒绝不创建/刷新coordination及last_used_at；独立authorization_denials允许；合法Coordination派生事实分列 |
| M0-REPLAY / 重放 | MCP连接测试、SDK错误测试、真实conformance | initialize、rediscover、重连不复制领域业务事实；Coordination初次派生/续期的允许事实单列并验证并发收敛；resource读取没有receipt/outbox；network/429/5xx重试保留key/body/trace与最终完整envelope。M0没有新job，新增job去重不适用 |
| M0-CONCURRENCY / 并发 | API stage5连接/权限集成；MCP http.test.ts；真实conformance | 两客户端同Connection使用不同精确execution bridge，活动归属各自Session、不串Token；发现与撤权/feature改变竞争仍经服务端拒绝；同key/body并发只有一次领域事实；不能用静态manifest代锁后授权 |
| M0-RECOVERY / 重启、恢复、Stop | 真实conformance＋现有SDK stopAcknowledgement；Runner权限测试 | API和MCP分别重启，客户端重新initialize并从持久cursor恢复；Stop后普通工具拒绝；既有SDK/REST Stop ACK仍可达，不经过普通活动前置。终态E读取/普通重放受原门禁拒绝；MCP/Runner Stop专用适配和终态确认仍记M1未实现。外部CLI机器恢复不在本批证明 |

路径表中的短路径分别相对packages/contracts、apps/mcp、packages/conformance、apps/agent-runner；完整可执行路径以savedplan及operation-decisions来源为准。新增真实conformance文件当前不存在，不能冒称已有测试。

## DoD与误广告证据

| DoD | 文档输入 | 产品验收必须补的证据 |
| --- | --- | --- |
| 实际operation全集无遗漏 | operation-decisions.json每条完整请求/返回、原索引、policy及分类；archive-check.py集合核验 | 最新main重新全集核对；新增/删除差异有明确处理，非固定数量断言 |
| 角色发现与领域一致 | Human corrections、Team协调写、provider variants、Loop及rollup差异行 | 每项发现输出与对应服务端允许/拒绝并列；误广告项不可只改描述；当前删除动作差异仍待证据 |
| 旧客户端兼容 | compatibility.md、旧schema/URI/名称表、旧默认响应 | 旧客户端未协商读取无新增字段；隐藏工具直接call有角色拒绝；新只读alias不破坏resource |
| 资源客户端、仅tool客户端、Pi | 真API/MCP流程与模型tools请求抓取方案 | 完整初始化/发现/读取/故意拒绝/继续读transcript、版本与输入源码绑定；不能只看REST manifest |
| 错误与恢复 | Runner401、SDK/MCP envelope、稳定身份与导入限制 | 错误所有字段不丢；自动refresh/retry计数为零的拒绝案例；传输重试单事实；Stop既有入口可达 |
| 完成门禁 | 本轮只补文档；平台独审/Chief确认/产品检查顺序 | blocking/high由独审闭合、最新候选PR RequiredCI及实际main合入证明；文档核验不代产品检查 |

## 产品实施后的准确运行入口

按仓库规定runtime安装依赖：`pnpm install --frozen-lockfile`。依次执行`pnpm generate:route-policy`、`pnpm check:route-policy`；定向运行contracts、MCP、SDK、Runner现有测试。新增真实套件须通过`pnpm --filter @workmesh/conformance test:integration`执行并接入根`pnpm test:integration`。该脚本是待产品新增的入口，不宣称当前package.json已存在。

产品候选执行`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm test:conformance`。单独conformance内存结果单列。Web消费者兼容按现行必要检查验证，不设计UI、不借UI延后跳过合同消费者回归。

integration必须RUN_INTEGRATION=1及本任务含test的专用数据库，按config提供随机有效bootstrap/session/master key、Redis与S3；主密钥必须32解码字节，S3创建并HeadBucket验证专属bucket。秘密只在进程环境，不进日志。API/MCP/Runner使用本轮独有端口及进程，Windows pnpm.exec沿真实pnpm入口，E2E run目录为绝对路径；integration结束后E2E顺序运行，避免共享.next并发。

recovery默认可选skip如实记未验收，不计通过；适用必需用例缺环境不能静默skip。受测源码、运行换行映射、准确命令/退出/版本/首败、服务准备和清理在产品轮记录；本轮不预填产品运行资料。

## 本轮文档检查

运行`node docs/plan/agent-mcp-m0/archive-audit.mjs`生成静态全集与来源，再运行`python -X utf8 docs/plan/agent-mcp-m0/archive-check.py`核对文件、字段、来源与链接。暂存后执行`git diff --cached --check`和完整范围`git diff --check <来源head> HEAD`；对实际Git blob与工作树字节分别核验。

CI分类调用当前`classifyChanges`实读，不改policy/属性豁免。所有真实结果与首败保留在review及check-receipt材料；不运行全产品tests，结果不写成产品通过。
