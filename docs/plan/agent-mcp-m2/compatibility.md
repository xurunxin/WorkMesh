# 消费者兼容与身份分工

| 消费者 | 保持／增量 | 正例与拒绝 |
| --- | --- | --- |
| REST／Zod | 新 GET additive，creation 输入字段不新增；DTO 新 typed，旧 Session 返回字段保留；无新 migration/event | 原 HTTP 消费者继续解旧响应；新 strict GET 拒额外字段／错父 |
| SDK | 现有方法与显式 key 保持；新增 typed 查询；缺省协作 key 每 invocation 新 UUID，内部 retry 同 key | 两次同 step 新 intent 可创建；网络重试仅一事实；跨 invocation 需要重放的调用方必须持久保存并显式传 key |
| MCP | 旧 tool name/schema 保留；read-only 无写；成功 structuredContent.data，失败 isError/error 完整 | 同名字注册不证明可用；缓存 Human-only／撤权工具拒绝，C/E bridge 不换共享 Token |
| C／E | C 规划 CRUD 与 E exact scope 分列，新增父子 GET 只允许直接 E；既有创建目标 bridge 仅按已有真实 binding | E 不借工具获得 Team CRUD；C Team scope不能替代 Document exact owner／Room subject；SDK getSession 不扩子权限 |
| Runner | api.sessionId 固定父与作者；role＋qualified manifest 交集；GET 不写 Activity，写沿 attempt/toolCallId 幂等 | reviewer 获 code_review／review_result／完成而无 publish_plan；普通 child 无 plan/artifact 能力不默认添加 |
| Worker／交付 | 同事务 provisionNewSessionDelivery，不新增自主 Runner admission 或自动给子建 Turn | commit 后 fake webhook／adapter 交付再 ACK；仅 queued 不算启动；重放不双建 |
| Document 分页 | list 的 UUID cursor、history revision-number cursor按现行真实合同保留；opaque 仅表示调用方不解释，不将它们说成签名 cursor | 两页超过 page size 且撤权后拒；不同 owner/current cursor沿原校验，不全局改格式 |
| Guidance | 三 scope current GET；history/diff 的现行 route actorKinds 也是 Human-only，保留 Human 回归；发布／archive／rollback保 Human | 不因 history/diff handler 纯读而越 route gate；Guidance rollback 不是普通 Document restore |
| Room | getWorkRoom 返回准确 Room 元数据；Agent 正文走 exact Inbox／claim | timeline 现行 Human-only，无 Agent timeline 工具；Human 多页 timeline作原消费者回归 |
| Inbox | exact recipient／immutable claim／ACK 与 reply 分工，scope/status/cursor完整传递 | 未 claim 仅 metadata，ACK 不 resolve；reply 原 revision，不跨 Session继承 |
| Handoff | list/offer/request 与准确目标 installation inspect/reject；cancel/complete/accept 当前 Human 门禁保留 | H accept 后目标 Session 接续；Agent 不能借 SDK cancel/complete 的存在获权限 |
| import | C 复合规划逐实体 durable mapping／key，输入同 hash断点恢复、期限后先对账 | 部分成功报告且恢复复用已提交实体；无全项目事务原子承诺，无 Pi复合导入新工具 |
| 存量 child/review | 旧 child exact binding可投影；缺 binding失败关闭；旧 review预算无 reservation不补写，以 active事实计算占用 | 旧 active review 阻过额新 admission，terminal只退出活跃计数／无reservation虚占；父累计总量槽位和已有reservation均不释放 |
| CI | 新真实 suite 需 root include／unit exclude／Required api job与逐suite删除负例 | 删除任一必含 suite 或 failed/skipped Required job必须失败；不把 docs目录脚本／JSON／ZIP当 prose |
| 内嵌／公共 Skill | 仅产品阶段更改内嵌 Skill并重生 pin；公共签名发行不变 | check:runner-skill 验新内嵌输入，公共发行未获批／未测维持原记录 |

变更范围以 operation-decisions.json 的 family／decision／credentialsAndScope 为准，M1依赖与 Human保留动作均显式分列。M1 已闭合同正常消费；其旧绿色不覆盖 M2 新组合。
