# 本卡实际缺口与接续入口

M5 联合验收尚未完成。下列是本卡问题记录，不是另建 todo，也没有授权新安装、登录、用户配置改动或真实外发。

## 外部客户端隔离与运行

`M5_OPENCODE_USER_SKILL_DISCOVERY`：已安装原生 OpenCode 在私有 XDG config/data/state/cache、APPDATA/LOCALAPPDATA、独有空工作目录和默认工具 deny 下，仍发现 `USERPROFILE/.agents/skills`。实际私有日志出现该目录的 watcher subscribe/started。这证明发现路径超出私有根；不声称已执行用户 Skill，也不能据此证明没有复用用户技能或插件。最终 `acceptance:joint` 在模型运行前返回非零，关闭本任务私有服务与监听器，保留现场。

此前两次实际 `run --standalone` 均在有界等待后退出，控制模型收到零次请求。MCP 握手／tools 列表连接发生过，不能等同于工具执行或模型实收；根因尚未定位。第一次位于仓库内的空目录仍发现祖先 AGENTS/仓库，后移至独有临时目录，仍存在用户技能发现。二者作为失败证据保留，没有以换用户 HOME、接用户服务、更新安装或连接真实 provider 绕过。

需核该已安装 runtime 是否提供且实际消费“仅私有技能／插件发现”的受支持入口，并解决 standalone 在既定拒绝出网条件下未进入控制模型的问题；没有成功的实际日志和模型 round trip 前，不重启四条外部联合链。不假定普通配置字段能覆盖默认 HOME 发现。若最终需要改变客户端选择、权限或外发条件，在原卡明确提出真实分叉。

OpenCode 的签名上传／下载两模型工具始终未授权。受控 Pi 传输和 MCP/SDK 协议结果不计作 OpenCode 传输支持。

## 尚未覆盖的联合与直接实证

O-N、P-N、O-G、P-G 四条规定联合主链均未完整通过。两个真实 Pi Connection 的交接和 fake Git producer/reviewer 补充链是独立证据；SDK 准备的领取／ACK、特权 membership/repository scope、fake provider webhook 准备独列，不冒 Pi 模型自主执行，更不冒 OpenCode collaborator。

同 owner/Session 的实际 Pi 与合法 SDK E 的两轮 revision 竞争已实现补充用例；O/P 两模型竞争、外部 MCP 真实进程重启与外部错误实收仍缺。独立父子、公开等待、Inbox、cursor、provider unknown/checkpoint 与并发／回滚边界以当前字节的原套件回归证明相应合同，不能并成新的四链联合通过。

新增真实 Pi 取证已覆盖第二次明确 HTTP 拒绝后 durable 未对账、后台 refresh 实际换 Token 后仍用冻结旧 E 重放、原 E 在服务器到期后401、Human 只停止当前 Turn 后零第二业务请求。到期与缩短 TTL 的准备使用本人特权故障夹具，普通 Token TTL／公开权限合同不变；不将服务器到期冒本机 held expiry 边界测试。Runner 本机 Token 到期、shutdown signal 关闭竞争、截止预算和其他排除错误仍以直接消费者单元为证，未补对应全部真实子进程竞争。真实 Stop、Human REST revokeDelegation、单次工具两次失响应、API PID 重启、自有 HTTP timeout、响应 body 流中断与三个白名单操作已有独立实际运行用例。模型回合可以 settled 而 external_effects_reconciled=false，不能据回合结算宣称业务完成或已对账。Stop／撤权后模型取消与错误实收按真实结果分列，不能要求被服务器取消的模型继续运行。

## membership 撤销诊断的合同缺口

两次真实 Pi 探针未通过预定拒绝断言：原 principal 在 Runner 准入前降为 workspace member／Team member，首 Document commit 后删除其准确 Team membership；原 E 的 Attempt status 仍200，业务第二次原 key/body/E 回执仍200，模型实收成功。没有恢复或换另一个 principal 使请求通过。`apps/api/src/authz/authorize.ts:loadAgentFacts` 的当前普通 E 授权事实未包含该 membership，`workbench-runner.ts` 的 status GET 只读取 Turn／Session／Delegation 状态；不可从 Git／等待恢复等其他路径的 principal 校验推断此路径已经拒绝。

事实保存在 `joint-real-revocation`／`joint-real-revocation-observed` 两次非零命令回执和 `pi-member-revoke-observation.json`。原受控诊断测试已改为既有 Human REST revokeDelegation 的独立负例，没有把原 membership 诊断改写成“撤权通过”；精确诊断步骤见 [原卡复现](input/product-membership-probe.md)。必须先核准普通 E 回执重放与 membership 撤销的现行安全合同，再决定修复范围；本轮未新增服务端权限规则，也未将该项打勾。正式 revokeDelegation 的401／数据库撤 E／零第二业务请求另有真实证据，不能替代此缺口。

## 门禁

本轮局部只读 review 与早前 65 条引用结果不作正式成果独审。产品报告只引用新执行回执。正式成果独审、最新 PR Required CI、actual Done/main 尚未具备，不能标本卡完成。其他 OS、个人 Lite 成品部署、团队成品部署、企业实机及真实 provider 账号均未测，原发行门禁不缩减。
