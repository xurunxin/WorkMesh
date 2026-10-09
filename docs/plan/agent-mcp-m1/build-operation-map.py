"""静态生成M1操作对照；读取已归档全文，不执行任何产品handler。"""
import json
import re
import zipfile
from pathlib import Path
import yaml

OUT = Path(__file__).resolve().parent
manifest = json.loads((OUT/'source-manifest.json').read_text(encoding='utf-8'))
MAIN = manifest['main']
with zipfile.ZipFile(OUT/'source-snapshot.zip') as z:
    def source(path):
        return z.read(f'{MAIN}/{path}').decode('utf-8')
    api = yaml.safe_load(source('OPENAPI.yaml'))
    baseline = json.loads(source('docs/plan/agent-mcp-m0/operation-decisions.json'))
    files = {x['path']: source(x['path']) for x in manifest['entries']
             if x['head'] == MAIN and x['path'].endswith(('.ts','.py','.mjs','.yml'))}
blobs = {x['path']: x for x in manifest['entries'] if x['head']==MAIN}
def anchor(path, text):
    lines = files[path].splitlines()
    matches = [i+1 for i,v in enumerate(lines) if text in v]
    assert matches, (path,text)
    return dict(path=path, line=matches[0], anchor=text, head=MAIN, gitBlobOid=blobs[path]['gitBlobOid'])
def resolve(value):
    if isinstance(value,dict):
        if '$ref' in value:
            node=api
            for part in value['$ref'][2:].split('/'):node=node[part]
            return dict(sourceRef=value['$ref'], definition=resolve(node))
        return {k:resolve(v) for k,v in value.items()}
    if isinstance(value,list):return [resolve(v) for v in value]
    return value

# operationId, SDK, MCP, Runner, domain/read-helper, 准确范围及特有判定
specs = [
('listAgentSessions','listSessions','list_agent_sessions','workmesh_list_sessions','agent/routes.ts','app.get("/api/v1/agent-sessions",','仅自身Session；过滤teamId/workItemId/agentId/principalHumanActorId/state不能扩大集合'),
('getAgentSession','getSession','get_agent_session','workmesh_get_session','agent/routes.ts','app.get("/api/v1/agent-sessions/:id",','exact id=当前E；Human Team读取；C目标必须独立E bridge'),
('getAgentSessionContext','getSessionContext','get_session_context','workmesh_get_session_context','agent/routes.ts','app.get("/api/v1/agent-sessions/:id/context",','准确固定snapshot与guidance/document pins；不是context历史CRUD'),
('getAgentPlan','getPlan','get_session_plan','workmesh_get_session_plan','agent/routes.ts','app.get("/api/v1/agent-sessions/:id/plan",','current plan可能null；原raw steps不冒context结构'),
('listAgentPlanVersions','listPlanVersions','list_session_plan_versions','workmesh_list_plan_versions','agent/routes.ts','app.get("/api/v1/agent-sessions/:id/plans",','Plan摘要分页按revision/id；不新增历史版本详情路径'),
('listApprovals','listApprovals','list_approvals','workmesh_list_approvals','agent/routes.ts','app.get("/api/v1/approvals",','sessionId/status+cursor；Agent只看自身；Human viewer_actionability保留'),
('getApproval','getApproval','get_approval','workmesh_get_approval','agent/routes.ts','app.get("/api/v1/approvals/:id",','approval.session_id=准确E；C bridge另需明确sessionId'),
('listLeases','listLeases','list_leases','workmesh_list_leases','collaboration/routes.ts',"app.get('/api/v1/leases',",'sessionId/resourceId+cursor；只本人；version与revision别名都保留，无getLease路由'),
('heartbeatLease','heartbeatLease','heartbeat_lease','workmesh_heartbeat_lease','collaboration/routes.ts',"if (action === 'heartbeat')",'exact lease.session_id；status=active；原heartbeat窗口，无If-Match，不新增Activity'),
('renewLease','renewLease','renew_lease','workmesh_renew_lease','collaboration/routes.ts',"if(action==='renew')",'exact holder；status=active且expires_at>now；Lease If-Match；ttlSeconds 10..3600'),
('releaseLease','releaseLease','release_lease','workmesh_release_lease','collaboration/routes.ts',"const status=action==='force-release'",'exact holder；status=active；Lease If-Match；Stop后普通release拒，服务器Stop已释放'),
('listRecoveryItems','listRecoveryItems','list_recovery_items','workmesh_list_recovery_items','recovery/routes.ts',"app.get('/api/v1/recovery-items',",'既有lifecycle/condition/severity/projectId/workItemId/sessionId/cursor；liveSessionReadPredicate'),
('getRecoveryItem','getRecoveryItem','get_recovery_item','workmesh_get_recovery_item','recovery/routes.ts',"app.get('/api/v1/recovery-items/:id',",'复合不透明id不是UUID；missing与unauthorized一致NOT_FOUND，C准确E桥'),
('acknowledgeAgentSession','acknowledge','ack_agent_session','受控生命周期','agent/commands.ts','export async function acknowledge(','queued/stale新ACK；acknowledged仅原key/body回执，不先普通manifest'),
('transitionAgentSessionState','transitionState','transition_agent_session_state','workmesh_transition_state','agent/commands.ts','export async function transitionState(','原状态图与Session If-Match；Runner不提供Human pause/resume/stop/retry'),
('heartbeatAgentSession','heartbeat','heartbeat','受控生命周期','agent/commands.ts','export async function heartbeat(','所有状态仅诊断；准确live授权；K1/K2/K1不回退，不恢复执行'),
('publishAgentPlan','publishPlan','publish_plan','workmesh_publish_plan','agent/commands.ts','export async function publishPlan(','reviewer拒；awaiting_approval需要原approvalId/hash；stable steps；Session revision；零前置Activity'),
('requestApproval','requestApproval','request_approval','workmesh_request_approval','agent/commands.ts','export async function requestApproval(','准确自身work_item Session与canonical sanitized hash；Human/既有自主策略决定，不给Agent自批'),
('consumeApproval','consumeApproval','consume_approval','workmesh_consume_approval','agent/commands.ts','export async function consumeApproval(','准确session/approved/hash/expiry/未consumed；Approval If-Match；不等于decide权限'),
('acquireLease','acquireLease','acquire_lease','workmesh_acquire_lease','collaboration/routes.ts','async function acquireLease(','work_item/plan_step exact resource；独占冲突详情；TTL；Lease不授予权限'),
('completeAgentSession','complete','complete_session','workmesh_complete_session→受控settle','agent/commands.ts','export async function finishSessionInTransaction(','当前state可completed；证据/no-artifact；required child门禁保持；reviewer还需artifact:write、本人Room review_result与code_review'),
('failAgentSession','fail','fail_session','受控已有失败settle；不新增模型terminal写','agent/commands.ts','export async function finishSession(','同领域fail状态图/evidence/code；停止后不能普通fail；保原失败处理'),
('acknowledgeAgentSessionStop','stopAcknowledgement','stop_ack','受控finally；不交模型','agent/commands.ts','export async function stopAck(','仅stopping+exact原E+Session If-Match+live grant；不走makeTool/refresh；唯一cleanup事实'),
('publishArtifact','publishArtifact','publish_artifact','workmesh_publish_artifact','agent/commands.ts','export async function publishArtifact(','原artifact:write与exact session/work_item，reviewer仅code_review；不新增上传/外发范围'),
('signalAgentSession','Human原REST；不新增SDK','不增加Agent控制tool','不提供','agent/commands.ts','export async function signal(','Human-only stop/pause/resume；原信号/Stop Lease释放/审计不变'),
('retryAgentSession','retrySession','不增加Agent控制tool','不提供','agent/commands.ts','export async function retrySession(','Human原重试新Session，不复活终态；不是M1普通E工具'),
('decideApproval','Human原消费者','不提供','不提供','agent/commands.ts','export async function decideApproval(','Human决定原quorum/revision/hash与scope；不能自批'),
('forceReleaseLease','mutateLease原Human分支','不提供','不提供','collaboration/routes.ts',"if(action==='force-release')",'Human-only +审批/原因/If-Match；不增Agent force-release'),
('exchangeAgentSessionToken','exchangeClaimedSessionToken','adapter内部','受控附件','agent/commands.ts','export async function exchangeAgentToken(','既有install/session/nonce绑定；本批不增加Token签发途径'),
('refreshAgentSessionToken','原受控refresh','adapter内部','RunnerApi.#refresh未停时','agent/commands.ts','export async function refreshAgentToken(','Stop/terminal原拒绝；不作为401/403恢复；只读确认绝不调用'),
('claimWorkItem','claimWorkItem','claim_work_item','不交E模型','agent/commands.ts','export async function claimWorkItem(','原C接单前置，typed/身份产品M0已落；本批conformance消费queued链，不新增接单权限'),
('delegateAndStartAgentSession','delegateAndStart','delegate_work_item','不交E模型','agent/commands.ts','export async function delegateAndStartAgentSession(','原H/C委派及目标资格；非E Team管理'),
('settleWorkbenchAttempt','RunnerApi.request','adapter内部','executeTurn','workbench-runner.ts',"const body = workbenchRunnerSettleInputSchema.parse",'exact Session/attempt/fence/Runner service；保ADR0068外层回执重放，不泛化到complete/stopAck'),
]
base_by_id = {x['operationId']:x for x in baseline['operations']}
operations = []
index = ['# M1逐操作映射与准确源码入口','',
         '当前REST来自source-snapshot.zip内准确main的完整OPENAPI；原M0记录作为历史输入分列。新增名称是Proposed，工具数量不计验收率。每项参数/返回$ref全文、currentPolicy、历史谓词和main锚点详见 [结构化映射](operation-decisions.json)。','',
         '普通E读取/写入要求active集合 acknowledged/planning/executing/awaiting_input/awaiting_approval/blocked；ACK、诊断heartbeat、stopAck和settle按各自专用例外。所有列表保cursor/limit与当前服务端过滤；角色无额外限制不代表所有目标允许。C目标执行用独立E身份，不以C qualification代E。','',
         '| operationId / REST | SDK → MCP → Runner | 准确领域规则 / source |','| --- | --- | --- |']
for oid,sdk,mcp,runner,path,mark,rule in specs:
    path='apps/api/src/'+path
    old=base_by_id[oid]
    hits=[(p,m,n) for p,ps in api['paths'].items() for m,n in ps.items() if isinstance(n,dict) and n.get('operationId')==oid]
    assert len(hits)==1,oid
    p,m,n=hits[0]
    a=anchor(path,mark)
    tests=['M1-'+oid+'-ALLOW','M1-'+oid+'-DENY']
    read=m=='get'
    app=dict(normal='适用：准确身份与对象正对照',authority='适用：逐live门禁及错Session/scope拒绝',
             state='适用：普通状态与专用例外分列',idempotency='读无写幂等义务；重复查询零事实' if read else '同key/body只一原事实；异体冲突；terminal确认按安全合同',
             revision='GET无If-Match；读取当前/原revision分列' if read else '依原policy逐资源版本；无If-Match操作记不适用',
             transaction='无新command回滚；零写与独立拒绝审计' if read else '原command失败state/event/outbox回滚；诊断heartbeat投影另列',
             replay='无新job；查询重连零事实' if read else '既有outbox/job重放与原操作key；不新增job',
             concurrency='分页/查询与撤权同次snapshot' if read else '资源竞争/Stop/撤权按提交次序',
             restart='持久事实/cursor恢复；不复活终态执行')
    o=dict(operationId=oid,rest=dict(method=m.upper(),path=p),status='已有REST；M1适配/回归提案，未产品运行',
           currentContract=resolve({k:n[k] for k in ['parameters','requestBody','responses','security'] if k in n}),
           historicalM0=old,proposed=dict(sdk=sdk,mcp=mcp,runner=runner,domainRules=rule,
           parameters='原currentContract全部参数+compatibility.md准确身份选择；cursor/limit保留',
           output='原字段/schema/null保留；typed响应解析；Lease version/revision两字段',
           mode='只读查询read-only/read-write；写仅read-write；Human/adapter内部不广告模型写',
           feature=old['currentPolicy']['feature']),mainEvidence=[a,
           anchor('apps/api/src/authz/authorize.ts','export function sessionActiveForOperation'),
           anchor('apps/api/src/agent/guard.ts','export function assertAgentWrite')],
           acceptance=dict(testIds=tests,positive='准确身份及对象满足本条domainRules，返回原事实',
                           negative='错误身份/状态/scope或特有门禁拒绝；保具体错误与无副作用',status='未运行'),
           nineClassApplicability=app)
    q=old['qualifications']
    o['proposed']['authorization']=dict(credentialModes=q['credentialModes'],roles=q['delegationRoles']['allowed'],
          routeStates=q['states']['route'],capabilitiesAll=q['capabilitiesAll'],scope=rule,
          sessionIdentity='直接E自身；C仅自身或准确局部目标E；H沿原membership；内部/保留动作见domainRules',
          revision=old['currentPolicy']['revision'],idempotency=old['currentPolicy']['idempotency'])
    o['acceptance']['testFiles']=['packages/conformance/src/execution-recovery.conformance.test.ts',
          'apps/api/integration/stage1.integration.test.ts' if 'agent/' in path else
          'apps/api/integration/stage2-collaboration.integration.test.ts' if 'collaboration/' in path else
          'apps/api/integration/workbench-runner.integration.test.ts' if 'workbench' in path else
          'packages/conformance/src/execution-recovery.conformance.test.ts']
    o['acceptance']['gateCases']=[dict(id=f'M1-{oid}-GATE-{i+1}',fact=p['fact'],when=p.get('when'),
          allow=p['allowed'],denyReason=p['reason'],assertion='按本条实际选择的凭据/variant构造逐门禁正对照和拒绝；不以无权限空集代通过')
          for i,p in enumerate(q['predicates'])]
    # 当前adapter源码重新定位，不把历史M0行号冒作新main事实。
    o['currentAdapterEvidence']=[]
    for fp,needle in [('packages/agent-sdk/src/index.ts',sdk+'('),('apps/mcp/src/index.ts',"registerTool('"+mcp+"'"),
                      ('apps/mcp/src/discovery.ts',"registerTool('"+mcp+"'"),('apps/agent-runner/src/workmesh-tools.ts',runner.split('→')[0])]:
        if needle in files[fp]:o['currentAdapterEvidence'].append(anchor(fp,needle))
    operations.append(o)
    index.append(f'| `{oid}` {m.upper()} `{p}` | `{sdk}` → `{mcp}` → {runner} | {rule}；`{path}:{a["line"]}` |')
new=dict(operationId='getAgentSessionExecutionResult',rest=dict(method='GET',path='/api/v1/agent-sessions/{id}/execution-result'),
         status='拟新增REST/DTO/policy；主线不存在',currentContract=None,
         proposed=dict(sdk='getSessionExecutionResult',mcp='get_session_execution_result',runner='受控finally确认；不交模型凭据',
                       authentication='human_or_installation_target',feature=dict(key=None,tier='stable'),
                       contract='security-contract.md',scope='准确liveprincipal/Connection或原install/Teamgrant/目标delegation（Connection另核coordinator delegation）/Session/action/key/原actor回执',
                       role='无伪C/E或Human；合法Human保持旧读取'),
         mainEvidence=[anchor('apps/api/src/agent-connections.ts','export async function resolveCoordinationIdentity'),
                       anchor('apps/api/src/agent/commands.ts','export async function agentMutate'),
                       anchor('apps/api/src/server.ts','function commandContext')],
         acceptance=dict(testIds=['M1-CONFIRM-ALLOW','M1-CONFIRM-DENY','M1-CONFIRM-ZERO'],status='未运行'),
         nineClassApplicability=operations[0]['nineClassApplicability'])
operations.append(new)
index += ['| `getAgentSessionExecutionResult` GET `/api/v1/agent-sessions/{id}/execution-result`（新增提案） | `getSessionExecutionResult` → `get_session_execution_result` → 受控finally | [准确输入/DTO/live归属/零写合同](security-contract.md)，普通E拒绝；Proposed |','',
          '## 共同live门禁与逐操作反例','',
          '所有普通Agent操作逐次重验credential、definition/actor、Team grant、Delegation和能力交集；读取final live predicate与对象session FK，写命令under-lock exact authority。具体九类用例ID/测试文件/DoD见 [验证](verification.md)，不能用通用pending代审计完成。M0历史源码和本批main证据分列，不认为继承的旧test状态代表本批通过。','',
          '新增适配和Human保留见 [兼容](compatibility.md)，Stop特殊时序见 [生命周期](lifecycle.md)。']
(OUT/'operation-index.md').write_text('\n'.join(index)+'\n',encoding='utf-8',newline='\n')
(OUT/'operation-decisions.json').write_text(json.dumps(dict(main=MAIN,status='Proposed；静态映射，不是产品验收',operations=operations),ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(dict(existingOperations=len(specs),newOperations=1),ensure_ascii=False))
