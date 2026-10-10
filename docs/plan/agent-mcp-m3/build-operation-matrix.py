"""从完整 OpenAPI 与受控决定生成 M3 操作矩阵；静态存在不作产品通过。"""
from pathlib import Path
import json, re, subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = 'ef4cb5e1458d911d98433c443dba46e6c224caa0'

def read(path):
    return subprocess.check_output(['git', 'show', MAIN + ':' + path], cwd=ROOT).decode('utf-8')

def write(name, value):
    content = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    (OUT / name).write_text(content, encoding='utf-8', newline='\n')

def main():
    api = json.loads((OUT / 'current-openapi-operations.json').read_text(encoding='utf-8'))
    sdk = read('packages/agent-sdk/src/index.ts')
    mcp = read('apps/mcp/src/index.ts')
    runner = read('apps/agent-runner/src/workmesh-tools.ts')
    # operationId, SDK方法, MCP工具, 能力, 资源/角色与领域前提
    primary = [
      ('listRepositories','listRepositories','list_repositories','repo:read','最新适用context；活跃仓库/connection；原签名分页，H-only查询过滤不移给E'),
      ('getRepositoryContext','getRepositoryContext','get_repository_context','repo:read','exact repositoryIds/context；完整guidance原件，非授权来源；E或C显式目标E'),
      ('requestProviderAction','requestProviderAction','create_repository_branch/create_repository_commit/open_pull_request','repo:read + kind-specific','E-only领域；branch/commit需repo:write_branch及write_branch context；openPR需repo:open_pr及open_pr context；base/path/branch/expectedHead准确；不把OpenAPI的human声明冒handler支持'),
      ('publishDeliveryArtifact','publishDeliveryArtifact','publish_delivery_artifact','artifact:write + 仓库时repo:read','本人E/provenance/workItem/Plan/currentHead；reviewer仅code_review，无repo写；H在现handler不支持'),
      ('requestArtifactUpload','requestArtifactUpload','request_artifact_upload','artifact:write + repo:read','E本人仓库证据；H沿Human附件合同；MIME/50MB/sha256/header签名；reviewer不因读权获得file审查授权'),
      ('getArtifactUploadStatus','getArtifactUploadStatus','get_artifact_upload_status','work:read','own-session E或原requester H；无storage_key/raw error；最终SELECT实时重验'),
      ('finalizeArtifactUpload','finalizeArtifactUpload','finalize_artifact_upload','artifact:write','own-session E／原requester H写资格；先expiry事实commit再稳定错误；同key重放'),
      ('cancelArtifactUpload','cancelArtifactUpload','cancel_artifact_upload','artifact:write','pending/uploaded可取消，canceled重放；Idempotency-Key，无If-Match；cleanup在commit后'),
      ('listWorkItemArtifacts','listWorkItemArtifacts','list_work_item_artifacts','work:read','exact WI；原数组保持；repo外链接取数前过滤，不可代正文已读'),
      ('downloadVerifiedArtifact','getArtifactDownload','download_verified_artifact','work:read','verified/own-session E；H当前Team；签名URL仅受控传输，reviewer不读父upload'),
      ('publishStructuredReview','publishStructuredReview','publish_structured_review','artifact:write + repo:read','review context/currentHead；本人code_review Artifact/provenance；actor独立于producer；file拒绝'),
      ('requestPullRequestMerge','requestMerge','merge_pull_request','repo:merge + repo:read','merge context；currentHead/all required checks/independent review/no blocking-high；Human精确hash批准；reviewer无资格'),
      ('retryPullRequestCheck','retryCiCheck','retry_ci_check','ci:run + repo:read','ci context；当前head failed/skipped准确checkRun；Human精确批准；requested不等于passed'),
      ('getProjectDelivery','getProjectDelivery','get_project_delivery','work:read + repo读取部分repo:read','当前exact Project/WI/repo；新增pullRequestId过滤，当前head阻断事实完整；默认envelope兼容'),
      ('createProjectUpdateDraft','draftProjectUpdate','draft_project_update','work:write','合法Project scope，Agent仅draft，evidence在scope；publish仍H-only'),
      ('suggestWorkItemCompletion','suggestCompletion','suggest_work_item_completion','work:write','E-only领域；exact WI/Project/PR及证据；只是建议，不自动done'),
      ('getProjectHealthHistory','getProjectHealthHistory','get_project_health_history','work:read','原Project绑定/分页/feature；不把Team scope当任意Project权限'),
      ('createProjectHealthUpdate','createProjectHealthUpdate','create_project_health_update','work:write','source=agent/exact Project/来源/If-Match；publish=true另需Human project.health.publish准确批准'),
      ('createReviewDelegation','createReviewDelegation','create_review_delegation','work:write + 显式三方repo:read','精确live父E/stable step/version/预算/限额/三方权限/共享context；repositoryIds省略保持M2'),
    ]
    retained = [('connectRepository','无Agent适配','Human连接'), ('pinRepositoryContext','无Agent适配','Human pin'),
      ('publishProjectUpdate','publish_project_update','Human发布'), ('decideCompletionSuggestion','decide_completion_suggestion','Human裁决')]
    dependencies = ['listArtifacts','publishArtifact','createChildAgentSession','listAgentSessionChildren',
      'postWorkRoomMessage','getAgentSession','getAgentSessionContext','getAgentPlan','publishAgentPlan',
      'acquireLease','renewLease','releaseLease','requestApproval','getApproval','completeAgentSession',
      'getAgentSessionExecutionResult']
    operations = []
    for operation, method, tool, caps, gate in primary:
        assert operation in api, operation
        data = api[operation]
        operations.append({'operationId': operation, 'family': 'M3产品增量', 'decision': 'typed适配及必要安全补齐',
          'currentRest': data, 'proposedRest': {'method': data['method'], 'path': data['path']},
          'proposed': {'sdk': method, 'mcp': tool.split('/'), 'runner': ['workmesh_' + t for t in tool.split('/')],
            'capabilities': caps, 'gate': gate, 'credentials': '直接E自身；C适配显式target E局部bridge；H仅按现领域允许的分支'},
          'currentPresence': {'sdkNamedMethod': bool(re.search(r'\b' + method + r'[<(]', sdk)),
            'mcpTools': {t: "registerTool('" + t + "'" in mcp for t in tool.split('/')},
            'runnerOperationString': operation in runner},
          'presenceLimitation': '仅源码存在性；角色、状态、feature、scope、批准、Lease和产品结果均另验',
          'tests': ['S1','S2','S3','S4','S5','S6','S7','S8','S9'], 'productStatus': '未运行'})
    operations.append({'operationId': 'getProviderAction', 'family': 'M3新增最小查询',
      'decision': '新增只读白名单投影，非已有endpoint', 'currentRest': None,
      'proposedRest': {'method':'GET','path':'/api/v1/provider-actions/{id}'},
      'proposed': {'sdk':'getProviderAction','mcp':['get_provider_action'],'runner':['workmesh_get_provider_action'],
        'capabilities':'work:read + repo:read','gate':'本人requester/精确E Session/current Team/resource/context/provider feature；H限定原requester/principal；六kind五status；未知只读对账',
        'credentials':'H或直接E；C显式target E局部bridge；无新增安装GET/terminal E例外'},
      'currentPresence': {'sdkNamedMethod':False,'mcpTools':{'get_provider_action':False},'runnerOperationString':False},
      'tests':['S1','S2','S3','S4','S5','S6','S7','S8','S9'],'productStatus':'未运行'})
    for operation, tool, gate in retained:
        operations.append({'operationId':operation,'family':'Human保留','decision':'不增加Agent权限/工具',
          'currentRest':api[operation],'proposedRest':{'method':api[operation]['method'],'path':api[operation]['path']},
          'proposed':{'sdk':'保持原消费者','mcp':[tool],'runner':[], 'gate':gate+'；隐藏发现，缓存调用结构化拒绝'},
          'tests':['S2','S3'],'productStatus':'未运行H回归'})
    for operation in dependencies:
        assert operation in api, operation
        operations.append({'operationId':operation,'family':'M1/M2现合同依赖','decision':'消费已落合同，不借其旧绿色',
          'currentRest':api[operation],'proposedRest':{'method':api[operation]['method'],'path':api[operation]['path']},
          'proposed':{'sdk':'沿现具名入口','mcp':[], 'runner':[], 'gate':'沿原profile/role/state/scope/approval/lease/revision/来源，不扩Human或terminal E；lifecycle逐步真实调用'},
          'tests':['S1','S2','S3','S4','S5','S6','S7','S8','S9'],'productStatus':'未运行M3组合'})
    assert len({x['operationId'] for x in operations}) == len(operations)
    write('operation-decisions.json', {'status':'Proposed；仅规划，未来产品未运行','sourceCommit':MAIN,
      'newEndpointCount':1,'operations':operations,
      'generationSource':'当前完整OpenAPI的现操作＋M3新增getProviderAction；M0/M1/M2原文件不改',
      'newTransferBoundary':'Pi有界inline UTF-8 bytes最大32768；原API/SDK/MCP允许MIME/50MB保持；无TA任意文件/URL访问',
      'notApplicable':{'readOnly':'GET无新幂等写/If-Match/command事务/job；不适用理由详acceptance-matrix',
        'trueExternal':'真实Git账号外发未授权，本轮未测；fake必须全链，不能豁免负例'}})
    lines = ['# M3 逐操作安全与消费者矩阵', '', '状态：Proposed；源码存在性不代表已运行或领域资格。每项的完整原REST输入/参数/响应和九类test ID见operation-decisions.json。', '',
      '| operationId／REST | 当前与计划入口 | 必需领域门禁／绑定 | 验证 |', '| --- | --- | --- | --- |']
    for item in operations:
        p=item['proposed']; r=item['proposedRest']
        lines.append('| '+item['operationId']+'<br>'+r['method']+' '+r['path']+' | '+item['family']+'<br>SDK: '+p['sdk']+'<br>MCP: '+', '.join(p['mcp'])+'<br>Runner: '+', '.join(p['runner'])+' | '+p['gate']+' | '+','.join(item['tests'])+'；'+item['productStatus']+' |')
    write('operation-matrix.md','\n'.join(lines)+'\n')
    text=(OUT/'frozen-m3.md').read_text(encoding='utf-8')
    rows=[line for line in text.splitlines() if line.startswith('| ') and not line.startswith(('| 验收类','| ---'))]
    assert len(rows)==9
    acceptance=[]
    reasons=['完整三客户端链和真实store；缺store显式unsupported', '准确身份/资源/三方scope，撤权负例不可免',
      '现状态/独立review双证据/unknown；不放宽Human', '下游写动作适用；GET无幂等写账本不适用',
      'head与revisioned写适用；GET/context POST/upload cancel无If-Match不适用',
      'intent/evidence/review/upload/approval state-event-outbox回滚适用；纯GET command回滚不适用，审计例外分列',
      '原job/webhook/checkpoint重放适用；GET无新job不适用', 'PG真实锁/租期/双worker与head竞争必须实证',
      '外发前授权提交/结果checkpoint先后、未知/Stop/M1专用确认必须实证']
    for i,(row,reason) in enumerate(zip(rows,reasons),1):
        parts=[p.strip() for p in row.split('|')[1:-1]]
        acceptance.append({'id':'S'+str(i),'originalRow':row,'category':parts[0], 'originalScenario':parts[1],
          'sourceCommit':'c768e1e3db297d8b91b53dd68b60e723a8a40e7d','sourcePath':'docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md',
          'applicability':reason,'concreteSteps':'verification.md S'+str(i),'testEntrypoints':[
            'apps/api/integration/stage3-delivery.integration.test.ts','apps/worker/integration/stage3-provider.integration.test.ts',
            'packages/conformance/src/delivery-recovery.conformance.test.ts（待创建）'],'status':'未运行'})
    write('acceptance-matrix.json',{'originalRows':acceptance,'originalDoD':next(l for l in text.splitlines() if l.startswith('**任务DoD**')),
      'originalFullScope':'frozen-m3.md','additionalUserDecision':'input/user-repository-scope-decision.md',
      'additionalReviewerTests':['三方逐一缺repo:read','省略原三项','1/100/空/重复/101仓库','WI/Project共享与父Session-only拒绝',
        '父context选不同/late收窄/撤权','same Actor不同Session自审拒绝','父100/普通child60/review40预算链',
        '本人Room+code_review+structured review+child完成后父确认']})
    # 符号索引定位精确源码，不把抽取的行当全文。
    wanted={'apps/api/src/delivery/routes.ts':['applicableAgentRepositoryContexts','assertAgentRepositoryWrite','prepareAgentPullRequestAccess','assertDeliveryTarget','requireProviderFeature','/api/v1/artifact-upload-intents/:id/cancel','/api/v1/projects/:id/delivery'],
      'apps/api/src/collaboration/routes.ts':['async function createReview','reviewCaps','provisionNewSessionDelivery'],
      'apps/api/src/agent/child-session-policy.ts':['admitChildSession'],
      'apps/api/src/operations/routes.ts':['project.health.publish','/api/v1/projects/:id/health'],
      'apps/api/src/authz/authorize.ts':['resolveTeam(','resourceInScope'],
      'apps/api/src/live-read-authorization.ts':['liveSessionReadPredicate','liveHumanTeamReadPredicate'],
      'apps/worker/src/provider-actions.ts':['claimAction','revalidateClaimedProvider','checkpointProviderResult','finishAction','clock_timestamp'],
      'apps/agent-runner/src/workmesh-tools.ts':['makeTool','operationKey','boundedResult'],
      'packages/git-provider/src/index.ts':['giteaCapabilityMatrix','UnsupportedProviderCapability'],
      'packages/artifact-storage/src/index.ts':['createUploadUrl','requiredHeaders'],
      'scripts/ci-policy.mjs':['validateMcpConformanceEntrypoints','Real conformance must be explicit']}
    manifest=json.loads((OUT/'source-manifest.json').read_text(encoding='utf-8'))
    index={e['path']:e for e in manifest['entries'] if e['commit']==MAIN}
    facts=[]
    for path,symbols in wanted.items():
        assert path in index,path
        content=read(path).splitlines()
        for symbol in symbols:
            numbers=[i+1 for i,line in enumerate(content) if symbol in line]
            facts.append({'path':path,'symbol':symbol,'lines':numbers,'found':bool(numbers),
              'blobId':index[path]['blobId'],'gitFingerprint':index[path]['git'],
              'limitation':'空lines表示未发现，不冒现有检查；完整文件在source ZIP'})
    write('source-map.json',facts)
    print(json.dumps({'operations':len(operations),'m3ProductEntries':len(primary)+1,'originalAcceptanceRows':len(acceptance),
      'sourceFacts':len(facts),'missingSymbols':[f['symbol'] for f in facts if not f['found']], 'exitCode':0},ensure_ascii=False))

if __name__=='__main__':
    main()
