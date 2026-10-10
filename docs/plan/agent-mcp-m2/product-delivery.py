"""从真实回执生成整卡交付，保留冻结输入和历史失败；不把注册数量当运行验收。"""
from pathlib import Path
import json,re,zipfile,subprocess,hashlib
ROOT=Path(__file__).resolve().parents[3]
BASE=Path(__file__).parent
OUT=BASE/'product-evidence'
API='apps/api/integration/stage2-collaboration.integration.test.ts'
M2='packages/conformance/src/planning-collaboration.conformance.test.ts'
DOC='apps/api/integration/documents.integration.test.ts'
M1='packages/conformance/src/execution-recovery.conformance.test.ts'
M0='packages/conformance/src/mcp-coverage.conformance.test.ts'

def load(p):return json.loads(p.read_text(encoding='utf-8'))
def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def md(p,s):p.write_text(s.rstrip()+'\n',encoding='utf-8',newline='\n')
def main():
    runs=[(p,load(p)) for p in sorted(OUT.glob('run-*.json'))]
    def latest(predicate):
        return next(((p,r) for p,r in reversed(runs) if r.get('nativeExit')==0 and predicate(r.get('argv',[]))),None)
    root=latest(lambda a:a[-1:] == ['test:integration'])
    conformance=latest(lambda a:a[-1:] in [['src/planning-collaboration.conformance.test.ts'],['test:conformance:integration']] and '-t' not in a)
    # An older passed suite is historical, not a current pass if its exact test bytes changed.
    current=lambda pair: bool(pair and pair[1].get('sourceAfter',{}).get(M2)=={'bytes':len((ROOT/M2).read_bytes()),'sha256':hashlib.sha256((ROOT/M2).read_bytes()).hexdigest()})
    m2run=conformance if current(conformance) else (root if current(root) else None)
    gate_commands=['lint','typecheck','test','test:integration','test:e2e','build','check:route-policy','check:workmesh-skill','check:runner-skill','ci:test','ci:validate','smoke:agents']
    gates=[]
    for name in gate_commands:
        pair=latest(lambda a:a[-1:] == [name])
        gates.append({'command':'pnpm.cmd '+name,'receipt':pair[0].name if pair else None,'exit':pair[1]['nativeExit'] if pair else None,'runtimeSeconds':pair[1]['runtimeSeconds'] if pair else None,'passedScope':'该命令真实回执；适用源码是否变化另见source-binding，不冒后续CI' if pair else '尚无通过回执'})
    scenarios={
      'G1':('多页文档/六个history revision、restore新revision、五个同毫秒异微秒Milestone/Issue/relations准确遍历；Room/Inbox claim/read/ACK/reply分开；Human接受Handoff后真实Worker及Pi接续。',[M2,DOC,API],['document-comments-decision.json','planning-import-recovery.json','inbox-handoff-chain.json']),
      'G2':('跨owner/Team、Human-only发布/接受/评论写、他作者member编辑在现行role policy层拒；同member真实登录可读，特权maintainer角色夹具合法创建/编辑，不冒仅作者才能写；未claim正文拒；分页后撤权、C写等待后Human撤权先提交零事实。',[M2,DOC,'apps/api/integration/route-policy-authorization.integration.test.ts'],['document-comments-decision.json','planning-graph-revocation.json','human-comment-faults-and-collaboration-restart.json']),
      'G3':('反向blocks/parent循环及引用Milestone删除拒；archive后不能改Doc；Handoff错阶段、exact Inbox错Session拒，合法边和未引用资源删除成功。',[M2,DOC,API],['planning-import-recovery.json']),
      'G4':('Human评论显式同key/body一事实、异体409；SDK默认独立调用新key，网络重试同key/body；导入故障部分成功→重连同mapping继续→同hash回放；TTL过期仅先读准确mapping对账零写。',[M2,API,'packages/agent-sdk/src/index.test.ts'],['planning-import-recovery.json','lease-independent-calls.json','human-comment-faults-and-collaboration-restart.json']),
      'G5':('Document旧revision、仅错误baseRevisionId、仅错误hash分别拒不覆盖；relation删除/Handoff/reply沿原If-Match合同，旧Plan两创建精确STALE_PLAN_VERSION。',[M2,DOC,API],['document-comments-decision.json']),
      'G6':('Doc事件失败、Human评论/关系/Inbox claim及reply真实outbox故障回滚；Handoff转换旧套件故障回归；导入前实体保留、后实体失败后续补，明确逐实体原子。',[M2,DOC,API],['planning-import-recovery.json','human-comment-faults-and-collaboration-restart.json']),
      'G7':('Room/Inbox Worker重复投影不产生双消息/receipt；claim/reply同key；Handoff Human complete走真实原命令；receiver重复409及新Worker读取已delivered行不重发。',[M2,API,'apps/worker/integration/stage1-lifecycle.integration.test.ts'],['inbox-handoff-chain.json','delivery-fence.json']),
      'G8':('双claimant/Doc编辑竞争；真实barrier观察pg_blocking_pids，反向blocks/parent各一提交一cycle409；reply与Human resolve按锁后事实只一结算；八HTTP图写及Automation实际新事务前置同namespace锁，Team删除等待workspace边界。',[M2,DOC,API],['planning-graph-revocation.json']),
      'G9':('API真实close/listen重启后读取原Document revision/history、claimed Inbox正文、import mapping，业务指纹不变；原M1等待/Stop/pause/撤权与durable cursor恢复回归。',[M2,M1,'apps/api/integration/stage0.integration.test.ts'],['human-comment-faults-and-collaboration-restart.json','pi-creation-response-and-restart.json']),
      'C1':('实际Pi调用两创建工具并解析模型实收创建响应五绑定字段/任意预算维度，与REST投影/DB比对；有限预算100→60→40，真实Worker/HMAC receiver→exchange/ACK→Pi双证据→父完成，Session completed/Turn与Attempt settled。',[M2,API],['pi-creation-response-and-restart.json','finite-budget-chain.json']),
      'C2':('三方能力任一缺拒；reviewer无publish_plan及非code_review拒；父/他Actor/他Session的Room或Artifact、普通Activity不能替本人双证据；live Token/原Connection/installation/principal/member/资源重验及空页失权零22事实。',[M2,API,'apps/api/integration/agent-lock-order.integration.test.ts'],['projection-pages-denial.json','delivery-fence.json']),
      'C3':('required12种非completed状态逐准确blocker IDs阻父，nonrequired同12状态真实父完成正对照；structured review/noArtifactReason不豁免本人双证据；默认父/step8第九拒，特权step低限额跨Plan稳定ID，旧绑定可读。',[M2,API],['projection-pages-denial.json']),
      'C4':('两创建同key一Session/Delegation/reservation/Lease/事件；预算异体冲突；Room/Artifact/完成幂等回归；默认新调用新UUID，单次重试不换；Lease heartbeat/renew独立调用新结果，原M1终态原动作只读确认。',[M2,API,M1,'packages/agent-sdk/src/index.test.ts'],['finite-budget-chain.json','lease-independent-calls.json']),
      'C5':('两创建旧Plan分别STALE_PLAN_VERSION零事实；stable step跨Plan版本限额；创建无If-Match，完成使用准确revision且旧版本拒，不自动改意图。',[API,M2],['pi-creation-response-and-restart.json']),
      'C6':('review创建8处真实SQL插入故障，Session/授权/预算/Lease/prompt/token/事件/outbox全回滚；本人Artifact/Room/父完成outbox故障不推进；无事务前投递。',[API,M2],['delivery-fence.json']),
      'C7':('真实Worker receiver重复投递409，重建Worker消费已delivered行不多发；旧claim/nonce/token来源关闭，重复ACK/Room/Artifact无双事实，failed required child不替换。',[M2,API,M1],['delivery-fence.json','self-claim-notification.json','legacy-self-claim-recovery.json']),
      'C8':('受控barrier及pg_blocking_pids实际等待：mixed child/review预算、Plan发布竞创建、父完成竞子完成、review_shared竞exclusive；legacy活跃review无reservation计有效预算，新review有reservation不双计。',[API,M2],['finite-budget-chain.json']),
      'C9':('真实API重启22表binding/reservation/Lease/required blocker保全；Stop/原撤权优先零外发；准确无nonce创建Token ID与错ID/旧缺ID/过期租期拒发；Pi fail两事务成功/旧rev/Stop/revoke/失响应分别核Turn/Attempt与Session事实。',[M2,API,M1],['pi-creation-response-and-restart.json','self-claim-notification.json','legacy-self-claim-recovery.json','pi-session-failure-success.json','pi-session-failure-stale.json','pi-session-failure-stop.json','pi-session-failure-revoked.json','pi-session-failure-response_lost.json'])
    }
    frozen=load(BASE/'acceptance-matrix.json');rows=[]
    for original in frozen['cases']:
        identity=original['testId'];description,files,evidence=scenarios[identity.replace('M2-','').replace('-','')]
        entries=[]
        for path in files:
            source=(ROOT/path).read_text(encoding='utf-8')
            titles=[{'line':source[:m.start()].count('\n')+1,'title':m.group(1)} for m in re.finditer(r"\bit\(['\"]([^'\"]+)",source)]
            entries.append({'file':path,'titles':titles,'meaning':'精确套件入口和当前行号；含既有回归，非每标题都独占此行'})
        rows.append({'testId':identity,'frozenRawLine':original['frozenRawLine'],'category':original['frozenCategory'],'actualAssertions':description,'status':'本机指定场景已通过；完整结果待正式成果独审' if m2run and root else '当前新组合待结束，不以历史通过代当前','receipts':{'rootIntegration':root[0].name if root else None,'currentM2':m2run[0].name if m2run else None},'testSources':entries,'evidenceMembers':['ci-logs/planning-collaboration/'+n for n in evidence],'notApplicableAndLimits':original['applicabilityAndLimits']})
    dump(BASE/'product-closure-matrix.json',{'source':'18条原冻结行逐字保留；规划acceptance-matrix不倒写为产品通过','rows':rows,'formalReview':'尚待Chief平台_oY独立成果审查','countsAreNotCoverage':True})
    lines=['# M2 原18行／九类产品闭合矩阵','','原冻结规划表不修改。下列场景分别由真实HTTP、MCP、Worker和Pi覆盖；不是每个操作、身份与消费者的全排列。准确入口、行号和原行全文在同名JSON；输出原字节在对应run输出ZIP。','', '| 原行 | 类别 | 实际断言／边界 | 当前组合 |','| --- | --- | --- | --- |']
    for row in rows:lines.append('| '+row['testId']+' | '+row['category']+' | '+row['actualAssertions']+' 不适用／限制：'+row['notApplicableAndLimits']+' | '+str(row['receipts'])+'；'+row['status']+' |')
    md(BASE/'product-closure-matrix.md','\n'.join(lines))
    binding=[]
    current_paths={n for _,r in runs for n in r.get('sourceAfter',{})}
    current_bytes={n:{'bytes':len((ROOT/n).read_bytes()),'sha256':hashlib.sha256((ROOT/n).read_bytes()).hexdigest()} for n in current_paths if (ROOT/n).is_file()}
    for p,r in runs:
        if 'nativeExit' not in r:continue
        before=r.get('sourceBefore',{});after=r.get('sourceAfter',{});changed=[n for n in sorted(set(before)|set(after)) if before.get(n)!=after.get(n)]
        current_differences=[n for n,v in after.items() if v!=current_bytes.get(n)]
        binding.append({'receipt':p.name,'sourceUnchangedDuringCommand':before==after,'changedDuringCommand':changed,'currentDifferencesFromEnd':current_differences,'meaning':'全局指纹逐差异明示；docs/plan另artifact索引，生产运行/测试作用域不能由全局不同直接推断'})
    dump(BASE/'product-run-source-binding.json',{'runs':binding,'combination':'根集成全链与之后增量M2重跑组成；仅测试体变化时，已通过且未依赖该文件的生产/单元/E2E/build不重复，当前lint/typecheck复验','historicalCommitVsRuntime':'每run的before/after是当时实际工作树；product-source-manifest分列Git blob与Windows运行字节，不将CRLF原件hash冒Git hash'})
    gate_table='\n'.join('| '+g['command']+' | '+str(g['receipt'])+' | '+str(g['exit'])+' | '+(f"{g['runtimeSeconds']:.3f}" if g['runtimeSeconds'] is not None else '未结束')+' |' for g in gates)
    md(BASE/'product-report.md',f'''# M2 产品成果报告

本卡按已审方案完成既有规划协作、普通child与独立reviewer消费者补齐及安全闭环。本机运行结果如下；停正式成果review，尚无本候选平台独审、最新PR Required CI或actual Done/main验收结论。M1不重开，规划历史通过不冒产品通过。

## 产品与合同

- 新增有界 `GET /api/v1/agent-sessions/{{id}}/children` / `listAgentSessionChildren`，父live准确E/原Connection/principal/membership/授权和历史Plan/version/stable step绑定每页重验。允许子终态，拒父终态/撤权/错Team或child，包括空页。只返回白名单状态/绑定/授权结果Artifact ID，无Token/prompt/正文和22表业务写。通用get权限保持。
- 两创建共用准入、稳定step跨版本限额及真实三方能力交集；保DB父累计总量与API活跃层，终态不释放累计槽。正常父/step用DB默认8，没有客户端上限DTO；较低上限仅特权测试夹具。可选reviewer `budget` 是已明确批准合同，省略维度继承，有效执行预算/继承预算/reservation同值，超cap或累计余额不足拒，既有reservation不释放。活跃legacy review无reservation按原预算补计，新reservation只计一次。
- 两创建专用passthrough响应保 `parent_session_id`、`plan_step_version_id`、`required_for_parent`、`inherited_budget`、`max_child_sessions` 和任意numeric预算维度/额外字段，review wrapper/Lease保留。真实Pi调用两创建，解析模型实收原创建输出，与REST/DB比值；GET不替代模型收到的创建输出。
- reviewer无plan:write、无自动发布；必须本人Room review_result和本人code_review，父/他Actor/他Session/Activity/structured review/noArtifactReason均不能替。required全部12种非completed状态准确blocker IDs阻父，nonrequired同状态有完成正对照。
- SDK/MCP/Runner补全分页与Document/history/diff/restore/export/Guidance读、层级relation、合法Decision、评论读、Room/Inbox/Handoff。Runner新增具名计划评论/assignment proposal/context delta/fail，固定自身E；Human-only评论写、Guidance发布、Decision finalize及Handoff accept保持Human权。安装准确target inspect/reject、宿主ACK/heartbeat/Stop/origin确认和alias在91表分列。
- SDK独立写调用/Lease maintenance生成新默认key，单次网络重试保同key/body，显式key原样。MCP结构化拒绝保持code/details/correlationId。发现由M0/M1受控增量合成M2；manifest不代领域授权。公开Skill按原发行流程，内嵌Runner pin同步。
- 微秒分页按PostgreSQL `created_at::text` 和id排序/签名边界，不把微秒降成JavaScript毫秒；内部cursor列不外泄。原格式cursor继续接受，旧毫秒cursor丢失精度无法补回，需首屏重新遍历。五个同毫秒不同微秒真实多页/后页撤权已跑。
- 八HTTP图写及Automation Worker create_work_item新事务，在业务/authority/idempotency/行锁前取workspace KEY SHARE与现有workmesh-planning advisory；实际barrier/pg_locks/pg_blocking_pids覆盖反向cycle及正常恢复、撤权先提交和Human Team删除。workspace排他边界用特权SQL锁夹具，现API无workspace DELETE，未虚构入口。无关cycle/labels/status/boardrank不扩入此修复；不据局部前置锁宣称全系统无死锁。
- Worker实际到受控本机HMAC receiver后exchange/ACK，真实重放/新Worker、过期claim/fence与撤权Stop零HTTP。无nonce selfclaim通知准确Token ID由创建事务保存，错来源/旧缺ID失败关闭；原准确C与未失效claim receipt可exchange/ACK但不修复旧通知，原receipt或来源不可用时无合法自动恢复。不填历史猜测绑定。250ms/NOWAIT是有界回滚重试，不是消除所有循环；许可checkpoint commit后在途HTTP不能召回。
- Pi fail先settle失败Turn/Attempt，后独立 `/fail` 使用准确ifMatch/key/body；两个事务成功/拒绝/失响应各记事实。Stop/撤权优先，completion/wait/failure互斥，外部效果标志来自实际quiescence。Session failed与Turn failed分别核。崩溃或后事务未知不自动恢复、不重复settle/Stop cleanup，不扩新恢复域。

无数据库迁移、已应用迁移改写或新增事件类型；现行持久表/事务事件/outbox复用。代码/协议/CI/测试逐文件双字节见[source manifest](product-source-manifest.json)与[完整源码ZIP](product-source-snapshot.zip)。现行ADR0082说明安全/兼容取舍，原Proposed方案及旧5356/2b8源不改写。

## 实际验证

| 精确命令入口 | 原回执 | native exit | runtime秒 |
| --- | --- | --- | --- |
{gate_table}

以上命令实际argv/cwd/起止时点/退出和原输出SHA在[全部检查结果](product-check-results.json)及product-evidence/run原件。Turbo cache命中明确保留，不把缓存日志重复计数；逐套件Tests/Test Files、skip和node:test汇总从stdout原行提取，不从exit猜数量。根集成真实包含M0/M1/M2，逐套件删除include的CI负例仍在；旧main checks不替新组合。之后仅增补M2测试体时单独跑当前M2组合，[运行前后源码差异](product-run-source-binding.json)分列，不声称全局字节不变。

根run099原汇总：DB 81通过；API 270通过/1 skip；M0/M1/M2 39通过；Worker 120通过/1 skip；recovery 1 skip。E2E run106为70通过。最后M2补测run113为11通过/无skip；Skill EOF修正后unit/build/lint/typecheck与三套conformance另有当前回执，不冒旧pin已受测。根integration/E2E后的实际增量只在M2测试体和Skill EOF/生成pin，UI/API/SDK/Worker业务源码保持；新pin由三套真实Pi消费者组合验证，不为文档回执再重跑无变化的其它根套件。

18条冻结行九类正拒、幂等、版本、回滚、重放、并发及恢复分别见[闭合矩阵](product-closure-matrix.md)。其中API以Fastify真实路由+PostgreSQL断言，conformance以实际监听HTTP/MCP、受控HTTPS假模型和真正Pi子进程，Worker到真实受控receiver；都不是真实外部WorkMesh平台数据。[91操作结果](product-operation-results.md)分REST完成回执、SDK、MCP具名绑定、Runner动态/alias/宿主/Human与安装边界。注册数量只用于一致性核查，未声称91×全部身份×三个消费者穷尽。

原skip保持：API workbench-runner一条live MiniMax需要RUN_WORKBENCH_LIVE和团队secret，Worker retention-upgrade-barrier需要RUN_RETENTION_UPGRADE_INTEGRATION专门并发升级环境，recovery真实备份/restore演练需要RUN_RECOVERY_INTEGRATION及source/target test库、工具容器和S3；本批未缩减原门禁或拿skip冒通过，M2假模型真实Pi链不依赖这些skip。现有#5三OS/版本发行门禁未缩减；本轮仅Windows当前构建，不冒Linux/macOS或新版本分发验证。

## 首败、准备与资源

全部失败和unknown回执保留，不删断言、不放宽skip/权限。原001–020 privileged DB读取payload且127.0.0.1:9999无receiver只为历史夹具，不证明真实投递。原root039、065失败；067越rootDir生成122叶文件已在failed-build-emitted.zip逐字节保全，逐path核绝对workspace/link/活动引用后清理，清理不能算build通过，随后干净source build才取0。原082是真实PostgreSQL层级40P01死锁；原“消除循环”推断纠正为局部图锁前置和发送锁有界回滚重试，原失败日志保留。Activity progress不合法、/stop错入口、resolve缺If-Match、API config导入、两次授权永久撤权/创建command返回误判等夹具首败见每run原输出，未回写成通过。旧run073只有running记录、无最终exit，保持unknown，不补码。

本轮补测run107的member合法写正例被现行role policy拒绝，保首败后使用明确maintainer特权夹具；run108缺MCP Room必需sessionId，保原structured拒绝后按合同补准确父身份。完整main范围run117空白检查native exit 2（工具外层退出显示另分列），仅多余Skill EOF空行，原Git/工作树字节ZIP保全后删除空行并生成新pin；原规则未放宽，后续完整范围diff --check真实0。旧资料服务日志可读本规范化之前在service-logs-raw.zip保无损脱敏原件，旧内容不倒写为新运行。

测试服务通过product-checks独有owner标签/容器ID，32字节临时主密钥只入进程，S3独有tmpfs bucket先Create/Head验证；原secret长度/RustFS权限首败保留。健康长命令实际退出后才保全脱敏service日志原字节及逐命令准备/恢复/清理原件。共享镜像、store、服务、当前恢复目录及G1D0C3拒目标保留，没有global prune/换工具绕拒。[资源结果](product-resource-results.json)列每owner、ID、端口、准备与删除exit；原登记缺逐命令原件如实标记。Pi/HTTP/MCPlistener关闭、scratch工作区回执在run输出ZIP cleanup/resources字段，不以总exit猜清理成功。

## 演示与审查入口

在新独有test服务环境执行product-checks.py all，可顺序重现根integration/E2E；无需提供聊天凭据。当前M2真实套件执行 `pnpm.cmd -C packages/conformance exec vitest run --config vitest.integration.config.ts src/planning-collaboration.conformance.test.ts`。先看pi-creation-response-and-restart/finite-budget-chain，再看selfclaim/projection、document/import、Inbox/Handoff和pi-session-failure实收JSON，最后核源码指纹与原stdout。原来源877条、18冻结行及平台saved copy/独立implementation原件未取得的限制仍保历史含义。

本候选到正式平台_oY成果独审后须闭blocking/high，再核最新PR Required CI与actual main/Done；本报告不自审、不自confirm、不merge或开始M3。UI/F/TA、真实外发/公共发布/团队凭据扩权不在本卡。
''')

if __name__=='__main__':main()
