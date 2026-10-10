# 精确来源与观察边界

## 真实 main 与 M1 前置

首轮平台git实读两ref均cfce的原返回仍在[main-observation](input/main-observation.json)。本轮projectId不变，按同一 `ls-remote origin refs/heads/main refs/heads/tds/conv-01a121fb-781b-7b58-9bca-a596b92a8cbe` 精确读出main cfce与branch旧候选5356，保存于[revision-main-observation](input/revision-main-observation.json)，不从origin/main或共享FETCH_HEAD推断。

本地准确不可变对象的 tree／parents、M1 受审产品到证据 head 的完整 diff 列表见 source-manifest.json 的 commits／m1Precondition。main commit message 是 PR213 merge，tree 为 `ae2505b7740961f0e4c9f6c680ff90280b697af0`。本轮 todos 实读 M1 Phase=done；[CI411 实读](input/m1-ci411-readback.json)给出 run `37973142192` 十 job completed/success，含 Required CI。此原返回是摘要，不是 Actions 全日志下载，native exit/runtime 未提供则保持 null。

Chief 原发送的 PR merged、三项 blocking 闭合和准确 parent／tree 信息来自 Spec／反馈，分别保存，不冒为本 Agent 的独立审查。CI410 报告及原件索引是另一运行的历史源，未将其 ZIP 冒作 CI411。当前 M2 组合无产品实测／远端 CI 结论。

## 完整冻结来源

从准确冻结 commit 读取 README、batches-and-acceptance、coverage-matrix、operation-index、branch-separation、sources、review 七份完整 Git blob；本轮逐 blob 与开工 main 对比。不修订原报告的过时状态；以本轮 spec 的明确后续裁定解释历史。原节首尾按标题边界抽取，完整原字节在 ZIP 的 frozen/m2-section.md；frozen-m2.md 是同正文的可读副本，只规范 EOF 为一个 LF，原件／副本字节分列。

当前权威 CONTEXT、AGENT_PROTOCOL、OPENAPI、SCHEMA 及 ADR 全文，以及实际涉及的 API、domain、DB、SDK、MCP、Runner、Worker、conformance、CI、版本／内嵌 Skill 消费者全文均封存在 source-snapshot.zip。source-manifest.json 每项含真实 blob ID、bytes、SHA-256、对应 member；工作树字节另列。没有从工具截断前缀计算“全文 hash”。

## 首轮平台与手工注入（历史原件）

- 首轮 authoritative saved copy：用户消息中“this is the current plan”全文，原 doc ID 从 conversation 的 plan 链接绑定；保存于 input/platform-injected-savedplan.md。history/author-original-plan.md 保全本 Agent 原 plan 正文，history/author-original-response.md 保全可见原答复。只能证明可见文本保真，无法声称后台编码或未提供的创建／版本字段。
- todos 原读回：input/m2-todo-readback.json 明确含 truncated。仅比较可见 Saved plan 前缀；它不承担完整 plan hash。conversation 原读回含 in-flight 文本，作为其实际返回原件保全。
- 未收到单独的 implementation 完整平台注入、没有单独 doc ID／version／createdAt，相关字段为 null。首轮仓库执行副本已保存在旧候选 ZIP；当前 implementation.md 与 savedplan.md 同步本轮修订并 byte-equal，不能称从后台取得两份原件。
- 首轮 Chief 反馈、用户确认与四次 edit_plan 的 old/new 文本效力分列于 history/reviewed-provenance.json及input/plan-edits.json；当时新平台 doc ID 未知，历史值仍为 null。本轮实际已知 doc ID 另列于下节及 input/provenance.json。
- 工具返回保存的是可见 CallToolResult 的 JSON 序列化，不是 MCP wire、底层 HTTP 响应字节或隐藏 callID。缺失元数据保留 null。

## 本轮修订输入与旧候选

本轮完整Spec来自todos的Spec段，该段结束后Saved plan段才截断，原可见JSON保input/revision-todo-readback.json，完整Spec副本为input/current-platform-spec.md并与spec.md byte-equal。doc:prvLepVgLTOEbRNt56WSU正文来自本轮用户消息的authoritative saved copy，完整保存input/platform-injected-revised-plan.md／history/author-revised-plan.md，与savedplan.md／implementation.md byte-equal；仅对工具可见前缀作逐字符比较，不称后台计划全文读回。

input/original-review.md从本轮conversation返回中按真实assistant/plan_review消息边界提取，三blocking仍待复审；input/current-chief-feedback.md保本轮授权继续同范围修订。预算问题原卡q-ka2GipEunxQuHuFYGap2C的实际答复与doc链接可在原conversation中核对，平台身份和Chief补充来源分列，不伪造缺失version／createdAt／独立implementation。

history/reviewed-candidate.zip保存旧5356 commit对象及52份完整Git blob，history/reviewed-candidate-manifest.json逐member/commit/blob/bytes/SHA绑定；原首败和规划静态回执仍留且旧candidate原件不改写。当前proposal/源码运行字节由artifact-manifest和最新static-run回执前后指纹绑定，staged字节另核再提交，不把旧5356 static pass贴新预算组合。

完整原始plan差异另存history/reviewed-to-current-plan-original.zip，索引为history/reviewed-to-current-plan-manifest.json。原diff空白context行导致static-run-007失败，该回执原输出保全；.diff只规范行尾空白供阅读，不冒原始patch，也不改空白门禁。revision-main-final-observation.json另保提交前最后一次平台精确refs观察。

## 保全与资源

无新服务、容器、镜像、卷、网络或秘密。本轮创建的路径仅M2目录与Proposed ADR；Python／Node／git为有界静态子进程。原工作树、M0／M1证据和G1D0C3拒目标不删除、不移动。原探索缺路径与本轮PowerShell glob／局部patch不匹配属于规划探索不足，分列input/planning-first-failures.json及input/revision-exploration-failures.json，不当产品测试失败；原输出有编码/截断缺口不伪补全文。
