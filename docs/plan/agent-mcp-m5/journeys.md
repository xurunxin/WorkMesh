# 两路径与真实客户端序列

全部步骤为未来运行计划，当前未运行。每条路径先 OpenCode producer／Pi collaborator，再 Pi producer／OpenCode collaborator；形成 O-N、P-N、O-G、P-G 四条主链。不同运行使用独有 Session／Plan step／Document／action，不让先前成功事实充当下一条的准备。

## 公共准备与证据契约

H1／H2 使用隔离的 REST cookie／CSRF 句柄，创建两个 Team；Team1 为共同合法正对照，Team2 的私有资源作为拒例。H1 是两个 Agent Connection 的准确 principal 和 WorkItem responsible Human；H2 合法参与 Team1 协作、批准及 Handoff 接受，H1 无 Team2 membership。管理员准备完成后 H1 回到普通成员，不能用 admin 穿透负例。

Human 经现有 create／redeem／grant／context／LlmConnection／model 接口准备，接单和执行命令由实际客户端调用。Agent B 的目标 ID 由 Human 准备提供，不增加 peer 目录或 Team 权限。两 Agent definition／Team grant 可拥有已批准的 producer 能力，但 reviewer Delegation 的权限必须缩减。原 `pairTarget` 的 codex 标签不代实际 clientType；现行 `agentConnectionClientTypeValues` 明确允许 opencode 与 pi，因此 A 登记 opencode、B 登记 pi，实际 executable／版本另列。

每步保存三个独立证据：模型下一次请求确实携带工具结果；MCP／REST 实际调用的 operationId、key、revision、correlationId；数据库的 state／event／outbox 与资源 ID。OpenCode 公开 JSON transcript、Pi Turn／tool invocation 与协议 driver transcript 分开目录，不记录 hidden reasoning。核心四条链通过判定要求所有必需步骤的领域断言成立；缺 Human 阶段或模型结果不计成功。

角色适用性：Pi固定E，不能因工具有 `workmesh_update_work_item` 就取得C的Team规划CRUD权。Issue创建／协调修改由外部C或Human准备；Pi模型实跑角色拒绝并读授权Issue。F5的Plan／Document让两个真实执行客户端合法竞争；Issue旧revision竞争使用两个合法C的协议对照，Pi E的同写请求应先角色拒绝而非假称REVISION_CONFLICT。该限制逐行记录，不扩大C/E分工，不能给“Pi协调Issue写已验收”勾选。

## N：无 Git 核心链

| 顺序／案例 ID | 实际客户端动作 | Human／服务步骤与领域断言 |
| --- | --- | --- |
| N1 | C 调发现、identity、可领取列表；创建允许的 Project／Issue，明确 responsible H1 | 原 Human 已建 Connection／Team grant；无 repository，readiness 不得判 repository unmet；截图不是唯一证据 |
| N2 | 实际 C `claim_work_item`，准确 Session ACK；取得 context，转 planning／executing，发布完整 Plan | exchange／静态 E listener 的本机准备单列；Plan stable step 和 revision 返回到实际模型；另一 Connection 不得领取占用任务 |
| N3 | 读取／创建／更新共享文档、history／diff／export；Room status／ask／answer、Inbox claim／ack／reply；至少一分页 | 正文含中文、控制字符与最大合法 Markdown边界，模型实收／REST／DB逐值一致；H2 从授权 REST 读取同证据，外 Team 拒绝不泄露 |
| N4 | acquire／renew／release Lease，记录可见 operational activity；A 向 B offer Handoff | H2 用现有 acceptHandoff，精确目标新 Session 从 signed webhook／pull 收取，ACK并执行；新 child 继承原 H1 principal，负责 Human不变 |
| N5 | B 发布本人结果／证据并完成；A 查询直接子状态，完成原 Plan；实际 requestApproval，公开等待 | H2 根据准确 action ID／原 hash decide；Pi settle wait 退出旧 Attempt，Worker 唯一续 Turn；OpenCode退出本次 run 后在原 durable Session上新 run 读真实 approval，不要求常驻模型等待 |
| N6 | actual complete＋Artifact 或合法 noArtifactReason；读原动作确认 | OpenCode direct complete 的原 key／body及来源受控确认；Pi 外层 settle 原子 completion，Human终态读＋原 settle回执确认；原E普通读取／新写必须拒绝，Issue状态不被自动Done |
| N7 | 两进程分别经历 Stop／失败／重试链 | 原 E Token专用 Stop_ACK、Lease清理／residualRisks；H2 retry生成不同Session ID，旧事实不复活，再跑有效新Session。故障步骤使用独立Session，不能破坏N6正链再冒全部成功 |

## G：fake Git 完整交付链

| 顺序／案例 ID | 实际客户端动作 | Human／服务步骤与领域断言 |
| --- | --- | --- |
| G1 | C领取／ACK后E读repository/context，核准确base/path/branch pattern，取得Git Lease和完整Plan | Human fake provider connection／repository／共享WorkItem或Project context；后端必须同候选，provider remote effect状态独立于Worker对象。原#9新配置功能未纳入，不依赖其未验新UI |
| G2 | create_repository_branch，查询准确action至completed；create_repository_commit同链确认；open_pull_request确认原PR与head | Worker真实claim／持久outbox后处理，读action不能驱动发送；允许路径写及越路径拒例。保存准确provider请求计数及结果，不把HTTP接受当外部成功 |
| G3 | producer发布本人当前head test_report／delivery Artifact；提出显式repositoryIds的required review | 目标能力／Team grant／父scope三方repo:read，固定共享context；省略repoIds独立兼容负例不授读。父读子投影签名分页；父不能读取子Token或原prompt |
| G4 | 另一实际进程作为reviewer读当前head与delivery，发本人Room review_result、code_review Artifact、structured review并完成 | reviewer无plan:write／repo写；无任一双证据、自审、旧head、file代code_review、阻断finding、子未completed分别拒绝。Producer／reviewer工具与证据不可串身份 |
| G5 | producer读准确PR checks／reviews／findings，请求绑定原actionHash／head的merge approval；待H2批准后request merge，再查询原action | H2独立REST批准；Worker每写HTTP前锁后重读principal／Team／context／default branch／head/checks/approval；审批先失效拒绝，合法批准仅消费一次，fake merge终态对应准确PR |
| G6 | current-head证据汇总、Project draft／completion suggestion，完成producer | Human发布／裁决仍保留，merge不部署、不自动Issue Done。Pi额外受控上传／Worker验证／checksum下载实测；OpenCode模型链用metadata证据，不调用返回签名资料的raw上传／下载工具，限制不能抹掉 |
| G7 | 故障clone跑provider unknown／checkpoint、MCP重连、Worker/API/Runner重启、Stop并重试 | checkpoint仅本地finish，unknown人工对账零新外发，不新key重发；重启前后原action/approval/head必须一致。CI retry仅fake支持路径，真实GitHub/Gitea不作账号实测宣称 |

## 完成判据

四条主链逐项回执存在，模型实收、REST响应、DB事实一致，H2授权读取证据成立且负例实际失败。所有九类用例可追到具体 run／step／source bytes；失败、skip、缺Human步骤或无法隔离配置不计 passed。协议夹具通过只能证明其自身，旧M0–M3数量不合并为M5数量。
