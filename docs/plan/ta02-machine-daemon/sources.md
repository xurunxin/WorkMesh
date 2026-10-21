# 来源、主线绑定与差异

## 读取边界

读取日期为 2026-10-21。基线固定为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`；产品文件只从本轮工作树及该准确 Git 对象读取。main 由本机 `git ls-remote origin refs/heads/main` 与 GitHub ref API 双重查询，随后核 HEAD 相同。未使用 `origin/main` 或 `FETCH_HEAD` 代 main。

平台 `git(projectId, ["ls-remote", "origin", "refs/heads/main"])` 在执行前被共享缓存 reset 的 `index.lock` 阻塞。原调用和拒绝见 [git-cache-refusal.md](sources/git-cache-refusal.md)。没有删锁、修改缓存、切分支、在缓存运行 Git 写操作或冒称平台工具成功。上述本机 Git 和 GitHub 查询均为只读来源。

本轮新文件仅在 `docs/plan/ta02-machine-daemon/`。源码绑定表见 [source-binding.md](source-binding.md)，以准确基线 Git blob 和 SHA-256 复核，不把文档构建时 HEAD 当作动态主线。

## 当前卡和相关任务

| 来源 | 本轮用途 | 完整性与限制 |
| --- | --- | --- |
| [#34 实际返回](sources/todo-34.md) | 2026-10-21 12:57 的仅方案授权、原目标、测试和 DoD | 首次工具响应为空；再次读取取得完整 Spec，末尾为原 DoD，没有截断标记。[current-spec.md](current-spec.md)逐字取其 Spec，不包括平台元数据 |
| [#32 实际返回](sources/todo-32.md)及 main 的 [TA00](../backend-infrastructure-roadmap/README.md) | 复用剩余增量、依赖和后端门禁 | Spec 完整，工具 Saved plan 尾部截断；方案正文以 main 已入库文件为准，不补工具尾文 |
| [#20 实际返回](sources/todo-20.md)及 [产品记录](../../reviews/b-ship/product/progress.md) | 复用已交付连接器、可信来源、安装、秘密和精确重放 | Spec 完整，Saved plan 尾部截断；产品记录绑定 `ec3dafa58e20b478137d2468e900cddb4205296a` 的完整产品验收，最终 CI 来源与合入另列 |
| [#33 最新对话选段](sources/ta01-latest-excerpt.md) | 记录 API139／MCP139 仍未闭及上游询证 | 从实际返回的 2026-10-20 15:32:31 UTC 起选段；不是完整对话。其余消息未归档，不复制 ZIP、core、镜像或临时包装 |
| GitHub [PR225](https://github.com/xurunxin/WorkMesh/pull/225) | #20 已合入的独立 hosting 依据 | 本轮只读查询状态和 merge commit；不把其旧 CI 当 TA02 通过 |
| GitHub [PR226](https://github.com/xurunxin/WorkMesh/pull/226) | TA00 已入 main 的来源 | 当前 main 自身为该 PR 合并提交；旧规划不能替本轮新裁定 |
| GitHub [PR229](https://github.com/xurunxin/WorkMesh/pull/229) | TA01 候选边界 | 本轮读回为 OPEN、draft、mergedAt=null，head `3bccd2f67d9fb83e382e2ffff802dda89b19028f`；不是 main |

连接器最终交付的历史来源为 `fff06af6ccb99c24a62035f418e850914f37a712`、CI502 十三 job 成功，以及 PR225 的合并提交 `104f7afb8e89859549aa16af7a3114e90dea7f9b`。本轮复用已记录证据并核 PR 状态，未下载、重跑或独立重验完整设备原件。产品通过快照、最终文档 head 和合并提交含义分开。

#33 最新记录仅说明一次有限 B 样本 HTTP200、无故障栈，以及获准的上游询证已提交。它们不关闭历史 P1-2。本卡没有继承其设备、外发许可或重跑权限；不查询或更改其临时资源。当前仅记录其候选 head 与依赖风险，不采用候选 API、安装器或环境参数作为主线事实。

## 仓库权威与 ADR

已读取 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml` 的身份／runner／readiness／Connection 合同，以及 `SCHEMA.sql` 及其实际 v1 DDL 入口。SCHEMA 是 `\ir` 聚合入口，不能只 grep 顶层就断言某表不存在；本轮继续核 `0001/0004/0010/0017` 及 Drizzle schema、API/worker 源码。

| 决策／协议 | 源文件状态 | 本卡处理 |
| --- | --- | --- |
| ADR0003、0004、0008、0013 | Accepted | PostgreSQL 原子状态／event／outbox，Actor 分离，实时撤权和 lease 非授权保持 |
| ADR0035、0040、0042、0043、0046 | Accepted 或原文的 Accepted for v1.1 | 有界 heartbeat、执行投影、能力非授权、Connection、全非终态 Agent 容量保持 |
| ADR0047 | Accepted for implementation | 保原 assignment 与 capacity 路径；新机器调度不替代 Responsible Human 和 Delegation |
| ADR0068 | Accepted | Session completion 和 Turn settlement 的同事务语义保持；未知外部效果独立核账 |
| ADR0074 | 原 Proposed 状态及既有实施补充 | readiness 的 Runner unknown 从实际实现核，不提前写成机器 ready |
| ADR0079 connector-local-security | Accepted，原文附平台验收边界 | 复用 OS 锁、系统秘密、私有路径、精确 pending 和脱敏；不改设备权限 |
| ADR0081 | Proposed，原文附已独审／实施补充 | 按实际 main 的 waits 表、API、worker 和 Runner 区分实现；本轮不将 ADR 状态改为 Accepted |
| ADR0087 | Accepted | 长期纯后端；UI 与浏览器验收退役，后端责任保留 |
| ADR0088、0089 | 保留源文件现状 | 从实际 SDK/CLI 和 #20 产品记录核错误恢复／分发能力；不因卡 Done 倒填 ADR Accepted |

源码绑定表附原 Status 片段及 blob，避免仅按编号推断决策已接受。新增机器认证、slot、heartbeat、协议与安全差异只写 [Proposed 选项](proposed-decisions.md)。不重建已移除的 `WORKMESH_PRD.md`。

## 官方说明的本次用途

通过平台 `docs` 工具读取下列当前公开说明。这里只记录与本卡相关的研究结论，没有照搬产品 UI、套餐、定价或自动恢复保证。

| 官方来源 | 参考行为 | WorkMesh 的具体差异 |
| --- | --- | --- |
| [机器](https://todos.dev/docs/machines) | 机器非 Agent 专属；运行时开关和探测分开；固定机器、并发、离线与升级 | 复用资源概念；不引入页面，不接受在线＝授权；固定机器策略与 slot 保证待本卡裁定 |
| [CLI](https://todos.dev/docs/cli) | 前后台互斥、状态／日志／停止、升级定位准确安装 | Proposed daemon 明确本机 OS 锁、supervisor 归属、drain 和可信工件；不执行 tds 命令或安装服务 |
| [外部运行时](https://todos.dev/docs/runtimes) | 安装、登录、启用和模型观测分别展示，运行时能力有差异 | 首期只冻结有界报告合同；具体适配由 TA04；不扩大已支持客户端，不读取私人凭据 |
| [疑难排查](https://todos.dev/docs/troubleshooting) | 版本不兼容、离线、移除和容量错误明确反馈 | 仅参考错误可操作性；10 分钟／24 小时／自动续跑次数不成为本卡 WorkMesh 保证 |

完整分页研究已由 TA00 路线承接，本卡只复核原 TA02 列出的四页。没有将 Todos 文档当作 WorkMesh 协议或作为凭据、设备和付费请求授权。

## 固定写作来源与文档同步

团队 `skills` 列表返回空库。本轮按用户明确要求使用仓库固定 [zh-tech-writing](../../skills/zh-tech-writing/README.md)，上游 commit 为 `ffda9353768dece8aabd26ccb3a4978025e9437c`。已读 `SKILL.md`、`references/manual-structure.md`、`references/typography.md` 和 `source.json`；MIT 原件保持。没有全局安装或技能库变更。

读者是未看过对话的独审者和后续执行者，读完应能判断本卡新增范围、真实依赖、未决保证和验收责任。本轮没有产品行为变化，因此 integration 手册、配置、示例和参考无需修改；未来 P5 必须与真实能力同次维护。静态文档检查不能代真实鉴权、请求和恢复验收。

## 历史缺口与保留

旧 `docs/plan/todos-alignment-20261008/tasks/TA02.md` 和 `docs/plan/2026-10-08-todos-functional-alignment.md` 在准确基线不存在。TA00 已归档当时的 #34 规格，但它不含本轮最新批准，不能覆盖当前规格。本轮保留缺源结论，不凭记忆重建旧方案，也未展开全仓历史追找或复制其他工作树。

来源归档采用 JSON 行数组，按 LF 拼接还原实际返回，保留尾空格、工具截断和选段边界。正文哈希、文件字节与 Git blob 分开登记；回执在 [source-binding.md](source-binding.md)。没有声称工具返回可以证明未返回的 Saved plan 尾部。
