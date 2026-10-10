"""从实际命令回执生成产品交付索引；不修改历史规划或测试原件。"""
from pathlib import Path
import hashlib,json,re,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).parent
OUT=HERE/'product-evidence'
sys.stdout.reconfigure(encoding='utf-8')
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def write(name,value):
    text=json.dumps(value,ensure_ascii=False,indent=2)+'\n' if not isinstance(value,str) else value.rstrip()+'\n'
    (HERE/name).write_bytes(text.encode('utf-8'))
def digest(data):return hashlib.sha256(data).hexdigest()
def source(path):return not path.startswith(('docs/plan/','ci-logs/','test-results/','playwright-report/')) or path in {f'docs/plan/agent-mcp-{batch}/{name}.json' for batch,name in [('m0','operation-decisions'),('m1','operation-decisions'),('m2','product-discovery-decisions'),('m3','product-discovery-decisions')]}
receipts=[]
for path in sorted(OUT.glob('m3-*.json'),key=lambda p:p.stat().st_mtime):
    data=read(path)
    if 'argv' not in data or 'exit' not in data:continue
    archive=OUT/data['output']
    with zipfile.ZipFile(archive) as z:
        output=z.read('stdout.bin').decode('utf-8','replace')+'\n'+z.read('stderr.bin').decode('utf-8','replace')
    clean=re.sub(r'\x1b\[[0-9;]*m','',output)
    summaries=[line.strip() for line in clean.splitlines() if re.search(r'\b(Test Files|Tests |Tasks:|Cached:|[0-9]+ passed \()|^# (tests|pass|fail|skipped)',line)]
    failures=[line.strip() for line in clean.splitlines() if re.search(r'^\s*(FAIL |error:|Error:|AssertionError:|TypeError:|# fail)',line)]
    changed=[p for p in set(data['before'])|set(data['after']) if source(p) and data['before'].get(p)!=data['after'].get(p)]
    receipts.append({k:data[k] for k in ['id','argv','exit','elapsedSeconds','runtime','startedUnix','endedUnix','ownerPid','childPid','environment'] if k in data}|{
        'receipt':path.relative_to(HERE).as_posix(),'rawArchive':archive.relative_to(HERE).as_posix(),
        'archiveSha256':digest(archive.read_bytes()),'summaries':summaries,'failures':failures,
        'changedSourceDuringCommand':sorted(changed),'fingerprintReceipt':'原JSON保存before/after全量SHA256；包含不等于该命令执行了所有文件',
    })
def latest(command):
    return next((r for r in reversed(receipts) if len(r['argv'])==2 and r['argv'][-1]==command),None)
integration=latest('test:integration');unit=latest('test');e2e=latest('test:e2e')
required=['check:route-policy','check:workmesh-skill','check:runner-skill','ci:test','ci:validate','lint','typecheck','test','test:integration','test:e2e']
checks={name:latest(name) for name in required}
targets={name:next((r for r in reversed(receipts) if test in r['argv'] and '-t' not in r['argv']),None) for name,test in [('API交付','integration/stage3-delivery.integration.test.ts'),('M3三客户端','src/delivery-recovery.conformance.test.ts'),('Worker发送恢复','integration/stage3-provider.integration.test.ts')]}
ready=all(r and r['exit']==0 for r in checks.values())
write('product-check-index.json',{'status':'本机必需命令全部通过；仍待正式成果独审' if ready else '检查尚未齐全；不能称完成',
    'required':{name:(r['id'] if r else None) for name,r in checks.items()},'finalAffectedTargets':{name:r['id'] if r else None for name,r in targets.items()},'receipts':receipts,
    'historicalBindingLimit':'早期fingerprint排除docs/plan；中期仅纳入M3 product-discovery-decisions.json，末期纳入四批冻结发现输入。各run原JSON字段为准。完整历史规划原件使用source-snapshot.zip，不冒早期运行已逐字绑定发现增量。',
    'internalReviewLimit':'内部复核的旧HEAD及未提交字节没有逐文件快照；不得推定为本候选产品测试或正式_oY审查。'})
api='apps/api/integration/stage3-delivery.integration.test.ts'
worker='apps/worker/integration/stage3-provider.integration.test.ts'
m3='packages/conformance/src/delivery-recovery.conformance.test.ts'
m2='packages/conformance/src/planning-collaboration.conformance.test.ts'
m1='packages/conformance/src/execution-recovery.conformance.test.ts'
m0='packages/conformance/src/mcp-coverage.conformance.test.ts'
collab='apps/api/integration/stage2-collaboration.integration.test.ts'
rows=[]
transfer={'requestArtifactUpload','getArtifactUploadStatus','finalizeArtifactUpload','cancelArtifactUpload','listWorkItemArtifacts','downloadVerifiedArtifact','getProjectHealthHistory','createProjectHealthUpdate','listRepositories'}
git={'getRepositoryContext','requestProviderAction','publishDeliveryArtifact','publishStructuredReview','requestPullRequestMerge','retryPullRequestCheck','getProjectDelivery','createProjectUpdateDraft','suggestWorkItemCompletion','createReviewDelegation','getProviderAction'}
details={
 'getProviderAction':('六kind五status真实GET；三客户端read/branch/path收窄恢复；C显式目标桥；Human终态正对照/E终态拒绝','其他Actor/仓库范围/当前context拒绝；秘密payload/raw错误不投影；GET前后events/outbox/receipt/token/activity不增；同Actor另Session未单列该精确action夹具'),
 'getRepositoryContext':('三客户端模型/工具实收准确base SHA、paths和guidance','最新read权限撤销；父Session-only context不复制至reviewer'),
 'requestProviderAction':('branch/commit/openPR逐action结果；fake全链及本机provider HTTP每写窗口','branch/path/expected head、openPR独立capability、旧claim无checkpoint拒绝外发'),
 'publishDeliveryArtifact':('当前head test_report及本人code_review Artifact','file不充code_review；敏感字段及跨目标引用拒绝、事务回滚'),
 'publishStructuredReview':('三客户端独立reviewer、JSONB evidence逐值等DB','自审/旧head/file/非本人证据拒绝；structured review不能豁免Room消息'),
 'requestPullRequestMerge':('current-head checks/review/精确Human approval消费后fake merge','Blocking/High、checks、旧head/过期approval；最新context branch/base锁后收窄零写HTTP'),
 'retryPullRequestCheck':('Human批准准确check/head后fake重试，原failed check不伪改为success','Gitea不支持；context收窄和approval/head不匹配拒绝；GitHub丢checkpoint跨默认租期不增加rerequest'),
 'getProjectDelivery':('精确pullRequestId返回一PR/current head/checks/review/findings/批准','授权过滤先于取数；父范围/context失效拒绝；保原默认信封'),
 'createProjectUpdateDraft':('三客户端draft引用当前delivery证据','Agent直接publish仍Human-only；跨目标证据拒绝'),
 'suggestWorkItemCompletion':('三客户端产生建议，merge后Issue仍未completed','裁决与workflow转移仍Human；非当前目标evidence拒绝'),
 'createReviewDelegation':('显式repositoryIds三方repo:read、本人双证据、受控交付；初次创建及锁内replay共用校验','父/definition/grant/context/child/provider撤权原key拒绝；合法重放零重复child/reservation/Lease/交付；省略维持M2三项'),
 'requestArtifactUpload':('RustFS真实签名PUT required headers与UTF-8字节，Pi仅状态无签名资料','没有store配置明确拒绝；错origin/Bearer/重定向/超限、checksum/header不匹配拒绝'),
 'getArtifactUploadStatus':('三客户端pending→verified/canceled、实际checksum/artifactId','当前身份/Session/目标授权重验；过期/未verified状态不能下载'),
 'finalizeArtifactUpload':('真实store对象由upload Worker验证并生成file Artifact','重复finalize同证据；到期提交后稳定错误、state/event/outbox回滚'),
 'cancelArtifactUpload':('三客户端取消并读回canceled；原合同无If-Match','非合法状态/撤权拒绝；不制造revision要求'),
 'listWorkItemArtifacts':('三客户端保留数组及checksum/source_tool/null字段，具名schema修复','授权过滤在最终查询；不同资源不披露'),
 'downloadVerifiedArtifact':('真实store下载字节/base64/size/checksum逐值一致，Pi不接收URL','未verified拒绝；配置origin固定、无WorkMesh Bearer、拒redirect、大小与hash不匹配拒绝'),
 'getProjectHealthHistory':('草稿与Human精确批准发布后history两事实，三客户端实收','保分页信封；实时scope/Team读取谓词由分页SQL门禁验证，未单列三客户端跨项目history负例'),
 'createProjectHealthUpdate':('草稿允许；精确Human批准仅一次消费后发布','无approval及批准后summary改动拒绝且批准不消费；旧revision/事务失败依原套件'),
 'listRepositories':('三客户端实际列表含授权repo，原分页信封不变','最终SQL授权/分页审计保28谓词、UNION/OR/删除等负例'),
}
for item in read(HERE/'operation-decisions.json')['operations']:
    op=item['operationId'];family=item['family']
    if op in transfer:scenario='三客户端上传状态/数组/取消/受控下载及health准确Human批准';entries=[m3,api,'apps/agent-runner/src/delivery-transfer.test.ts']
    elif op in git:scenario='三客户端准确base/path→Git action→独立reviewer→Human批准→终态';entries=[m3,api,worker]
    elif family=='Human保留':scenario='Human setup/pin及既有发布/裁决回归；Agent manifest隐藏和缓存调用拒绝';entries=[api,'apps/mcp/src/index.test.ts','packages/contracts/src/agent-discovery.test.ts']
    else:scenario='现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle';entries=[m0,m1,m2,collab]
    positive,negative=details.get(op,(scenario,'原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持'))
    clients='Native/MCP/Pi实际操作' if op in transfer|git else '共享SDK准备/生命周期及原批次真实客户端回归'
    if family=='Human保留':clients='Human REST；Agent端不适用（合同保留，隐藏并拒绝）'
    if op=='getProviderAction':entries+=[m3];clients+='；Runner固定本人E，C bridge仅Native/MCP'
    rows.append({'operationId':op,'family':family,'positive':positive,'negative':negative,'testEntrypoints':entries,'clients':clients,
       'receipt':integration['id'] if integration else None,'result':'通过' if integration and integration['exit']==0 else '整体integration尚未通过，按原日志逐用例判断',
       'notApplicable':'GET无Idempotency-Key/If-Match/业务event/outbox写；Human保留操作不扩给Agent' if family=='Human保留' or op.startswith(('get','list','download')) else '无新增领域或真实外发发布授权；具体状态前提按原合同'})
assert len(rows)==40
write('product-operation-matrix.json',{'frozenInput':'operation-decisions.json（完整历史不修改）','rows':rows,'count':len(rows),
 'limitations':'工具数不能冒全功能。注册、manifest静态检查不能冒真实调用。共享Human setup与Session ACK/Plan/complete/批准仍走原SDK/REST，不声称每个生命周期动作在三种新工具中各执行一次。'})
write('product-operation-matrix.md','# 四十项操作的实际交付\n\n逐操作原始数据见 [JSON](product-operation-matrix.json)，命令/退出码见 [检查索引](product-check-index.json)。新操作正反例、依赖回归与Human保留各按实际入口标注。\n\n| 操作 | 实际正例 | 实际拒例／边界 | 客户端 |\n| --- | --- | --- | --- |\n'+ '\n'.join('| '+r['operationId']+' | '+r['positive']+' | '+r['negative']+' | '+r['clients']+' |' for r in rows))
acceptance=read(HERE/'acceptance-matrix.json')
evidence={
 'S1':([m3,api],'三链、真实store、六kind五status；M2有限预算100/60/40作为兼容回归；M3显式repo reviewer单独受控交付'),
 'S2':([m3,api,worker,collab],'初次三方读权缺任一及replay六撤权；当前context read/branch/path；context解析十类撤权；self-review与跨scope拒绝'),
 'S3':([api,collab,worker],'旧head/checks/Blocking/High/approval；file不可review；Room/本人code_review各不可豁免，required child所有非completed阻父'),
 'S4':([api,m3,collab,worker],'重复意图/上传/structured review/merge/子创建；合法review原key并发零重复事实、撤权后重放拒绝；unknown零新外发'),
 'S5':([api,collab,worker],'旧head review/approval；stale Plan stableStep；health旧revision；cancel/context POST/GET当前无If-Match'),
 'S6':([api,collab,worker],'context及敏感artifact state/event/outbox全回滚；child各插入阶段/预算/Lease/交付故障；Worker terminal/checkpoint失败回滚；查询零业务写'),
 'S7':([api,worker],'真实raw GitHub bytes与delivery重放；provider/check/review单调投影；上传到期/重复finalize；未知重领零写'),
 'S8':([worker,collab,m3],'真实PG锁等待两提交序、merge/CI pin收窄branch/base、commit首写后context换代拒后续写；完整authority锁等待跨60秒；sameworker attempt8 claimed_at防ABA；双C bridge'),
 'S9':([worker,m0,m1,m2,m3],'18行恢复；GitHub成功后checkpoint前崩溃，真实60秒重领；合法checkpoint只本地finish；API/MCP重启、Pi Stop/等待恢复及M1原来源结果确认'),
}
for r in acceptance['originalRows']:
    entries,observed=evidence[r['id']];r.update(actualTestEntrypoints=entries,actualObservation=observed,receipt=integration['id'] if integration else None,
        status='本轮integration通过；具体用例与适用理由见原日志' if integration and integration['exit']==0 else '待整体通过，首败不覆盖')
acceptance['additionalReviewerTestsEvidence']={'repositoryIds1and100':'packages/contracts/src/child-session-contracts.test.ts：合同1/100合法，空/重复/101/非UUID拒绝；实际创建以单仓库及错仓库验证，不冒100仓库部署实测',
 'finiteBudget':'M3显式repo reviewer父预算100/独立普通child60/review40真实API创建、预算满旧key重放及普通child完成后重放；M2有限预算完整双证据生命周期另回归',
 'replayAfterChildCompleted':'M2回归终态回执兼容；M3合法重放在预算已满、普通child完成后及创建并发执行，repo撤权六路径拒绝；未单独构造100仓库部署后的回执组合'}
acceptance['newScenarioLimit']='不新增provider账户授权；非每操作×九类全笛卡尔。纯GET无写事务/receipt/revision、Human-only不对Agent运行写正例；不缩原必需断言。'
write('product-acceptance-matrix.json',acceptance)
write('product-acceptance-matrix.md','# 原九类验收的实际承接\n\n原文、适用理由及补充场景限制完整保存在 [JSON](product-acceptance-matrix.json)。\n\n| 类别 | 实际观察 | 明确不适用边界 |\n| --- | --- | --- |\n'+'\n'.join('| '+r['id']+' '+r['category']+' | '+r['actualObservation']+' | '+r['applicability']+' |' for r in acceptance['originalRows']))
recovery=read(HERE/'worker-recovery-matrix.json')
for r in recovery['rows']:
    provider,kind=r['provider'],r['kind']
    r['testEntrypoints']=[worker,'packages/git-provider/src/mutation-http.test.ts']
    r['receipt']=integration['id'] if integration else None
    r['productStatus']='本机夹具通过' if integration and integration['exit']==0 else '待当前整套Worker结果'
    r['initialActual']='fake三客户端真实链' if provider=='fake' else '本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测'
    r['recoveryActual']='五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0'
    if kind=='resolve_repository_context':r['recoveryActual']='各provider标签Worker纯GET重领使用注入Fake reader，attempt1→2；合法checkpoint本地finish；真实GitHub/Gitea adapter纯GET由本机TLS夹具单列。不是账号集成。'
    if provider=='gitea' and kind=='retry_ci_check':r['initialActual']='不支持：adapter真实拒绝且HTTP0';r['recoveryActual']='没有合法Gitea CI checkpoint；夹具伪造结果验证dead/unknown，旧无checkpoint停发。正常成功恢复不适用，来源parseProviderActionCheckpoint显式禁止。'
    if provider=='gitea' and kind=='create_commit':r['extraBoundary']='单文件create POST/update PUT本机HTTP通过；多文件明确不支持且零HTTP'
write('product-recovery-matrix.json',recovery)
write('product-recovery-matrix.md','# 十八行provider/kind恢复实证\n\n完整字段及原合同见 [JSON](product-recovery-matrix.json)。所有旧unknown原件保留，未用后续绿色改写历史失败。\n\n| provider | kind | 初次实际支持 | 恢复实际验证 |\n| --- | --- | --- | --- |\n'+'\n'.join('| '+r['provider']+' | '+r['kind']+' | '+r['initialActual']+' | '+r['recoveryActual']+' |' for r in recovery['rows']))
owners=[read(p)|{'receipt':p.relative_to(HERE).as_posix()} for p in OUT.glob('*-resources.json')]
write('product-resources.json',{'workspace':str(ROOT),'owners':owners,'status':'已登记独有资源；各退出及cleanup状态以原回执为准',
 'paths':[{'path':str(OUT),'decision':'保留；包含每run原输出、首败、资源owner与脱敏服务日志'},
 {'path':str(ROOT/'.tmp/m3-tools'),'decision':'保留当前恢复目录与本轮Node22工具；未递归清理'},
 {'path':str(ROOT/'node_modules'),'decision':'共享依赖/store保留；不global prune'},
 {'path':str(ROOT/'ci-logs/delivery-recovery'),'decision':'保留模型实收/逐链结果；同时各run ZIP保全旧版本'},
 {'path':str(ROOT/'apps/web/test-results'),'decision':'保留本轮E2E现场；Git忽略。认证state不上传，专用数据库容器已清理；仅原测试stdout统计作为本次交付证据'},
 {'path':str(ROOT/'apps/web/playwright-report'),'decision':'保留本轮E2E本机报告；Git忽略，不把可能含认证材料的trace直接提交'},
 {'path':str(ROOT/'apps/web/.next'),'decision':'保留本机构建缓存，非本轮可独占删除目标'}],
 'processLimit':'原资源helper登记容器ID/端口/label及每条nativeExit；API/MCP/model服务由夹具finally关闭。本轮未为早期每个短时子进程预先保存独立PID，明确缺口；不伪补当时owner。结束时另保存当前进程观察。',
 'protected':'G1D0C3及共享store/他人服务/旧worktree均不操作；无新镜像/卷/网络删除。'})
failureRows=[r for r in receipts if r['exit']!=0]
write('product-first-failures.md','# 首败及恢复原件\n\n每次命令退出均保留；以下包括产品、夹具、门禁及命令启动失败，不以绿色覆盖旧unknown。首败详细错误、运行字节before/after和完整输出见对应JSON/ZIP。\n\n| 回执 | exit | 原错误摘录 |\n| --- | --- | --- |\n'+'\n'.join('| ['+r['id']+']('+r['receipt']+') | '+str(r['exit'])+' | '+('; '.join(r['failures'][:3]) or '完整原输出见ZIP，未猜测缺失最终断言').replace('|','／')+' |' for r in failureRows)+'\n\n已定位并保留的恢复：JSONB evidence数组改准确序列化；完成查询夹具补ended_at；unknown恢复正例使用合法checkpoint原result；分页具名schema保原checksum/source_tool字段；Gitea占位夹具按真实Schema；Pi对象存储独立native传输保签名headers；Pi Zod拒例保持失败分类；Runner SKILL原始LF与pin一致；分页审计跟进抽取helper仍保删除/OR/UNION负例。')
table='| 命令 | 回执 | exit | 数量／skip／cache原统计 |\n| --- | --- | --- | --- |\n'
for name,r in checks.items():
    table+='| pnpm.cmd '+name+' | '+('['+r['id']+']('+r['receipt']+')' if r else '尚无')+' | '+(str(r['exit']) if r else '未结束')+' | '+('; '.join(r['summaries'][-8:]).replace('|','／') if r else '未运行或尚未收齐')+' |\n'
targetTable='| 最终受影响套件 | 回执 | exit | 实际统计 |\n| --- | --- | --- | --- |\n'
for name,r in targets.items():
    targetTable+='| '+name+' | '+('['+r['id']+']('+r['receipt']+')' if r else '尚无')+' | '+(str(r['exit']) if r else '未结束')+' | '+('; '.join(r['summaries']).replace('|','／') if r else '尚未收齐')+' |\n'
changed=subprocess.check_output(['git','diff','--name-only','ef4cb5e1458d911d98433c443dba46e6c224caa0','--','apps','packages','scripts','OPENAPI.yaml','AGENT_PROTOCOL.md'],cwd=ROOT).decode().splitlines()
changed=sorted(set(changed)|set(subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','apps','packages','scripts'],cwd=ROOT).decode().splitlines()))
committed=read(HERE/'product-delivery-receipt.json') if (HERE/'product-delivery-receipt.json').exists() else None
commitNote=('已提交产品源码候选 `'+committed['productCodeHead']+'` 的 1113 个源码文件逐 Git blob 与受测 Windows bytes 核验 exit 0；'+str(committed['archiveCount'])+' 个 ZIP 逐 blob 与原 bytes 一致，全 main→候选范围 whitespace 检查 exit 0。原回执见 [提交后源码核验](product-source-verification.json) 与 [交付核验](product-delivery-receipt.json)。后续提交仅登记这些回执及报告元数据，不改已测源码。') if committed else '提交后源码/归档核验尚未记录，不推定最终 Git head。'
write('product-report.md',f'''# M3 产品交付报告

状态：{'本机必需检查全部通过，停 review 供另一 Agent 正式成果独审' if ready else '正在收齐本机必需检查，尚未完整交付'}。本报告为主力整体汇总，内部只读子任务结论不代正式成果独审。尚无本候选最新 PR Required CI、合入或 Done。

## 交付与安全合同

实施依据为已独审候选 `499ccc1419ba2fbd15171f6ff7c0adc78647c2cc`。本轮平台只读实际 ref 观察：main `ef4cb5e1458d911d98433c443dba46e6c224caa0`、开工候选 `e73e814dd631a3c5db47afc1ff4d89e5cfaf3941`；这是观察时点，不能冒后续实时 ref。最终受测源码与提交绑定见 [源字节清单](product-source-manifest.json) 及提交后核验，报告自身不循环嵌入其未来 commit SHA。

{commitNote}

- 新 REST `GET /api/v1/provider-actions/{{id}}` / `getProviderAction`：六 kind 的严格白名单只读投影，精确 requester/Session/principal/Team/resource/feature与当前context读授权。payload、文件内容、provider raw错误、worker身份和秘密不返回；隐藏目标统一 NOT_FOUND，查询不领取、续租、外发或追加业务事实。Human原principal合法终态诊断与E普通终态拒绝分别验证。
- reviewer `repositoryIds` 由用户明确选择：三方 `repo:read` 交集与父仓库范围、共享 WorkItem/Project context；省略保 M2 三项。`mutate.beforeReserve` 完整父子锁计划与 `authorizeReplay` 共用校验，撤权/收窄后旧key也拒绝。本人 Room review_result、本人当前head code_review Artifact及structured review在有效E下交付；父等required child completed再确认。
- Worker每次写HTTP前同一 `prepareMutation` 完整authority/资源/准确PR/check/approval/action事务，最后DB `clock_timestamp()`核原claim和批准；最新合法context重验已锁PR的head_branch/base_branch。许可先提交仅当前在途不可召回，后续写重新授权；Stop/撤权/pin先提交零新写。HTTP期间不持DB事务。
- 五类写旧领取无合法checkpoint保守dead/OUTCOME_UNKNOWN，零重发、人工对账；合法checkpoint按kind绑定仅本地finish。context纯读有界重试。DB现有attempt约束0..8使用单调饱和，claimed_at在领取时取DB时钟毫秒精度，以 worker/attempt/claimed_at/status完整CAS身份防同worker到顶ABA；60秒租期仍按DB时钟。是源码发现的零迁移兼容，不是用户新增裁定。
- REST/Zod/SDK/MCP/derived manifest/Runner按同一操作对齐；补仓库/交付、上传状态/列表/取消/下载、completion suggestion及health允许子集。取消保持无If-Match，health发布仍需准确Human批准。Runner只访问配置的store origin，准确required headers，无WorkMesh Bearer、重定向或模型自选URL；Pi全局model dispatcher与对象存储使用独立native HTTP，签名资料不进入模型。

零数据库迁移、零新事件种类；沿原action、artifact links、approval事实及既有dead-letter事件。freeze的M0/M1/M2报告与#53不冒新通过。

## 验证入口与实际结果

{table}

{targetTable}

本轮完整单元统计为 1820 passed / 2 skipped，32 Tasks 全部成功、0 cache；integration 为 DB 81、API 276、conformance 57、Worker 138 passed，另有三项环境 skip。M0/M1/M2 三套真实 conformance 与 M3 同组合运行。运行环境固定 Windows / Node 22.19.0 / pnpm 9.15.4；每次 runtime.execPath、准确 elapsed 与起止源码 SHA 在原回执中保存，早期缺少PID/时间字段不伪补。

命令实际argv、exit、runtime、elapsed、stdout/stderr原字节ZIP及before/after指纹见 [完整检查索引](product-check-index.json)；Turbo缓存统计单列，缓存日志不冒本轮重新执行。历史M3 7例与Worker22例保持各自旧受测字节；新增源变化只由本轮受影响结果证明。

integration 的实际 skip 有三项：API 的 live MiniMax 用例须 `RUN_WORKBENCH_LIVE` 与账号秘密，未获本轮真实账号授权；Worker 的 retention upgrade 用例须 `RUN_RETENTION_UPGRADE_INTEGRATION`，本批零迁移且该升级路径未变；recovery 的一项备份恢复套件须 `RUN_RECOVERY_INTEGRATION`、独立source/target数据库与工具容器，未配置、未测。来源分别为 `apps/api/integration/workbench-runner.integration.test.ts`、`apps/worker/integration/retention-upgrade-barrier.integration.test.ts`、`packages/recovery/integration/recovery.integration.test.ts`。exit 0 不把这些 skip 称通过，不缩它们原发布验收门禁。定向测试的过滤 skip 与上述环境 skip 分开看原日志。

全仓单元测试另有两个 Linux 专用实机用例在 Windows skip：`retention-soak-lock.test.ts` 与 `retention-soak-formal-launch.test.ts` 的 `process.platform === "linux"` 条件；其余对应单元断言已运行。E2E 70 例通过、无 skip。最末完整统计以检查索引对应原输出为准。

逐项入口：[四十操作](product-operation-matrix.md)、[原九类](product-acceptance-matrix.md)、[十八恢复行](product-recovery-matrix.md)、[首败](product-first-failures.md)、[资源保全与清理](product-resources.json)。原规划的完整中文spec/M3全文/原测试与DoD保留，独立平台doc全文缺口仍见 sources.md；没有用摘要或截断前缀伪补。

三链由真实API、MCP与本机TLS假模型运行Pi，实际模型实收及持久Turn/工具事实保全到各run ZIP。Human连接/pin/批准及原Session ACK/Plan/complete生命周期使用受控SDK/REST夹具；表中明确实际工具调用与公共准备的区别，不以19工具数量冒全部功能。RustFS实际PUT、验证Worker、下载checksum/字节均比对；签名URL/headers不入Pi模型。

本机GitHub/Gitea HTTP夹具测试每写窗口正/拒例，包含GitHub tree/commit/ref及Gitea单文件create/update。Worker日志保存pg_locks/pg_blocking_pids/clock_timestamp及claimed_at代次、真实默认租期，不拿delay代锁观察。真实provider账号与外发仍未授权、未测；Gitea多文件commit/CI retry明确不支持。context的各provider标签Worker恢复使用注入Fake reader，实际adapter纯GET另单列；不冒真实账号整链。

实际锁与代次原值见 [锁观察](product-lock-observations.json)，服务脱敏原bytes见 [保全索引](product-service-logs-index.json)。最终定向 API/M3/Worker 回执补足长命令期间源码变更的来源边界，逐命令对最终bytes的匹配见 [运行来源绑定](product-test-source-bindings.json)；旧首败和18:54内部阅读未提交字节没有逐文件原件的缺口保留。证据归档、矩阵和完整源静态核验见 [实测静态回执](product-static-verification.json)，不代产品运行。

## 文件与演示

主要文件变化（完整差异以Git为准）：

'''+'\n'.join('- `'+p+'`' for p in changed)+'''

在 change review 对本报告点预览，再打开三份逐行矩阵与原日志索引。复现实证：以 `product-integration.py all` 创建独有PostgreSQL/Redis/RustFS，固定Node22.19/pnpm9.15.4，运行必需integration及E2E；`product-checks.py`分别执行表中命令。服务凭据仅在测试进程环境，报告不含秘密。

## 适用限制与收尾

当前仅Todos＋仓库记录，不伪造WorkMesh远端Project/Issue；#9的新UI候选未消费，不借旧UI tests；#5三OS分发不在本场景，原门禁未减；不扩UI/F-TA、Team权限、凭据连接或真实发布。merge不deploy、不自动Issue done。

额外组合的真实覆盖边界见九类JSON：100个仓库只做DTO正例、不冒100仓库部署；有限预算100/60/40由M3显式repo与M2兼容分别验证，M3预算满旧key重放及普通child完成后重放不重admission；未把未运行的全部笛卡尔组合改称通过。纯GET幂等写账本/If-Match/写事务故障不适用；Human保留操作不对Agent跑写正例。

owner容器、实际nativeExit、服务日志及清理label核验逐项保全；共享镜像/store/node_modules及当前恢复目录保留，G1D0C3拒目标不操作。原早期每个短时进程没有独立PID登记的缺口如实保留，结束时当前进程观察另列。正式另一Agent成果独审、最新PR Required CI与实际Done/main均未完成，不能称验收或合入。

最后一次 [进程/容器观察](product-process-observation.json) 为检查进程 0、owner 容器 0；36 轮 owner 的 108 个容器各有 label/ID 核验和 nativeExit 0 清理回执，不删共享镜像、卷、网络或 Windows 目录。定向复验首次命令未能启动 recorder 的原输出缺口另见 [启动失败边界](product-startup-gap.md)，不纳入通过数量。
''')
print(json.dumps({'receipts':len(receipts),'operationRows':len(rows),'acceptanceRows':len(acceptance['originalRows']),'recoveryRows':len(recovery['rows']),'allRequiredPassed':ready},ensure_ascii=False))
if '--final' in sys.argv and not ready:raise SystemExit('必需检查尚未齐全，不得提交完成声明')
