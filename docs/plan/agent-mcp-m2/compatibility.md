# 消费者兼容与身份分工

| 消费者 | 保持／增量 | 正例与拒绝 |
| --- | --- | --- |
| REST／Zod | 新GET additive；ReviewDelegationInput增加可选budget，普通child原budget保留；创建专用child schema保全五字段／budget record／passthrough额外字段，review保session/lease wrapper；无新migration/event | review省略budget仍全额，明确缩减40可与旧60预留并存；新GET strict拒错父；不扩大通用Session get |
| SDK | 保显式泛型调用兼容；默认创建返回ChildAgentSession／ReviewDelegationResponse，新schema校验不丢parent/version/required/inherited_budget/max_child_sessions及额外字段；review input增加budget | 显式缩减各维度原样传递；same调用retry同key，跨调用新intent新UUID；预算record未知原维度不被budgetSchema剥离 |
| MCP | 旧tool name保留，create_review_delegation的schema增量可选budget；成功structuredContent.data用创建专用schema保字段，read-only无写，错误完整 | 省略旧输入继续全额，有限已有预留时拒绝码披露；显式40的真实MCP实收字段/预算与REST一致，缓存Human-only/撤权仍拒 |
| C／E | C 规划 CRUD 与 E exact scope 分列，新增父子 GET 只允许直接 E；既有创建目标 bridge 仅按已有真实 binding | E 不借工具获得 Team CRUD；C Team scope不能替代 Document exact owner／Room subject；SDK getSession 不扩子权限 |
| Runner | review工具新增可选budget数字record，固定api.sessionId父身份；按role/manifest给工具，GET不写Activity | 模型实收子执行budget40而非父100，核受控假模型usage；不把预算利用率投影冒hard cap。reviewer无publish_plan，普通child无plan/artifact权限 |
| Worker／交付 | 同事务 provisionNewSessionDelivery，不新增自主 Runner admission 或自动给子建 Turn | commit 后 fake webhook／adapter 交付再 ACK；仅 queued 不算启动；重放不双建 |
| Document 分页 | list 的 UUID cursor、history revision-number cursor按现行真实合同保留；opaque 仅表示调用方不解释，不将它们说成签名 cursor | 两页超过 page size 且撤权后拒；不同 owner/current cursor沿原校验，不全局改格式 |
| Guidance | 三 scope current GET；history/diff 的现行 route actorKinds 也是 Human-only，保留 Human 回归；发布／archive／rollback保 Human | 不因 history/diff handler 纯读而越 route gate；Guidance rollback 不是普通 Document restore |
| Room | getWorkRoom 返回准确 Room 元数据；Agent 正文走 exact Inbox／claim | timeline 现行 Human-only，无 Agent timeline 工具；Human 多页 timeline作原消费者回归 |
| Inbox | exact recipient／immutable claim／ACK 与 reply 分工，scope/status/cursor完整传递 | 未 claim 仅 metadata，ACK 不 resolve；reply 原 revision，不跨 Session继承 |
| Handoff | list/offer/request 与准确目标 installation inspect/reject；cancel/complete/accept 当前 Human 门禁保留 | H accept 后目标 Session 接续；Agent 不能借 SDK cancel/complete 的存在获权限 |
| import | C 复合规划逐实体 durable mapping／key，输入同 hash断点恢复、期限后先对账 | 部分成功报告且恢复复用已提交实体；无全项目事务原子承诺，无 Pi复合导入新工具 |
| 存量 child/review | 旧 child exact binding可投影；缺 binding失败关闭；旧 review预算无 reservation不补写，以 active事实计算占用 | 旧 active review 阻过额新 admission，terminal只退出活跃计数／无reservation虚占；父累计总量槽位和已有reservation均不释放 |
| 限额／预算兼容 | 父/step默认8，不新增客户端maxChildSessions；创建省略budget仍全额，新显式参数可减少review有效预算；已reserved永不因child终态自动释放 | 低限额只由特权测试夹具造；父100/child60/review40有限链必验，省略或41拒；旧正额预留＋全额review不可恢复的限制明确，取消Human调父预算承诺 |
| CI | 新真实 suite 需 root include／unit exclude／Required api job与逐suite删除负例 | 删除任一必含 suite 或 failed/skipped Required job必须失败；不把 docs目录脚本／JSON／ZIP当 prose |
| 内嵌／公共 Skill | 仅产品阶段更改内嵌 Skill并重生 pin；公共签名发行不变 | check:runner-skill 验新内嵌输入，公共发行未获批／未测维持原记录 |

变更范围以 operation-decisions.json 的 family／decision／credentialsAndScope 为准，M1依赖与 Human保留动作均显式分列。M1 已闭合同正常消费；其旧绿色不覆盖 M2 新组合。
