"""从完整当前合同及生成发现规则生成可复核逐操作计划；不把注册计数冒运行结果。"""
from pathlib import Path
import json,re
import yaml

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
ops=json.loads((OUT/'current-openapi-operations.json').read_text(encoding='utf-8'))
discovery=json.loads((OUT/'current-discovery.json').read_text(encoding='utf-8'))
schema=yaml.safe_load((ROOT/'OPENAPI.yaml').read_text(encoding='utf-8'))
def resolve_parameter(value):
 while '$ref' in value:
  ref=value['$ref'];assert ref.startswith('#/'),ref
  value=schema
  for part in ref[2:].split('/'):value=value[part.replace('~1','/').replace('~0','~')]
 return value
groups={
 'bootstrap／身份':['getServerInfo','getAgentCapabilityManifest','createAgentConnection','redeemAgentConnection','getCurrentAgentConnectionIdentity','getAgentConnection','rotateAgentConnection','confirmAgentConnectionRotation','revokeAgentConnection','claimWorkItem','delegateAndStartAgentSession'],
 '核心规划／文档':['createProject','getProject','createWorkItem','getWorkItem','updateWorkItem','listWorkItems','listDocuments','createDocument','getDocument','updateDocument','listDocumentHistory','getDocumentRevision','diffDocumentRevisions','exportDocumentMarkdown'],
 '执行／Plan／结果':['getAgentSession','listAgentSessions','getAgentSessionContext','acknowledgeAgentSession','transitionAgentSessionState','heartbeatAgentSession','getAgentPlan','publishAgentPlan','listAgentPlanVersions','completeAgentSession','failAgentSession','getAgentSessionExecutionResult','signalAgentSession','retryAgentSession','acknowledgeAgentSessionStop','promptAgentSession'],
 'Room／Inbox／Handoff／父子':['getWorkRoom','getWorkRoomTimeline','postWorkRoomMessage','listInbox','getInboxItem','claimInboxItem','acknowledgeInboxItem','replyInboxItem','offerHandoff','inspectExactTargetHandoff','acceptHandoff','createChildAgentSession','listAgentSessionChildren','createReviewDelegation'],
 'Lease／批准／event':['listLeases','acquireLease','renewLease','releaseLease','forceReleaseLease','requestApproval','getApproval','decideApproval','listEvents','streamEvents'],
 'Git／证据':['createProviderConnection','connectRepository','listRepositories','getRepositoryContext','pinRepositoryContext','requestProviderAction','getProviderAction','publishDeliveryArtifact','publishStructuredReview','requestPullRequestMerge','retryPullRequestCheck','getProjectDelivery','publishArtifact','listArtifacts','requestArtifactUpload','getArtifactUploadStatus','finalizeArtifactUpload','cancelArtifactUpload','listWorkItemArtifacts','downloadVerifiedArtifact','createProjectUpdateDraft','publishProjectUpdate','suggestWorkItemCompletion','decideCompletionSuggestion'],
 'Pi／Turn／Attempt':['createWorkbenchLlmConnection','upsertWorkbenchLlmModel','createWorkbenchConversation','queueWorkbenchTurn','listWorkbenchRunnerAssignments','listAgentWorkbenchTurns','claimWorkbenchTurn','getWorkbenchAttemptCredential','startWorkbenchAttempt','getWorkbenchAttemptStatus','settleWorkbenchAttempt','listWorkbenchMessages','listWorkbenchTurns','stopWorkbenchTurn']}
missing=[op for group in groups.values() for op in group if op not in ops]
if missing: raise ValueError('所选操作不存在于当前OpenAPI：'+','.join(missing))
groups['执行／Plan／结果'].extend(['listAgentActivities','appendAgentActivity'])
groups['Lease／批准／event'].extend(['listRecoveryItems','getRecoveryItem'])
runner=(ROOT/'apps/agent-runner/src/workmesh-tools.ts').read_text(encoding='utf-8')
runner_map={}
for name,op in re.findall(r"(?:add|exactRead)\(\s*'([^']+)'\s*,\s*'([^']+)'",runner):
 runner_map.setdefault(op,[]).append(name)
rules={}
for rule in discovery['rules']:rules.setdefault(rule['operationId'],[]).append(rule)
rows=[]; index=[]
header=['# 当前逐操作验证矩阵','','本矩阵由完整当前 OpenAPI 和实际生成发现规则提取。静态提取不代表领域授权审计或运行成功；280 操作全集在 current-openapi-operations.json，选定链及准备操作如下。','','每行的完整输入／响应 schema、query／path／If-Match 参数与精确身份谓词，分别保存在 current-openapi-operations.json 和 current-discovery.json；以 operationId 作稳定引用。所有行新组合状态为未运行。Runner 的静态字面量工具匹配只作定位，动态登记／内部控制入口单列，不以未匹配推断不存在。能力列是各身份变体的并集定位索引，不表示同一调用必须全部具备；每个变体按原规则与领域谓词逐项判定。If-Match 列解析本地引用及路径公共参数，正文 revision 另按 DTO。','','| 链段／operationId | REST／feature／actor | MCP绑定／身份 | 能力／SDK／Runner | 幂等／revision与具体验证 |','| --- | --- | --- | --- | --- |']
for group,selected in groups.items():
 for op in selected:
  operation=ops[op]; binds=[b for b in discovery['bindings'] if op in b['operationIds']]
  caps=sorted({cap for rule in rules.get(op,[]) for cap in rule.get('capabilities',[])})
  identities=sorted({','.join(v['credentialMode'])+('/target:'+str(v.get('targetParameter')) if v.get('targetParameter') else '')+('/bridge' if v.get('installationBridgeRequired') else '') for b in binds for v in b.get('identityVariants',[])})
  transport='; '.join(b['bindingId'] for b in binds) or '无MCP绑定；Human／Runner内部REST准备'
  names=runner_map.get(op,[])
  if group=='Pi／Turn／Attempt': run='Runner内部控制REST，模型不直接持service/fence'
  elif names: run=', '.join(names)
  else: run='动态登记／SDK内部；见consumer-matrix与原源码，不冒静态未匹配为缺失'
  params=[resolve_parameter(p) for p in schema['paths'][operation['path']].get('parameters',[])+operation.get('parameters',[])]
  revision=any(p.get('name','').lower()=='if-match' for p in params)
  mutation=operation['method'] not in ('GET','HEAD')
  test={'bootstrap／身份':'N1–N2/F2/F3/F8','核心规划／文档':'N1/N3/F4/F5/F6','执行／Plan／结果':'N2/N6/N7/F2–F9','Room／Inbox／Handoff／父子':'N3–N5/G3–G4/F2/F4/F6–F9','Lease／批准／event':'N4–N5/G1/G5/F2/F4/F7–F9','Git／证据':'G1–G7/F2–F9','Pi／Turn／Attempt':'N5–N7/F2/F4/F6/F8/F9'}[group]
  if op in ('requestArtifactUpload','downloadVerifiedArtifact'):test+='；O raw签名传输不入模型，仅P受控与R私有对照'
  if op=='getAgentSessionExecutionResult':test+='；原installation来源，terminal E拒绝'
  if op=='createReviewDelegation':test+='；repoIds显式三方交集、省略兼容、重放重验'
  if op=='getProviderAction':test+='；原准确E/H；unknown零重发'
  row=f"| {group}<br>`{op}` | `{operation['method']} {operation['path']}`<br>{operation.get('feature') or 'none'}<br>{','.join(operation['actorKinds']) or 'public/service'} | {transport}<br>{'; '.join(identities) or '按现行REST身份'} | {', '.join(caps) or '按角色/资源，无额外cap'}<br>SDK: `packages/agent-sdk/src/index.ts`<br>{run} | {'key按原操作' if mutation else '只读业务零写'}；{'If-Match' if revision else '无直接If-Match，按完整DTO/源码复核'}<br>{test} |"
  rows.append(row);index.append({'group':group,'operationId':op,'method':operation['method'],'path':operation['path'],'feature':operation.get('feature'),'bindingIds':[b['bindingId'] for b in binds],'identityVariants':[v for b in binds for v in b.get('identityVariants',[])],'capabilities':caps,'runnerLiteralMatches':names,'revisionHeaderInOperation':revision,'testCases':test,'status':'未运行'})
(OUT/'operation-matrix.md').write_text('\n'.join(header+rows)+'\n',encoding='utf-8',newline='\n')
(OUT/'operation-selection.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'selectedOperations':len(index),'uniqueOperations':len({x['operationId'] for x in index}),'allStatusUnrun':True}))
