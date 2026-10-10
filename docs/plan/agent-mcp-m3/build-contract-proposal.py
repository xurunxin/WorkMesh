"""生成独立规划合同；只写M3目录，不替换产品OpenAPI/DTO。"""
from pathlib import Path
import json
import yaml

OUT=Path(__file__).resolve().parent

def s(**kw):return {'type':'string',**kw}
def obj(fields):return {'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}
def nullable(value):return {'anyOf':[value,{'type':'null'}]}
uuid=s(format='uuid')
sha=s(minLength=1,maxLength=200)
short=s(minLength=1,maxLength=500)
date=s(format='date-time')
codes=['PROVIDER_ACTION_FAILED','PROVIDER_ACTION_AUTHORITY_REVOKED','PROVIDER_HEAD_SHA_MISMATCH',
       'MERGE_APPROVAL_MISMATCH','MERGE_APPROVAL_EXPIRED','MERGE_CHECKS_BLOCKED','PROVIDER_CAPABILITY_UNSUPPORTED',
       'PROVIDER_ACTION_CLAIM_LOST','PROVIDER_ACTION_OUTCOME_UNKNOWN','RESULT_UNAVAILABLE']
common={'id':uuid,'provider':s(enum=['fake','github','gitea']), 'connectionId':uuid,'repositoryId':uuid,
 'requesterActorId':uuid,'sessionId':nullable(uuid),'workItemId':nullable(uuid),'projectId':nullable(uuid),
 'planStepId':nullable(uuid),'expectedHeadSha':nullable(sha),'approvalId':nullable(uuid),
 'status':s(enum=['pending','claimed','completed','failed','dead']),
 'effect':s(enum=['committed','checkpointed','unknown']),
 'artifactIds':{'type':'array','maxItems':100,'uniqueItems':True,'items':uuid},
 'createdAt':date,'updatedAt':date,'completedAt':nullable(date),'error':nullable(obj({'code':s(enum=codes)})),
 'recovery':obj({'kind':s(enum=['none','poll_same_action','human_reconcile']), 'scheduled':{'type':'boolean'},'nextQueryAt':nullable(date)})}
variants={
 'create_branch':({'branchName':short,'baseSha':sha},{'branchName':short,'headSha':sha}),
 'create_commit':({'branchName':short,'expectedHeadSha':sha},{'providerCommitId':sha,'sha':sha,'branchName':short}),
 'open_pull_request':({'baseBranch':short,'headBranch':short},{'providerPullRequestId':short,'number':{'type':'integer','minimum':1},'projectionId':nullable(uuid),'baseSha':sha,'headSha':sha,'state':s(enum=['open','closed','merged'])}),
 'merge_pull_request':({'providerPullRequestId':short,'headSha':sha,'method':s(enum=['merge','squash','rebase'])},{'merged':{'const':True},'mergeSha':sha}),
 'retry_ci_check':({'providerPullRequestId':short,'headSha':sha,'checkRunId':short},{'requested':{'const':True},'checkRunId':short}),
 'resolve_repository_context':({'resourceKind':s(enum=['project','work_item','session']),'resourceId':uuid},{'contextId':uuid})}
members=[obj({**common,'kind':{'const':kind},'target':obj(target),'result':nullable(obj(result))}) for kind,(target,result) in variants.items()]
ids={'type':'array','minItems':1,'maxItems':100,'uniqueItems':True,'items':uuid}
shape={'oneOf':members, 'x-invariants':['committed=>status=completed,result!=null','checkpointed=>status!=completed,result!=null',
  'unknown=>result=null','non-context=>sessionId/workItemId!=null','committed openPR=>projectionId!=null',
  'none=>scheduled=false,nextQueryAt=null','poll_same_action=>nextQueryAt!=null',
  'human_reconcile=>scheduled=false,nextQueryAt=null',
  'PROVIDER_ACTION_OUTCOME_UNKNOWN=>dead,unknown,result=null,human_reconcile,scheduled=false,nextQueryAt=null']}
(OUT/'dto-shapes.json').write_text(json.dumps({'response':shape,'repositoryIds':ids},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
proposal={'paths':{'/api/v1/provider-actions/{id}':{'get':{
 'operationId':'getProviderAction','x-workmesh-policy-id':'route.getProviderAction',
 'x-workmesh-actor-kinds':['human','agent'],'x-workmesh-feature-key':'none','x-workmesh-feature-tier':'stable',
 'security':[{'SessionCookie':[]},{'AgentSessionToken':[]}],
 'parameters':[{'name':'id','in':'path','required':True,'schema':uuid}],
 'description':'Proposed：严格空query；准确原requester/principal/Session/资源只读确认。ordinary terminal E拒绝。Gitea仍按WORKMESH_BETA_GITEA动态门禁。',
 'responses':{'200':{'description':'白名单原action投影；GET不刷新Token、不写业务事实','headers':{'Cache-Control':{'schema':{'type':'string','const':'no-store'}}},
  'content':{'application/json':{'schema':{'$ref':'#/components/schemas/ProviderActionProjection'}}}},
  '401':{'description':'凭据无效'},'403':{'description':'有效身份的状态/能力/部署门禁拒绝；不泄漏隐藏target'},'404':{'description':'目标不存在或不可见'}}}},
 '/api/v1/projects/{id}/delivery':{'get':{'operationId':'getProjectDelivery','x-additive-parameters':[{'name':'pullRequestId','in':'query','schema':uuid}],
  'description':'默认旧envelope保留；新增参数精确当前head，scope取数前过滤、完整阻断事实。'}}},
 'components':{'schemas':{'ProviderActionProjection':shape,'ExplicitReviewRepositoryIds':ids,
  'ReviewDelegationInputPatch':{'type':'object','properties':{'repositoryIds':{'$ref':'#/components/schemas/ExplicitReviewRepositoryIds'}},
    'description':'仅对现ReviewDelegationInput增量；repositoryIds非required，省略保持M2。原budget/ttl/default/strip行为不改。'}}}}
(OUT/'openapi-proposal.yaml').write_text(yaml.safe_dump(proposal,allow_unicode=True,sort_keys=False),encoding='utf-8',newline='\n')
def z(schema):
 if 'const' in schema:return 'z.literal('+json.dumps(schema['const'])+')'
 if 'anyOf' in schema:return z(schema['anyOf'][0])+'.nullable()'
 kind=schema['type']
 if kind=='string':
  value='z.enum('+json.dumps(schema['enum'])+')' if 'enum' in schema else 'z.string()'
  if schema.get('format')=='uuid':value+='.uuid()'
  if schema.get('format')=='date-time':value+='.datetime({ offset: true })'
  if 'minLength' in schema:value+='.min('+str(schema['minLength'])+')'
  if 'maxLength' in schema:value+='.max('+str(schema['maxLength'])+')'
  return value
 if kind=='boolean':return 'z.boolean()'
 if kind=='integer':return 'z.number().int().min('+str(schema['minimum'])+')'
 if kind=='array':
  value='z.array('+z(schema['items'])+')'
  if 'minItems' in schema:value+='.min('+str(schema['minItems'])+')'
  if 'maxItems' in schema:value+='.max('+str(schema['maxItems'])+')'
  if schema.get('uniqueItems'):value+='.refine(ids => new Set(ids).size === ids.length, "Duplicate ID")'
  return value
 if kind=='object':return 'z.object({\n'+''.join('  '+json.dumps(k)+': '+z(v)+',\n' for k,v in schema['properties'].items())+'}).strict()'
 raise ValueError(schema)
text='// Proposed：规划DTO，尚未产品实施。\nimport { z } from "zod"\n\n'
text+='export const providerActionQueryProposalSchema = z.object({}).strict()\n'
text+='export const reviewRepositoryIdsProposalSchema = '+z(ids)+'\n'
text+='export const providerActionProjectionProposalSchema = z.discriminatedUnion("kind", [\n'+',\n'.join(z(m) for m in members)+'\n]).superRefine((value, ctx) => {\n'
text+='''  const reject = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
  if (value.effect === "unknown" && value.result !== null) reject("Unknown result must be null")
  if (value.effect !== "unknown" && value.result === null) reject("Confirmed result is required")
  if (value.effect === "committed" && value.status !== "completed") reject("Local completion is required")
  if (value.effect === "checkpointed" && value.status === "completed") reject("Checkpoint is not local completion")
  if (value.kind !== "resolve_repository_context" && (!value.sessionId || !value.workItemId)) reject("Exact E binding is required")
  if (value.kind === "open_pull_request" && value.effect === "committed" && !value.result?.projectionId) reject("Exact local PR reference is required")
  if (value.recovery.kind === "none" && (value.recovery.scheduled || value.recovery.nextQueryAt)) reject("No scheduled recovery")
  if (value.recovery.kind === "poll_same_action" && !value.recovery.nextQueryAt) reject("Next query boundary is required")
  if (value.recovery.kind === "human_reconcile" && (value.recovery.scheduled || value.recovery.nextQueryAt)) reject("Human reconciliation is read only")
  if (value.error?.code === "PROVIDER_ACTION_OUTCOME_UNKNOWN" && (value.status !== "dead" || value.effect !== "unknown" || value.result !== null || value.recovery.kind !== "human_reconcile" || value.recovery.scheduled || value.recovery.nextQueryAt)) reject("Unproven recovery must stop sending")
})
export type ProviderActionProjectionProposal = z.infer<typeof providerActionProjectionProposalSchema>
// 产品阶段扩展现reviewDelegationInputSchema；不新增普通child仓库权限，也不改其余旧字段/default。
export const reviewDelegationRepositoryPatchProposalSchema = z.object({ repositoryIds: reviewRepositoryIdsProposalSchema.optional() })
'''
(OUT/'dto-proposal.ts').write_text(text,encoding='utf-8',newline='\n')
policy={'status':'Proposed；当前无endpoint/新授权','newOperation':{'operationId':'getProviderAction','method':'GET','path':'/api/v1/provider-actions/{id}',
 'authentication':'human_or_agent_session','actorKinds':['human','agent'],'mutation':False,'revisioned':False,
 'capabilitiesAll':['work:read','repo:read'],'resourceResolverId':'provider_action','feature':'按已授权target provider，gitea为WORKMESH_BETA_GITEA',
 'visibility':'authz只对本operation归一隐藏target，最终授权SELECT核requester/principal/Session/resource；不使用M1安装identity例外',
 'mcpBinding':{'name':'get_provider_action','directE':{'parameters':['id'],'identity':'current exact E'},
   'coordination':{'parameters':['id','sessionId'],'identity':'显式target E局部Token bridge','implicitTargetFromResponse':False},'readonly':True,'installationTarget':False},
 'runnerBinding':{'name':'workmesh_get_provider_action','parameters':['id'],'identity':'api.sessionId，不接受他Session'},
 'discoveryFacts':['liveAuthority','sessionKind=execution','ordinaryReadState','capabilitiesAll','requiresTargetCheck=requester/session/repo/context/provider']},
 'reviewPatch':{'repositoryIds':'optional,1..100,unique UUID','defaultCapabilities':['work:read','work:write','artifact:write'],
  'explicitAdditionalCapabilities':['repo:read'],'threeWayIntersection':True,'sharedContextOnly':True,'lateParentRevalidation':True,
  'neverGrant':['plan:write','repo:write_branch','repo:open_pr','repo:merge','ci:run'],
  'replay':{'beforeReserve':'完整父/目标/准确回执子authority锁先于幂等回执锁',
    'authorizeReplay':'同一校验器重验三方repo:read/父当前scope/精确父子binding/共享context',
    'repeatAdmission':False,'omittedRepositoryIds':'M2权限和回执不变，仅内部锁序统一'}},
 'workerRecovery':{'matrix':'worker-recovery.md','writeWithoutCheckpointAfterClaim':'dead/PROVIDER_ACTION_OUTCOME_UNKNOWN/human_reconcile',
  'checkpoint':'只本地完成，零provider HTTP','contextOnly':'原有界纯GET重试','monotonicAttempt':True},
 'workerSend':{'contract':'worker-authority.md','guard':'内部action-scoped beforeMutation，逐次仓库写HTTP',
  'authorityRanks':'复用lockAgentAuthorityPlan完整计划','gates':'merge/CI/最终租期/approval同tx',
  'providerIoInsideTransaction':False},
 'generation':'保M0/M1/M2输入，新增M3产品决策增量；当前提案不进入生成脚本运行',
 'humanPreserved':['connectRepository','pinRepositoryContext','decideApproval','publishProjectUpdate','decideCompletionSuggestion'],
 'conditionalExisting':{'createProjectHealthUpdate':'source=agent,publish=true仍需Human精确批准与If-Match'},
 'runnerTransfer':{'maxInlineUtf8Bytes':32768,'userPathOrUrl':False,'redirect':'error','workmeshCredentialsToStorage':False,'signedMaterialToModel':False}}
(OUT/'policy-proposal.json').write_text(json.dumps(policy,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'kindCount':len(variants),'schemas':3,'exitCode':0}))
