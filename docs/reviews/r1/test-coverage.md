# 逐 feature 九类验收矩阵

每一行是待该任务实现的独立断言；现有测试文件不等于新契约已通过。原测试/DoD全文、来源哈希及owner见 [JSON](test-coverage.json)，陈旧条款仅留在originalTests/历史台账并明确撤换。组合阶段输入/责任见索引，当前实际检查见 [记录](execution-checks.md)。

## #1 · 历史任务 owner

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| unauthorized actor | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| stale revision | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| transaction failure | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| concurrent request | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |

## #2 · 历史任务 owner

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| unauthorized actor | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| stale revision | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| transaction failure | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| concurrent request | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |

## #3 · R1 独立规格审查者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 重算29卡正文/哈希、冻结段、依赖无环与所有原测试DoD去向 | docs/reviews/r1/verify-specs.mjs（待创建；归本feature执行者）；R1 独立规格审查者 |
| unauthorized actor | 不适用：独立规格审查不创建领域命令。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：报告不运行领域状态机。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：没有mutation幂等接口。 | 按本行依据不新增测试 |
| stale revision | 不适用：平台精确计划/head关口由Chief核对；没有新增revision接口。 | 按本行依据不新增测试 |
| transaction failure | 不适用：只保存仓库规格，无DB事务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：没有新增job/webhook消费者。 | 按本行依据不新增测试 |
| concurrent request | 不适用：采用非原子卡片读回和差异归因，不声称事务快照。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：没有产品outbox写入。 | 按本行依据不新增测试 |

## #4 · S1 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 流程文件与平台Skill全文一致，skillId/加载/另一任务复用证据实际读回 | docs/evidence/workmesh-team-skill.json（待创建；归本feature执行者）；S1 执行者 |
| unauthorized actor | 不适用：流程资产不改变actor授权。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：不新增领域状态机。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：不新增mutation。 | 按本行依据不新增测试 |
| stale revision | 不适用：不新增revisioned资源。 | 按本行依据不新增测试 |
| transaction failure | 不适用：没有DB写入。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：没有job/webhook。 | 按本行依据不新增测试 |
| concurrent request | 不适用：没有并发领域请求。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：没有产品outbox。 | 按本行依据不新增测试 |

## #5 · B1/B2 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 完整七项协议校验通过后才写秘密引用/正式配置；黄金路径两步可用 | apps/connector/src/connect.test.ts（待创建；归本feature执行者）；B1/B2 执行者 |
| unauthorized actor | 陌生claimant仅持code/公开id不能取回令牌，错误Team/principal/current credential零配置提交 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B1/B2 执行者 |
| invalid state transition | 已消费code新key、已撤销/过期/overlap凭据验证拒绝，旧配置仍完好 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B1/B2 执行者 |
| duplicate idempotency key | 原key/body/context重放返回同body；同key异体冲突，pending保留原身份 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B1/B2 执行者 |
| stale revision | 不适用：客户端connect及兑换输入不新增If-Match/revision资源；凭据有效性另列invalid state。 | 按本行依据不新增测试 |
| transaction failure | 秘密写入/配置rename阶段失败补偿新增秘密与旧引用；既有兑换事务回滚不留半连接 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B1/B2 执行者 |
| webhook/job replay | 不适用：connect不新增webhook或job消费者；服务端重放属于命令幂等，不冒充job测试。 | 按本行依据不新增测试 |
| concurrent request | 两个connector同时启动只有同一pending请求身份，ACL与正式提交不交错 | apps/connector/src/connect.test.ts（待创建；归本feature执行者）；B1/B2 执行者 |
| server restart/outbox recovery | 发送前/丢响应/发送后/client或server重启、15分钟窗口外及密文清除恢复均用原身份 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B1/B2 执行者 |

## #6 · 历史任务 owner

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| unauthorized actor | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| stale revision | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| transaction failure | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| concurrent request | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |

## #7 · B3 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 每个接入错误返回可执行next_action/human_action；类型列表只修正猜错类型 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B3 执行者 |
| unauthorized actor | 失败指令与client列表不泄露令牌或不属于调用者的连接身份 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B3 执行者 |
| invalid state transition | wrong code、wrong slug、known wrong type、invalid enum各自attempts语义符合P1 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B3 执行者 |
| duplicate idempotency key | 兑换重放/同key异体的错误元数据不改变既有响应幂等契约 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B3 执行者 |
| stale revision | 不适用：错误DTO/兑换输入没有新增revisioned资源。 | 按本行依据不新增测试 |
| transaction failure | 限流store故障fail closed；兑换写入失败回滚，错误分类仍准确 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B3 执行者 |
| webhook/job replay | 不适用：只调整错误分类，不新增webhook/job。 | 按本行依据不新增测试 |
| concurrent request | 固定时钟并发耗尽operation桶互不影响、IP/socket共享影响两个操作 | apps/api/integration/auth-rate-limit.integration.test.ts（现有文件，待本feature扩展具体用例）；B3 执行者 |
| server restart/outbox recovery | API重启原合法重放仍可用，限流存储异常不静默绕过 | apps/api/integration/stage5-agent-connections.integration.test.ts（现有文件，待本feature扩展具体用例）；B3 执行者 |

## #8 · A1 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | visible active模型+enabled model、active Agent及仓库上下文正确；Runner恒unknown | apps/api/integration/configuration-readiness.integration.test.ts（待创建；归本feature执行者）；A1 执行者 |
| unauthorized actor | 跨workspace/Team及personal模型不可见，不泄漏存在性 | apps/api/integration/configuration-readiness.integration.test.ts（待创建；归本feature执行者）；A1 执行者 |
| invalid state transition | 不适用：纯Query没有领域状态转换或写入协议。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：GET无幂等键；重复读断言零副作用。 | 按本行依据不新增测试 |
| stale revision | 不适用：GET没有If-Match或可修订就绪记录。 | 按本行依据不新增测试 |
| transaction failure | 不适用：零DB写入；查询失败另断言无Session/receipt/event/outbox。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：不消费job或写投递意图。 | 按本行依据不新增测试 |
| concurrent request | 两个Team并行查询不串投影；撤权后下一次读按实时授权收敛 | apps/api/integration/configuration-readiness.integration.test.ts（待创建；归本feature执行者）；A1 执行者 |
| server restart/outbox recovery | 不适用：只读投影无outbox/checkpoint；断线重读不创建副作用。 | 按本行依据不新增测试 |

## #9 · A2 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 缺口列表顺序、对应空状态动作、unknown提示与固定i18n文案正确 | apps/web/e2e/configuration-readiness.spec.ts（待创建；归本feature执行者）；A2 执行者；阶段 9-delivery |
| unauthorized actor | 当前用户不可见配置不渲染为可操作项；失权重读清除旧行 | apps/web/e2e/configuration-readiness.spec.ts（待创建；归本feature执行者）；A2 执行者；阶段 9-delivery |
| invalid state transition | 不适用：只读投影和导航，没有领域状态转换。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| stale revision | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| transaction failure | 不适用：固定文案/导航不创建配置或seen事务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| concurrent request | A2自身异步Team切换不落旧投影，canonical返回/焦点/窄屏列表独立可达，不等待D4 | apps/web/e2e/configuration-readiness.spec.ts（待创建；归本feature执行者）；A2 执行者；阶段 9-delivery |
| server restart/outbox recovery | 不适用：不创建outbox；重载列表仍由当前授权查询。 | 按本行依据不新增测试 |

## #10 · 历史任务 owner

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| unauthorized actor | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| stale revision | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| transaction failure | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| concurrent request | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |

## #11 · D1a 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 新并存槽不改变旧computed样式，light/dark映射/继承完整，D0亮色基线不漂移 | apps/web/features/navigation/theme.test.tsx（现有文件，待本feature扩展具体用例）；D1a 执行者 |
| unauthorized actor | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| stale revision | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| transaction failure | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| concurrent request | 不适用：纯CSS新增无并发领域请求。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：纯CSS新增无服务器状态/outbox恢复。 | 按本行依据不新增测试 |

## #12 · D2/D3 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 三区/截断/零阴影与真实状态分维；负责人是别人但当前人可读且audience.canRespond=true的未决Attention可见并用暖色；明暗均成立 | apps/web/features/work-items/work-item-card.test.tsx（现有文件，待本feature扩展具体用例）；D2/D3 执行者；阶段 12-delivery |
| unauthorized actor | 无读取授权不显示；可读不可响应则中性；expired/decided不暖色，relationship/负责人归属不替代读取与响应授权 | apps/web/features/work-items/work-item-card.test.tsx（现有文件，待本feature扩展具体用例）；D2/D3 执行者；阶段 12-delivery |
| invalid state transition | 不适用：卡片显示状态而不改变状态；不写虚构awaiting_review。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| stale revision | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| transaction failure | 不适用：纯投影与计算样式不发领域写入。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| concurrent request | 旧请求晚到后不可把旧权限Attention提交到新Team的卡片投影 | apps/web/features/work-items/work-item-card.test.tsx（现有文件，待本feature扩展具体用例）；D2/D3 执行者；阶段 12-delivery |
| server restart/outbox recovery | 不适用：投影没有outbox；重连使用当前授权读模型。 | 按本行依据不新增测试 |

## #13 · D4 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | splitter/hide/maximize状态记忆、键盘和窄屏行为符合既有shell与canonicalURL | apps/web/e2e/workbench-layout.spec.ts（待创建；归本feature执行者）；D4 执行者；阶段 13-delivery |
| unauthorized actor | 无active任命或feature off明确不可用，不伪造总管/泄露其他Team对话 | apps/web/e2e/workbench-layout.spec.ts（待创建；归本feature执行者）；D4 执行者；阶段 13-delivery |
| invalid state transition | 不适用：布局本地状态不是领域状态机。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| stale revision | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| transaction failure | 不适用：布局持久化不变更领域资源。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：本地布局/投影渲染，不新增领域变更、revision、job或outbox。 | 按本行依据不新增测试 |
| concurrent request | 消费已验收#9后，A2+D4组合面窄屏列表/键盘/焦点/返回列表不丢失，异步Team切换不落旧投影 | apps/web/e2e/workbench-layout.spec.ts（待创建；归本feature执行者）；D4 执行者；阶段 13-integration（已验收输入：0BkezbmWV6k8vwrlSNuF_） |
| server restart/outbox recovery | 不适用：不新增outbox；布局重载/记忆作为happy path。 | 按本行依据不新增测试 |

## #14 · D5a 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 每个菜单/主动作映射既有命令或本地导航；破坏性动作有明确确认且可取消 | apps/web/features/work-items/work-item-card.test.tsx（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| unauthorized actor | UI隐藏不等授权；绕过卡片直接提交未授权既有命令仍拒绝 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| invalid state transition | 已有命令拒绝不允许的状态转换；导航/复制不改变workflow/session | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| duplicate idempotency key | 相同操作身份重放不增加第二次变更；复制/导航零mutation | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| stale revision | 陈旧If-Match被拒并展示最新数据，不盲目覆盖 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| transaction failure | 领域命令失败取消乐观显示，当前state/event/outbox共同回滚 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| webhook/job replay | UI不创建新job；领域效果仍走已有事务outbox且重放不产生额外动作 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| concurrent request | 并发卡片编辑/关闭按当前revision冲突，只成功项落库 | apps/web/features/work-items/work-item-card.test.tsx（现有文件，待本feature扩展具体用例）；D5a 执行者 |
| server restart/outbox recovery | 命令已提交但响应丢失后用原key恢复，复制/草稿无outbox | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5a 执行者 |

## #15 · C1 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | source event→authorized Human→channel target生成一intent及每目标delivery attempt | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| unauthorized actor | 目标配置未授权拒绝，队列后撤权/离队/禁用发送前抑制零外发 | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| invalid state transition | disabled/dead-letter目标不继续发送；不把陈旧通知当新的决定 | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| duplicate idempotency key | 同intent/target去重；source/fanout/job/ack同体重放、异体冲突 | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| stale revision | 配置If-Match和claim_fence过旧都拒绝，不确认新持有者的attempt | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| transaction failure | intent/cursor/fanout提交失败共同回滚；外发必须在commit之后 | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| webhook/job replay | 重放job与超时reclaim只由有效fence处理，未知外发记录至少一次/对账 | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| concurrent request | 两个worker竞争同target单逻辑attempt，单渠道失败不重投其他已确认target | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |
| server restart/outbox recovery | 各提交/外发/ack/checkpoint边界崩溃重启恢复，旧fence不写确认 | apps/worker/integration/stage4-automation.integration.test.ts（现有文件，待本feature扩展具体用例）；C1 执行者 |

## #16 · C2 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | fake企业微信提供方出站提醒+canonical登录深链，配置复用C1无重复CRUD | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| unauthorized actor | 转发后仅当前登录Human有权查看；target禁用/撤权/离队前再授权零外发 | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| invalid state transition | 端点失败/载荷超限/渠道关闭分类准确，网页仍可用，零决定写入 | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| duplicate idempotency key | 同delivery逻辑身份遵循C1重放；不承诺提供方external exactly-once | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| stale revision | target/source revision陈旧时不发过时敏感内容且不产生审批 | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| transaction failure | 复用C1 intent/attempt事务，适配器异常不把未发送记为delivered | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| webhook/job replay | 仅出站所以入站签名/回调/绑定不适用；发送job重放继承C1 fence | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| concurrent request | 多个目标及频控并行发送，旧fence不确认，失败目标独立重试 | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |
| server restart/outbox recovery | 发送成功但ack丢失允许重送并对账；重启不依赖模型执行完成 | apps/worker/src/wecom-notifications.test.ts（待创建；归本feature执行者）；C2 执行者 |

### C2 当前归档映射

完整原六项及 DoD 保留在 JSON 的 originalTests/originalDoD，当前映射见 [C2 test-coverage.json](../../plan/c2-wecom/test-coverage.json)。以下为后续用例；全部未实施/未运行。

| 类别 | 当前文件与命名场景 | 状态 |
| --- | --- | --- |
| happy path | `apps/worker/src/wecom-notifications.test.ts`：C2 协议：低敏 markdown 载荷与 canonical 绝对深链；`apps/worker/integration/stage4-automation.integration.test.ts`：C2 全链：已提交来源经 C1 intent、精确 Human target、fenced ACK；`apps/web/e2e/wecom-notifications.spec.ts`：C2 登录返回：当前 Human 打开受权 Attention 并聚焦详情 | 未实施/未运行 |
| unauthorized actor | `apps/worker/integration/stage4-automation.integration.test.ts`：C2 授权竞争：禁用、撤销、离队、Stop、撤权先提交零外发；`apps/web/e2e/wecom-notifications.spec.ts`：C2 转发：不同当前 Human 无权内容不可见 | 未实施/未运行 |
| invalid state transition | `apps/worker/src/wecom-notifications.test.ts`：C2 拒绝：端点、4096 字节边界、响应结构和安全错误分类；`apps/worker/integration/stage4-automation.integration.test.ts`：C2 渠道关闭或失效：不外发，网页仍保留事项 | 未实施/未运行 |
| duplicate idempotency key | `apps/worker/integration/stage4-automation.integration.test.ts`：C2 重放：同 source、intent、target、job、ACK 只一逻辑 delivery | 未实施/未运行 |
| stale revision | `apps/worker/integration/stage4-automation.integration.test.ts`：C2 陈旧：target revision 抑制、旧 fence 不确认、来源仅通用深链；`apps/web/e2e/wecom-notifications.spec.ts`：C2 陈旧转发：重新登录后读取当前状态与权限 | 未实施/未运行 |
| transaction failure | `apps/worker/integration/stage4-automation.integration.test.ts`：C2 事务故障：source、fanout、checkpoint、ACK 失败各边界恢复 | 未实施/未运行 |
| webhook/job replay | `apps/worker/integration/stage4-automation.integration.test.ts`：C2 job replay：旧 fence 与重复 outbox 不产生新的逻辑 attempt | 未实施/未运行 |
| concurrent request | `apps/worker/src/wecom-notifications.test.ts`：C2 限流：同指纹滚动窗口与多个 target 隔离；`apps/worker/integration/stage4-automation.integration.test.ts`：C2 多 Worker：频控延期不消耗 claim 预算、不阻塞其他目标 | 未实施/未运行 |
| server restart/outbox recovery | `apps/worker/integration/stage4-automation.integration.test.ts`：C2 重启：已发送 ACK 丢失进入 uncertain，显式对账才允许重送；`apps/web/e2e/wecom-notifications.spec.ts`：C2 渠道故障：网页可见及 C1 本人管理/未知对账仍可用 | 未实施/未运行 |

频控独审补充：`apps/worker/src/wecom-notifications.test.ts` 映射“第 0 秒预留、第 4 秒发送，第 60 秒仍拒绝第 21 条”及“Redis 状态丢失：所有 Worker 共同冷却至少 120 秒”；`apps/worker/integration/stage4-automation.integration.test.ts` 映射“授权锁跨窗口”及“预留、checkpoint、网络开始和完成回执各边界崩溃”。核验串行 token 与额度分别释放，额度至 max(D, 实际完成或安全终止时间)+60 秒，崩溃至 D+60 秒，多 Worker 任意实际发送的 60 秒窗口不超过 20 条。这些用例同步到当前六原测试与九类 JSON，全部未实施/未运行。

仅出站无入站 handler、签名时窗或 binding/unbinding，三者不适用；job replay 仍按 C1 fence 覆盖，不新增假测试。深链补充负例、六原测试及 DoD 逐项去向在链接 JSON 中；旧表为历史分配，不以旧表的单元文件代替真实 DB/浏览器验收。

## #17 · C3 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 内置目录加载、部署完整替换优先、禁用优先；选中只填可编辑配置并显示出处 | apps/web/app/lib/model-presets.test.ts（待创建；归本feature执行者）；C3 执行者 |
| unauthorized actor | 不适用：只读公开提供方目录无凭据/身份写入；既有连接授权不在目录内重实现。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：文件目录不是领域状态机。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：没有mutation/idempotency接口。 | 按本行依据不新增测试 |
| stale revision | 不适用：目录版本是部署版本，不是可写资源If-Match。 | 按本行依据不新增测试 |
| transaction failure | 不适用：无目录表或写事务；配置保存零出站由既有连接测试补证。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：不新增probe/job/webhook。 | 按本行依据不新增测试 |
| concurrent request | 多次读取和替换目录不修改请求内数据、不自动保存用户选择 | apps/web/app/lib/model-presets.test.ts（待创建；归本feature执行者）；C3 执行者 |
| server restart/outbox recovery | 不适用：目录文件不产生outbox；冷启动读取指定部署版本。 | 按本行依据不新增测试 |

## #18 · 历史任务 owner

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| unauthorized actor | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| stale revision | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| transaction failure | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| concurrent request | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：已完成/关闭卡只保留历史输入；不重开行政/采集/证据任务。 | 按本行依据不新增测试 |

## #19 · Chief

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 逐个原F01–F13及两轮F finding映射处置/受影响task/证据，不把R2建议当owner授权 | docs/reviews/r1/verify-specs.mjs（待创建；归本feature执行者）；Chief |
| unauthorized actor | 不适用：审查索引不写actor权限。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：没有新领域状态机。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：没有mutation接口。 | 按本行依据不新增测试 |
| stale revision | 不适用：没有revision资源。 | 按本行依据不新增测试 |
| transaction failure | 不适用：没有DB事务。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：没有job/webhook。 | 按本行依据不新增测试 |
| concurrent request | 不适用：不是并发领域请求。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：没有outbox。 | 按本行依据不新增测试 |

## #20 · B-ship 执行者／Chief 裁定发布矩阵

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 在获批设备矩阵的干净无源码环境安装版本化产物，运行完整连接黄金路径 | apps/connector/test/install.integration.test.ts（待创建；归本feature执行者）；B-ship 执行者／Chief 裁定发布矩阵 |
| unauthorized actor | 安装场景仍验证Team/principal/凭据，秘密文件权限和Windows ACL不被打包削弱 | apps/connector/test/install.integration.test.ts（待创建；归本feature执行者）；B-ship 执行者／Chief 裁定发布矩阵 |
| invalid state transition | 已消费code新key/过期/撤销凭据安装后仍拒绝，恢复文档给正确下一步 | apps/connector/test/install.integration.test.ts（待创建；归本feature执行者）；B-ship 执行者／Chief 裁定发布矩阵 |
| duplicate idempotency key | 已安装命令从pending重放同key/body/context无第二令牌 | apps/connector/test/install.integration.test.ts（待创建；归本feature执行者）；B-ship 执行者／Chief 裁定发布矩阵 |
| stale revision | 不适用：产物版本不等于领域revision；不新增If-Match接口。 | 按本行依据不新增测试 |
| transaction failure | 安装/升级或配置提交失败保留旧命令/秘密引用，不留半份正式配置 | apps/connector/test/install.integration.test.ts（待创建；归本feature执行者）；B-ship 执行者／Chief 裁定发布矩阵 |
| webhook/job replay | 不适用：安装包不新增job/webhook。 | 按本行依据不新增测试 |
| concurrent request | 两安装后connect进程共享同pending身份，版本切换不覆盖未决操作 | apps/connector/test/install.integration.test.ts（待创建；归本feature执行者）；B-ship 执行者／Chief 裁定发布矩阵 |
| server restart/outbox recovery | 设备重启后窗口内合法恢复，窗口外指引重新合法配对，不输出秘密 | apps/connector/test/install.integration.test.ts（待创建；归本feature执行者）；B-ship 执行者／Chief 裁定发布矩阵 |

## #21 · D1b 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 七类界面逐面D0 diff和人工评审、明暗切换/computed消费都通过；旧消费非零禁止清理 | apps/web/e2e/theme-unification.spec.ts（现有文件，待本feature扩展具体用例）；D1b 执行者 |
| unauthorized actor | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| invalid state transition | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| duplicate idempotency key | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| stale revision | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| transaction failure | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| webhook/job replay | 不适用：仅新增样式/映射与消费迁移，不新增身份命令、领域状态机或持久写入。 | 按本行依据不新增测试 |
| concurrent request | 不适用：逐面迁移不是并发领域命令。 | 按本行依据不新增测试 |
| server restart/outbox recovery | 不适用：仅CSS消费改动，服务器重启/outbox不参与。 | 按本行依据不新增测试 |

## #22 · D5b 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 拖拽/键盘/修饰键多选逐项结果；拖卡只插入本地引用不自动发送 | apps/web/e2e/work-item-card-interactions.spec.ts（待创建；归本feature执行者）；D5b 执行者 |
| unauthorized actor | 每项移动均由服务器当前授权，部分失权项拒绝但不回滚成功项 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5b 执行者 |
| invalid state transition | 不允许目标转换拒绝，不能拖拽重置清空计划/会话历史 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5b 执行者 |
| duplicate idempotency key | 未知网络结果重放原请求原key，不新建第二次移动 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5b 执行者 |
| stale revision | 409重读当前revision并由人确认，不静默强行移动 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5b 执行者 |
| transaction failure | 单项事务失败只恢复该项显示，成功项不伪造全批回滚 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5b 执行者 |
| webhook/job replay | 不增加批处理job；现有单项领域outbox重放无重复效果 | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5b 执行者 |
| concurrent request | 两人同时移动同卡按revision冲突，多选各项独立提交/权限检查 | apps/web/e2e/work-item-card-interactions.spec.ts（待创建；归本feature执行者）；D5b 执行者 |
| server restart/outbox recovery | 浏览器重启/丢响应可恢复原operation结果；草稿不发message/session | apps/api/integration/stage1.integration.test.ts（现有文件，待本feature扩展具体用例）；D5b 执行者 |

## #23 · F0 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 四种subject在DB/API/contracts/audience/context/inbox全链成立，旧checksum不变 | apps/api/integration/stage2-collaboration.integration.test.ts（现有文件，待本feature扩展具体用例）；F0 执行者 |
| unauthorized actor | 跨workspace/Team拒绝，Team房间可见不等于兄弟exact私信可见 | apps/api/integration/stage2-collaboration.integration.test.ts（现有文件，待本feature扩展具体用例）；F0 执行者 |
| invalid state transition | 不存在/错误Team或混用project/session/workitem字段拒绝 | packages/db/integration/chief-room-migration.integration.test.ts（待创建；归本feature执行者）；F0 执行者 |
| duplicate idempotency key | 重复建房沿既有唯一身份同房间，异体幂等冲突 | apps/api/integration/stage2-collaboration.integration.test.ts（现有文件，待本feature扩展具体用例）；F0 执行者 |
| stale revision | 继承原消息写入/房间revision协议，陈旧写入不可覆盖 | apps/api/integration/stage2-collaboration.integration.test.ts（现有文件，待本feature扩展具体用例）；F0 执行者 |
| transaction failure | 枚举entry只ADD VALUE；引用entry失败不产生半约束/迁移ledger | packages/db/integration/chief-room-migration.integration.test.ts（待创建；归本feature执行者）；F0 执行者 |
| webhook/job replay | 旧房间消息job/event重放对新subject保持recipient隔离 | apps/api/integration/stage2-collaboration.integration.test.ts（现有文件，待本feature扩展具体用例）；F0 执行者 |
| concurrent request | 并发同Team建房只一个，三旧subject唯一键不回归 | apps/api/integration/stage2-collaboration.integration.test.ts（现有文件，待本feature扩展具体用例）；F0 执行者 |
| server restart/outbox recovery | 各entry提交前后故障/重跑、上一阶段升级与空库，旧rows/checksum保留 | packages/db/integration/chief-room-migration.integration.test.ts（待创建；归本feature执行者）；F0 执行者 |

## #24 · F1 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 任命/换届/结束连同专用委派/建房/event/outbox原子；17能力完整分区 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| unauthorized actor | 非capable Human拒绝，任命不扩权，原普通repo:merge不变而Chief默认不含 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| invalid state transition | 重复结束/无效旧代次转换拒绝，不删除房间历史 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| duplicate idempotency key | 相同任命/换届key返回原结果，不产生新代次/房间 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| stale revision | 陈旧appointment revision拒绝；显式放宽有独立审计 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| transaction failure | 任命/房间/专用委派/event/outbox任一点失败共同回滚 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| webhook/job replay | 任命outbox重放不重新授予委派或更换身份 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| concurrent request | 并发任命只有一个active；换届与旧派发/撤权按共用锁序 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |
| server restart/outbox recovery | 换届提交前后重启不留两个active，旧代次无新效果 | apps/api/integration/chief-appointments.integration.test.ts（待创建；归本feature执行者）；F1 执行者 |

## #25 · F2 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 范围内无需逐次批准的自主分派成功；2能力上限、0062合取和plan/head关口正确 | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| unauthorized actor | 文本/任意final/decide不授权，policy不扩委派，principal不匹配退回负责人 | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| invalid state transition | Stop/结束/撤权/到期拒绝旧会话五入口，不能静默降级普通agent | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| duplicate idempotency key | 同logicaldispatch/多入口/原key重放只一次计量，异体冲突 | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| stale revision | 旧委派revision/planVersion/head/base改变使对应gate失效 | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| transaction failure | 余量预留/session/event/outbox共同回滚；启动取消释放未用，已用不重置 | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| webhook/job replay | 自动化/child/retry入口同guard；显式新Session retry新dispatch/use | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| concurrent request | 并发最后一次/预算额度只有合法预留成功，修订撤权与准入锁序一致 | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |
| server restart/outbox recovery | 排队/启动/台账提交边界崩溃对账恢复，派生失效覆盖外部取消结果 | apps/api/integration/chief-dispatch.integration.test.ts（待创建；归本feature执行者）；F2 执行者 |

## #26 · F3 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | report/domain-event/timer三源有真实作者/服务/任命/rule/结果，不伪Human | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| unauthorized actor | 当前principal/能力/任命不满足不准入，Runner unknown不冒在线 | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| invalid state transition | 同逻辑输入Stop抑制、全局暂停/结束任命阻止再激活 | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| duplicate idempotency key | 同源message/event/occurrence/根恢复输入去重；不同载荷同key冲突 | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| stale revision | 旧任命/委派revision在最终准入拒绝，不自动迁到新代次 | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| transaction failure | admission/session/prompt/event/outbox任一失败共同回滚 | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| webhook/job replay | self事件不唤醒自己，定时补偿/DLQ重放按持久身份去重 | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| concurrent request | 双消费者竞争、队列/速率/跨激活预算同时限制准入 | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |
| server restart/outbox recovery | admission各提交边界重启恢复且不从相同Stop输入重建Session | apps/api/integration/chief-activation.integration.test.ts（待创建；归本feature执行者）；F3 执行者 |

## #27 · F4 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | baseline版本/水位衔接与changed-resource合并，摘要有来源且非权威 | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| unauthorized actor | 按当前授权重读payload，收缩先移除，不能跨Team/任命读checkpoint | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| invalid state transition | CURSOR_EXPIRED/consumer变更/授权扩大有界重建，列表cursor不能冒event cursor | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| duplicate idempotency key | event-id合并与proposal/activation result幂等，dispatch用独立逻辑身份 | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| stale revision | 旧baseline/consumerVersion/任命代次checkpoint不能覆盖新版本 | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| transaction failure | 已处理C与该批结果引用同事务，任一失败cursor不前进 | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| webhook/job replay | 同事件页/批重放不重复派发，logicaldispatch独立于委派来源 | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| concurrent request | baseline期间并发写无丢/重；双消费者提交checkpoint安全 | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |
| server restart/outbox recovery | checkpoint保存前后崩溃恢复；长离线过期重建及固定规模实测预算 | apps/api/integration/chief-consumption.integration.test.ts（待创建；归本feature执行者）；F4 执行者 |

## #28 · F5 执行者

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | 合法actor-targeted前驱产生关联successor，root/前驱/根消息引用完整 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |
| unauthorized actor | 错误recipient/当前失权/跨workspace/exact-session拒绝，不能由新输入授权 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |
| invalid state transition | 根resolved/前驱会话未终止/Stop抑制不能恢复或claim后继 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |
| duplicate idempotency key | 同前驱恢复重复返回同successor，同key异体冲突，后继再次终止才下一条 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |
| stale revision | 锁后重验claim/session/任命/委派状态及revision，变更锁集回滚重定位 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |
| transaction failure | 创建不改原claim/receipt/status；三完成路径全链status/event/outbox共同提交回滚 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |
| webhook/job replay | 重复report/reply/恢复不伪ACK；ACK仍不resolve，非消息kind用既有源命令 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |
| concurrent request | 恢复×reply/answer/Human resolve/撤权/换届交叉并发无逆rank死锁；同根只有最终resolution | apps/api/integration/agent-lock-order.integration.test.ts（现有文件，待本feature扩展具体用例）；F5 执行者；阶段 28-delivery |
| server restart/outbox recovery | 底层successor创建与三完成路径提交前后崩溃后重放，保留原claim/归因和当前恢复资格 | apps/api/integration/inbox-redelivery.integration.test.ts（待创建；归本feature执行者）；F5 执行者；阶段 28-delivery |

## #29 · F6 执行者（最终联合验收）

| 类别 | 具体断言／不适用依据 | 文件与责任 |
| --- | --- | --- |
| happy path | REST与MCP get/report贯通SDK/policy/feature/manifest/adapter/conformance及联合F4接口 | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-delivery |
| unauthorized actor | 无Team权限NOT_FOUND，unsupported/disabled/revoked/Stopped均拒绝 | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-delivery |
| invalid state transition | 无active Chief返回null/CHIEF_NOT_APPOINTED，旧代次不得继续投递 | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-delivery |
| duplicate idempotency key | 已提交同key返回原message/recipient不向新人发，同key异体幂等冲突 | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-delivery |
| stale revision | get→post间换届CHIEF_APPOINTMENT_CHANGED，事务重验预期appointment/revision/room | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-delivery |
| transaction failure | report消息/inbox/activation引用/event/outbox原子，GET零receipt/event/outbox | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-delivery |
| webhook/job replay | 工具重试/平台job重放不伪ACK/等待模型，旧任命结果不重新路由 | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-delivery |
| concurrent request | F3/F4/F5联合恢复/三完成路径并发、Stop/撤权/换届按锁序收敛 | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-integration（已验收输入：89f9yFnmIg4nszXIBCByh、YtFHUCHv8l4JZcYd1qHAU） |
| server restart/outbox recovery | 消费已验收#27/#28后，恢复创建和根完成提交前后崩溃及checkpoint联合重放保留原归因和当前资格，REST/MCP重连可追溯 | packages/conformance/src/chief.conformance.test.ts（待创建；归本feature执行者）；F6 执行者（最终联合验收）；阶段 29-integration（已验收输入：89f9yFnmIg4nszXIBCByh、YtFHUCHv8l4JZcYd1qHAU） |

<!-- C2-PRODUCT-REVIEW:BEGIN -->
## C2 当前产品检查映射

六原验收与九类的历史字段保持原义。当前已实现及真实运行结果见 [产品审阅入口](../c2/product-review.md) 和 test-coverage.json 中 C2 currentProductExecution。真实 Redis 竞态用例复用现有 API integration 夹具；C1 原 Worker 回归保留，无 CI 工作流/门禁修改。只出站不适用入站签名、绑定解绑、回调时窗；fake 不冒真实外发通过，独审/当前 CI/main 尚待验收。
<!-- C2-PRODUCT-REVIEW:END -->
