"""受控文档生成器；仅写本目录，不启动产品、数据库、容器或外部客户端。"""
import importlib.util,json,hashlib,re,subprocess,sys,platform
from copy import deepcopy
from datetime import datetime,timezone
from pathlib import Path
import yaml
D=Path(__file__).resolve().parent
ROOT=D.parents[2]
CACHE=Path("C:/Users/xurx/.tds/workspaces/DzkLDn6UW-IbfoTJzN9Ro/repo")
BASE="c768e1e3db297d8b91b53dd68b60e723a8a40e7d"
MAIN="69085317c88d84b702af727dc0ac7152589626d8"
PREVIOUS="1bcf1567b8d3f8774b219f927e3d832e72e4c7ef"
ORIGINAL="00a5e34e48f4a099f7a85dbf8dd41c79d8ee2294"
DOC="Qd1Ks9EH9uEvl1JW3O68D"
START=datetime.now(timezone.utc).isoformat()
def git(args,cwd=ROOT):return subprocess.check_output(["git",*args],cwd=cwd)
def digest(b):return hashlib.sha256(b).hexdigest()
def load(n):return json.loads((D/n).read_text(encoding="utf8"))
def save(n,v):(D/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+"\n",encoding="utf8",newline="\n")
def md(n,v):(D/n).write_text(v.rstrip()+"\n",encoding="utf8",newline="\n")
def module(n):
 spec=importlib.util.spec_from_file_location(n.replace("-","_"),D/(n+".py"));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
R=module("audit-rules")
SYNTAX=module("binding-syntax")
blobs={};oids={}
def oid(p):
 if p not in oids:oids[p]=git(["rev-parse",MAIN+":"+p],CACHE).decode().strip()
 return oids[p]
def blob(p):
 if p not in blobs:blobs[p]=git(["show",MAIN+":"+p],CACHE)
 return blobs[p]
def text(p):return blob(p).decode("utf8")
def evidence(p,a,why="人工核读领域谓词/实际调用身份"):
 t=text(p);offset=t.find(a);assert offset>=0,(p,a)
 return {"path":p,"line":t[:offset].count("\n")+1,"anchor":a,"reason":why,"sourceHead":MAIN,"gitObjectId":oid(p)}
old=json.loads(git(["show",PREVIOUS+":docs/plan/agent-mcp-m0/operation-decisions.json"]))
old_pending={r["operationId"] for r in old["operations"] if r["qualifications"]["domainAudit"].startswith("未核实")}
assert old_pending==set(R.RULES),("规则目录缺漏",sorted(old_pending-set(R.RULES)))
api=yaml.safe_load(text("OPENAPI.yaml"))
contracts={v["operationId"]:(m.upper(),p,v,d.get("parameters",[])) for p,d in api["paths"].items() for m,v in d.items() if m in ["get","post","patch","put","delete"] and "operationId" in v}
assert set(contracts)=={r["operationId"] for r in old["operations"]}
def expand(v,stack=()):
 if isinstance(v,list):return [expand(x,stack) for x in v]
 if not isinstance(v,dict):return v
 if "$ref" in v and v["$ref"].startswith("#/") and v["$ref"] not in stack:
  ref=v["$ref"];target=api
  for part in ref[2:].split("/"):target=target[part.replace("~1","/").replace("~0","~")]
  return {"sourceRef":ref,**expand(target,stack+(ref,)),**{k:expand(x,stack) for k,x in v.items() if k!="$ref"}}
 return {k:expand(x,stack) for k,x in v.items()}
ACTIVE=["acknowledged","planning","executing","awaiting_input","awaiting_approval","blocked"]
ALL=["queued",*ACTIVE,"paused","stopping","stale","completed","failed","canceled"]
ROLES=["executor","reviewer","researcher","coordinator","triager"]
def route_states(r):
 op=r["operationId"];p=r["currentPolicy"]
 if not p["agent"]["requireActiveSession"]:return ALL
 if op=="acknowledgeAgentSession":return ["queued","stale","acknowledged"]
 if op=="getAgentCapabilityManifest":return ["queued",*ACTIVE]
 if op=="acknowledgeAgentSessionStop":return ["stopping"]
 if op=="heartbeatAgentSession":return ALL
 return ACTIVE
for op in ["publishDeliveryArtifact","requestArtifactUpload"]:
 for g in R.RULES[op]["predicates"]:
  if g["fact"]=="repositoryContextApplicable":g["when"]={"deliveryVariant":"repository"}
  if g["fact"]=="deliveryCurrentHead":g["when"]={"pullRequestProvided":True}
R.RULES["consumeApproval"]["predicates"].insert(0,R.gate("credentialMode",["agent_session","coordination_connection"],"FORBIDDEN","consumeApproval handler只Agent，Human凭据虽route允许仍拒绝"))
R.RULES["getRepositoryContext"]["predicates"]=[g for g in R.RULES["getRepositoryContext"]["predicates"] if g["fact"]!="repositoryHumanFiltersAbsent"]
def domain_eval(gates,facts):
 for g in gates:
  if g.get("when") and not all(facts.get(k)==v for k,v in g["when"].items()):continue
  if facts.get(g["fact"]) not in g["allowed"]:return {"status":"blocked","reason":g["reason"],"failedFact":g["fact"]}
 return {"status":"eligible","reason":None}
def cases(op,gates,actor):
 baseline={}
 for g in gates:
  if not g.get("when"):baseline[g["fact"]]=g["allowed"][0]
 baseline.update({"deliveryVariant":"repository","pullRequestProvided":True})
 preferred={"E":"agent_session","C":"coordination_connection","H":"human_session"}.get(actor)
 allowed_credentials=next(g["allowed"] for g in gates if g["fact"]=="credentialMode")
 if preferred in allowed_credentials:baseline["credentialMode"]=preferred
 for g in gates:
  if g.get("when") and all(baseline.get(k)==v for k,v in g["when"].items()):baseline[g["fact"]]=g["allowed"][0]
 positives=[{"id":"M0-ALLOW-"+op,"facts":deepcopy(baseline)}]
 for g in gates:
  if g.get("when"):
   f=deepcopy(baseline);f.update(g["when"])
   for x in gates:
    if x.get("when") and all(f.get(k)==v for k,v in x["when"].items()):f[x["fact"]]=x["allowed"][0]
   positives.append({"id":"M0-ALLOW-"+op+"-"+g["fact"]+"-variant","facts":f})
  elif len(g["allowed"])>1 and g["fact"] not in ["credentialMode","sessionKind","role","state"]:
   for i,value in enumerate(g["allowed"][1:]):
    f=deepcopy(baseline);f[g["fact"]]=value;positives.append({"id":"M0-ALLOW-"+op+"-"+g["fact"]+"-"+str(i),"facts":f})
 negatives=[]
 for i,g in enumerate(gates):
  f=deepcopy(baseline)
  if g.get("when"):
   f.update(g["when"])
   for x in gates:
    if x.get("when") and all(f.get(k)==v for k,v in x["when"].items()):f[x["fact"]]=x["allowed"][0]
  f[g["fact"]]=False if g["allowed"]==[True] else "outside_allowed_"+g["fact"]
  result=domain_eval(gates,f);assert result["status"]=="blocked"
  negatives.append({"id":"M0-DENY-"+op+"-"+g["fact"]+"-"+str(i),"facts":f,"expect":result,"predicate":g["description"],"file":("apps/api/src/client-profile-contract.test.ts" if False else "packages/conformance/src/mcp-coverage.conformance.test.ts"),"executionStatus":"待产品测试；当前只求值文档谓词，reason是发现原因，不冒API运行错误"})
 for c in positives:
  c.update({"actor":actor,"expect":domain_eval(gates,c["facts"]),"executionStatus":"待产品测试；当前只求值文档谓词"})
  assert c["expect"]["status"]=="eligible",(op,c)
 return positives,negatives
OPERATIONS=[]
for prior in old["operations"]:
 r=deepcopy(prior);op=r["operationId"];rule=R.RULES.get(op);p=r["currentPolicy"];q=r["qualifications"]
 m,path,v,pathParams=contracts[op];assert (m,path)==(r["rest"]["method"],r["rest"]["path"])
 r["openApiContract"]={"operationId":op,"method":m,"path":path,"parameters":expand(pathParams+v.get("parameters",[])),"requestBody":expand(v.get("requestBody")),"responses":expand(v.get("responses",{})),"sourceHead":MAIN}
 r["source"]["head"]=MAIN;r["source"]["historicalBase"]=BASE
 r["sourceEvidence"]=[evidence(e["path"],e["anchor"],e["reason"]) for e in r["sourceEvidence"]]
 r["openApiDeclaration"]={"path":"OPENAPI.yaml","line":next(i+1 for i,l in enumerate(text("OPENAPI.yaml").splitlines()) if re.search(r"\boperationId:\s*"+re.escape(op)+r"\b",l))}
 q["states"]["route"]=route_states(r);q["states"]["source"]=evidence("apps/api/src/authz/authorize.ts","export function sessionActiveForOperation(")
 if rule:
  q["domainAudit"]="已逐项核读route/handler/domain及实际binding；待独审与产品调用"
  q["delegationRoles"]["source"]="具体handler未额外限制则保留route角色；条件intent/variant见predicates"
  q["capabilitiesAll"]=list(dict.fromkeys(p["agent"]["capabilities"]+rule.get("extraCaps",[])))
  q["states"]["commandNewWrite"]=rule.get("states",q["states"]["route"])
  if rule.get("adapterInternal"):q["credentialModes"]=["agent_session"];q["sessionKinds"]=["execution"]
  if rule.get("positiveActor")=="C":q["sessionKinds"]=["coordination"]
  if op in ["cancelHandoff","completeHandoff"]:q["credentialModes"]=["human_session"];q["sessionKinds"]=[];q["delegationRoles"]["allowed"]=[]
  if op=="consumeApproval":q["credentialModes"]=[x for x in q["credentialModes"] if x!="human_session"]
  if op in ["deleteProject","deleteWorkItem","delegateAndStartAgentSession","claimWorkItem"]:q["delegationRoles"]={"allowed":["coordinator"],"denied":[x for x in ROLES if x!="coordinator"],"source":"当前C/teamAccess/Connection协调规则"}
  if rule.get("roles"):q["delegationRoles"]["allowed"]=rule["roles"]
  r["sourceEvidence"] += [evidence(rule["sourcePath"],a) for a in rule["anchors"]]
  r["sourceEvidence"] += [evidence(path,a) for path,a in rule.get("additionalSources",[])]
  r["domainDecision"]=deepcopy(rule)
  if rule["sourcePath"]=="apps/api/src/documents.ts":q["knownCoordinationPrerequisite"]="当前派生C为team Session，无work_item/project owner，API据此固定RESOURCE_SCOPE_DENIED；不能把Team scope当owner"
  r["notes"]=[rule["decision"],"已完成静态审计；本轮未运行产品",*([rule["domainDifference"]["closure"]] if rule.get("domainDifference") else [])]
  r["classification"]=[x for x in r["classification"] if x!="领域差异待核"]
  if rule.get("domainDifference"):r["classification"].append("领域差异已定位")
  if rule.get("adapterInternal"):r["classification"]=["adapter内部","部署可选"]
  if rule.get("futureAdapter"):r["implementationBoundary"]=rule["futureAdapter"]
 if op=="getServerInfo":
  q["credentialModes"]=["public","human_session","agent_session","coordination_connection"]
  q["domainAudit"]="公开安全元数据；无Session/role/state/live grant前提；adapter部署可用性独立投影"
 actor="public" if op=="getServerInfo" else (rule or {}).get("positiveActor") or ("H" if q["credentialModes"]==["human_session"] else "C" if q["sessionKinds"]==["coordination"] else "E")
 credentials=q["credentialModes"]
 if actor=="H" and "human_session" not in credentials:actor="internal"
 gates=[R.gate("credentialMode",credentials,"CREDENTIAL_MODE_MISMATCH","准确route/domain凭据允许集合；无Human cookie替代")]
 if actor=="H":gates.append(R.gate("humanAuthorityMatches",True,"FORBIDDEN","按现行route Human workspace/team role及handler membership/owner谓词，不把Human凭据本身当权限"))
 if actor in ["C","E"]:
  gates += [R.gate("sessionKind",q["sessionKinds"] or ["execution","coordination"],"ROLE_REQUIRED","准确Session kind"),R.gate("role",q["delegationRoles"]["allowed"] or ROLES,"ROLE_REQUIRED","明确角色或无额外角色要求"),R.gate("state",q["states"]["commandNewWrite"] or q["states"]["route"],"SESSION_STATE_DENIED","route与domain实际状态交集"),R.gate("liveAuthority",True,"AUTHORITY_REVOKED","Connection/Delegation/Team grant均live，能力为实时交集，不用feature替代")]
  if q["capabilitiesAll"]:gates.append(R.gate("capabilitiesAllPresent",True,"CAPABILITY_DENIED","全部所需能力="+",".join(q["capabilitiesAll"])))
  if p["agent"]["resourceScope"]=="resolved_resource":gates.append(R.gate("routeResolvedScope",True,"NOT_FOUND","准确resolved_resource在live范围内；跨Team隐藏存在性"))
  if p["feature"]["key"]:gates.append(R.gate("featureEnabled",True,"FEATURE_DISABLED","部署feature只追加门禁"))
  if p["idempotency"]=="required":gates.append(R.gate("idempotencyValid",True,"IDEMPOTENCY_CONFLICT","同key同body同逻辑身份；改body/new intent不能复用旧身份"))
  if p["revision"]!="none":gates.append(R.gate("revisionMatches",True,"REVISION_CONFLICT","If-Match准确；不盲写后报成功"))
  if p["approval"]["required"]:gates.append(R.gate("approvalBound",True,"APPROVAL_REQUIRED","live批准绑定准确action和payload"))
  if p["lease"]["required"]:gates.append(R.gate("leaseBound",True,"LEASE_REQUIRED","准确资源当前有效Lease；Lease不是授权"))
 if rule:gates += deepcopy(rule["predicates"])
 else:
  # 其余已核记录的具体限制沿旧清单保留，并以其源码锚点和明确targetChecks复核。
  if q["targetChecks"]:gates.append(R.gate("domainTargetFactsMatch",True,"TARGET_PREREQUISITE_DENIED","；".join(q["targetChecks"])))
 if op=="publishAgentPlan":
  gates.append(R.gate("planApprovalBound",True,"APPROVAL_REQUIRED","awaiting_approval必须approvalId及准确hash",{"state":"awaiting_approval"}))
 if op=="publishArtifact":
  gates.append(R.gate("artifactType","code_review","ROLE_REQUIRED","reviewer仅code_review",{"role":"reviewer"}))
 q["predicates"]=gates
 r["positiveTests"],r["negativeTests"]=cases(op,gates,actor)
 r["domainAuditComplete"]=True
 r["currentDomainVsProposedDiscovery"]={"current":"route与逐项handler谓词联合；不改变已有领域权限","proposed":rule.get("discoveryBlocked") if rule else None,"closure":rule.get("domainDifference",{}).get("closure") if rule else None}
 for a,credential,kind,role in [("C","coordination_connection","coordination","coordinator"),("E","agent_session","execution","executor")]:
  reason=None
  if credentials==["human_session"]:reason="HUMAN_ONLY"
  elif credential not in credentials and "public" not in credentials:reason="CREDENTIAL_MODE_MISMATCH"
  elif q["sessionKinds"] and kind not in q["sessionKinds"]:reason="ROLE_REQUIRED"
  elif rule and rule.get("discoveryBlocked"):reason=rule["discoveryBlocked"]
  elif rule and rule.get("adapterInternal"):reason="RUNNER_SERVICE_REQUIRED"
  elif a=="C" and rule and rule["sourcePath"]=="apps/api/src/documents.ts":reason="RESOURCE_SCOPE_DENIED"
  r["agentDiscoveryDecision"][a]={"status":"blocked" if reason else "requires_target_check","reasons":[reason] if reason else ["LIVE_FACTS_REQUIRED"],"eligible":False,"roleAndStateResolvedBy":"qualifications.predicates","authorityProof":False}
  if op=="getServerInfo":r["agentDiscoveryDecision"][a]={"status":"eligible","reasons":[],"eligible":True,"purpose":"公开安全元数据；无Session状态/权限前提，不授予业务权限"}
 r["verificationStatus"]="静态文档谓词/源码绑定完成；待独审、编码和产品测试；不是运行授权证明"
 OPERATIONS.append(r)
BYID={r["operationId"]:r for r in OPERATIONS}
COMPOSITE=old["compositeBindings"]
SCANNED=SYNTAX.scan(text("apps/mcp/src/index.ts"),text("apps/mcp/src/coordination-product.ts"))
COORD={"verify_connection","get_current_identity","get_workmesh_context","resolve_identifier","list_claimable_work_items","delegate_work_item","claim_work_item","list_teams","list_workflow_states","list_projects","get_project","apply_project_import","create_project","update_project","create_work_item","update_work_item","create_milestone","update_milestone","delete_milestone","add_work_item_relation","remove_work_item_relation"}
EXACT_TARGET={name:"sessionId" for name in "list_session_activities explain_agent_session preview_agent_session_control create_repository_branch create_repository_commit open_pull_request publish_delivery_artifact request_artifact_upload finalize_artifact_upload publish_structured_review merge_pull_request retry_ci_check draft_project_update comment_plan_step propose_plan_step_assignment append_context_delta create_review_delegation acquire_lease ack_agent_session transition_agent_session_state heartbeat append_activity publish_plan send_message ask request_approval publish_artifact complete_session fail_session".split()}
EXACT_TARGET.update({"create_child_session":"parentSessionId","offer_handoff":"fromSessionId","request_handoff":"sourceSessionId","agent-session":"id","session-context":"id","session-plan":"id","session-activity":"id"})
OPTIONAL_TARGET={"get_work_room":"sessionId","post_work_room_message":"sessionId"}
ALIASES={"get_agent_session":"agent-session","get_session_plan":"session-plan","get_session_context":"session-context"}
INSTALLATION={"inspect_pending_handoff","reject_handoff"}
HELPERS={"get_workmesh_context":("getWorkMeshContext",["getAgentCapabilities","getCurrentAgentConnectionIdentity","listTeams","listWorkflowStates","getServerInfo","getFeatures"]),"resolve_identifier":("resolveIdentifier",["listTeams","listProjects","listWorkflowStates","listWorkItems","getWorkItem","listProjectMilestones"]),"apply_project_import":("applyProjectImport",["listTeams","listWorkflowStates","createProject","createMilestone","createWorkItem","createWorkItemRelation"]),"prepare_project_import":("prepareProjectImport",[]),"delegate_work_item":("delegate",["delegateAndStart"])}
def sdk_evidence(method):
 p="packages/agent-sdk/src/index.ts";lines=text(p).splitlines()
 for line in lines:
  if re.match(r"\s+(?:async\s*\*?\s*)?"+re.escape(method)+r"(?:<|\()",line):return evidence(p,line.strip(),"具名SDK实现及request选Token路径")
 raise AssertionError(("缺SDK具名方法",method))
def variants(name,target,optional=False):
 out=[{"variant":"self_execution","credentialMode":"agent_session","sessionKind":"execution","targetParameter":target,"targetEqualsManifestSession":True,"installationBridgeRequired":False,"tokenIdentity":"当前E Token；request的installation刷新条件不成立","qualificationIdentity":"当前E自身manifest","absentTarget":"当前E（仅可选参数）；必填仍遵守原schema" if optional else "原schema拒绝缺必填目标；resource必须准确URI id","rejectDifferentSession":True},
 {"variant":"target_execution","credentialMode":"coordination_connection","sessionKind":"coordination","targetParameter":target,"installationBridgeRequired":True,"tokenIdentity":"按准确输入目标取得一次E Token，单次作用域client读取该E manifest并执行；不改共享Token","qualificationIdentity":"目标E自身manifest；必须exact id/execution kind","absentTarget":{"status":"requires_target_check","countedInAllowedOperations":False},"rejectDifferentSession":False}]
 if optional:out.append({"variant":"current_session_without_target","credentialMode":["agent_session","coordination_connection"],"targetParameter":None,"installationBridgeRequired":False,"tokenIdentity":"参数省略后SDK refreshSessionId为空，保留当前Token/Connection；领域谓词仍需通过","qualificationIdentity":"当前exact Session","countedInAllowedOperations":"只对已知当前范围eligible"})
 return out
BINDINGS=[]
for prior in old["bindingDecisions"]:
 b=deepcopy(prior);bid=b["bindingId"];name=bid.split(":",1)[1];syntax=SCANNED.get(bid);p=b["proposed"]
 target=EXACT_TARGET.get(name) or EXACT_TARGET.get(ALIASES.get(name,""));optional=name in OPTIONAL_TARGET
 if optional:target=OPTIONAL_TARGET[name]
 if syntax:
  src=evidence("apps/mcp/src/index.ts","server.register"+("Tool" if bid.startswith("tool:") else "Resource")+"('"+name+"'")
  b["current"]["source"]=src;b["current"]["inputSchemaSource"]=src
  b["current"]["inputFields"]=syntax["inputFields"];b["current"]["uri"]=syntax["uri"];b["current"]["uriParameters"]=syntax["uriParameters"]
  b["current"]["sdkMethods"]=syntax["sdkMethods"];b["current"]["sdkMethodSources"]=[sdk_evidence(x) for x in syntax["sdkMethods"]]
  b["current"]["credentialSelection"]={"source":evidence("packages/agent-sdk/src/index.ts","private async request<T>("),"sessionToken":"若已有Session Token则不触发安装refresh；当前Token绑定自身，其他id由API拒绝","coordinationToken":"无显式Authorization时作为x-workmesh-installation-token；只有明确refreshSessionId且installation用途槽可用才取得局部目标Token","protectedResponse":"无401后自动身份刷新路径，传输重试规则独立","explicitTargetInput":target,"optionalTargetInput":optional}
  if name in HELPERS:
   helper,methods=HELPERS[name];b["current"]["helperCalls"]={"helper":helper,"sdkMethods":methods,"source":evidence("apps/mcp/src/index.ts" if name=="delegate_work_item" else "apps/mcp/src/coordination-product.ts",("const delegate =" if name=="delegate_work_item" else "function "+helper+"("))}
   b["current"]["sdkMethodSources"] += [sdk_evidence(x) for x in methods]
 else:
  assert b["current"] is None,bid
  resource=p.get("sourceResource")
  assert resource in SCANNED,(bid,resource)
  b["proposedInput"]={"sourceResource":resource,"fields":SCANNED[resource]["uriParameters"],"contract":"复用原resource SDK方法/分页；保留旧resource URI"}
  b["sourceEvidence"]=[sdk_evidence(x) for x in SCANNED[resource]["sdkMethods"]]
 p["targetParameter"]=target;p["unspecifiedTarget"]=None
 p["identityVariants"]=variants(name,target,optional) if target else []
 if name=="prepare_project_import":p["identityBinding"]="none";p["operationIds"]=[];p["execution"]="adapter_internal"
 elif name in INSTALLATION:p["identityBinding"]="installation_target";p["identityVariants"]=[{"variant":"installation_target","credentialMode":"installation_target","session":None,"delegation":None,"manifest":None,"targetParameter":None,"installationBridgeRequired":False,"qualificationIdentity":"原安装target/handOff边界，不请求Session manifest"}]
 elif target:
  p["identityBinding"]="explicit_identity_variants";p["unspecifiedTarget"]={"status":"requires_target_check","reasons":["TARGET_CHECK_REQUIRED"],"countedInAllowedOperations":False,"needsConfiguredInstallationBridge":True,"appliesOnlyTo":"target_execution"}
 else:
  p["identityBinding"]="current_coordination" if name in COORD else "current_session"
  p["identityVariants"]=[{"variant":p["identityBinding"],"credentialMode":"coordination_connection" if name in COORD else ["agent_session","coordination_connection"],"targetParameter":None,"installationBridgeRequired":False,"qualificationIdentity":"当前exact Session","tokenIdentity":"保留当前client身份；普通id/返回id不刷新身份"}]
 p["coordinationConfiguredRequired"]=name in COORD
 if name=="claim_work_item":
  p["postClaimExchange"]={"targetParameter":None,"sourceCredential":"coordination_connection","exchangeCredential":"coordination_connection","newSessionIdSource":"claim响应session.id","exchangeTokenSource":"claim响应exchangeToken","installationBridgeRequired":False,"resultSessionState":"queued","manifestAndContextAfterAckOnly":True}
  b["current"]["claimDeploymentFacts"]={"mcpConstructors":"HTTP/stdio把同一Connection凭据放入coordinationToken与installationToken用途槽","sdkSlotRequired":"exchangeClaimedSessionToken要求installationToken槽，只有coordinationToken的裸SDK反例返回INSTALLATION_TOKEN_REQUIRED","separateInstallationBridgeRequired":False,"source":[evidence("apps/mcp/src/http.ts","installationToken: coordinationToken,"),evidence("apps/mcp/src/stdio.ts","installationToken: coordinationToken"),sdk_evidence("exchangeClaimedSessionToken")]}
 if name=="reject_handoff":
  b["current"]["credentialBranches"]={"hasSessionToken":"SDK先调用mutateHandoff；现行installation_target route资格失败，不能广告通用E拒绝","withoutSessionToken":"SDK显式安装Authorization并skipTokenRefresh；仍核exact target requested handoff","proposed":"保留已核安装target，不增加Session认证例外"}
 if name in ["verify_connection","get_current_identity"]:
  p["targetParameter"]=None;p["unspecifiedTarget"]=None
  assert not syntax["inputFields"]
 if name in ["preview_agent_session_control","prepare_project_import"]:p["mode"]=["read-only","read-write"]
 p["roleAndScopeRules"]="全部组成operation的qualifications.predicates；人类专属拒绝兼容callback；target_execution独立取目标E"
 p["discoverySemantics"]={"eligibleRequires":"有具名实现、实际注册、mode/部署配置匹配且准确身份API资格通过全部已知谓词","conditionalRequires":"缺精确目标仅条件入口，不纳入当前allowedOperations","contextProjection":"与该次tools/resources投影为同一对象，不跨mode缓存"}
 b["semanticTests"]=[{"id":"M0-BINDING-ALLOW-"+name,"file":"packages/conformance/src/mcp-coverage.conformance.test.ts","executionStatus":"待产品测试","expect":"资格/组成调用与实际输入一致；允许后继续合法读取"},{"id":"M0-BINDING-DENY-"+name,"file":"apps/mcp/src/index.test.ts","executionStatus":"待产品测试","expect":"错误身份或readonly写调用拒绝，不刷新/换Token绕过"}]
 BINDINGS.append(b)
assert {b["bindingId"] for b in BINDINGS if b["current"]}==set(SCANNED)
for r in OPERATIONS:
 op=r["operationId"]
 for adapter in r["sdkNamedAdapters"]:
  e=sdk_evidence(adapter["method"]);adapter["sourceHead"]=MAIN;adapter["source"]=e["path"]+":"+str(e["line"]);adapter["evidence"]=e
 for adapter in r["runnerNamedAdapters"]:
  e=evidence("apps/agent-runner/src/workmesh-tools.ts",adapter["name"],"Runner实际具名工具定义；Pi资格仍由其自身E决定")
  adapter["sourceHead"]=MAIN;adapter["line"]=e["line"];adapter["source"]=e["path"]+":"+str(e["line"]);adapter["evidence"]=e
 r["currentMcpBindings"]=[{"bindingId":b["bindingId"],"operationIds":b["current"]["operationIds"],"source":b["current"]["source"],"registered":"源码callback存在；实际注册条件另列"} for b in BINDINGS if b["current"] and op in b["current"]["operationIds"]]
 r["mcpBindings"]=r["currentMcpBindings"]
 r["proposedMcpBindings"]=[{"bindingId":b["bindingId"],"operationIds":b["proposed"]["operationIds"],"identityVariants":b["proposed"]["identityVariants"],"mode":b["proposed"]["mode"]} for b in BINDINGS if op in b["proposed"]["operationIds"]]
 if r["operationId"] in R.RULES:r["domainDecision"]["affectedCurrentBindings"]=[x["bindingId"] for x in r["currentMcpBindings"]]
save("operation-decisions.json",{"sourceHead":MAIN,"historicalBase":BASE,"observedMainHead":MAIN,"previousArchiveHead":PREVIOUS,"originalArchiveHead":ORIGINAL,"planDocId":DOC,"generatedAt":datetime.now(timezone.utc).isoformat(),"status":"仅文档静态审计；两项阻断待独立复审，不confirm产品","operationCount":len(OPERATIONS),"auditClosure":{"previousPending":len(old_pending),"audited":len(R.RULES),"unresolvedDomainAudits":0,"priorBoundPending":sum(bool(x["currentMcpBindings"]) for x in OPERATIONS if x["operationId"] in old_pending),"explicitDomainDifferences":[x["operationId"] for x in OPERATIONS if x.get("domainDecision",{}).get("domainDifference")]},"compositeBindings":COMPOSITE,"bindingDecisions":BINDINGS,"operations":OPERATIONS})
save("domain-rules.json",{"scope":"人工核读的99条领域谓词；不参与产品授权","sourceHead":MAIN,"rules":list(R.RULES.values())})
q=chr(96)
lines=["# M0逐操作受控决定","","本页覆盖当前不可变main的实际OpenAPI全集，完整参数、展开返回引用、credential/role/state/scope、当前与拟binding、源码及逐项正反例见 [operation-decisions.json](operation-decisions.json)。API资格和adapter注册/发现投影分别计算；静态正例不是产品运行结果。","","| operationId / REST | 分类 | C / E发现 | 当前 → 拟binding | 领域决定 / 正反例 |","| --- | --- | --- | --- | --- |"]
for r in OPERATIONS:
 c=lambda a:r["agentDiscoveryDecision"][a]["status"]+":"+",".join(r["agentDiscoveryDecision"][a]["reasons"])
 lines.append("| "+q+r["operationId"]+q+"<br>"+q+r["rest"]["method"]+" "+r["rest"]["path"]+q+" | "+"；".join(r["classification"])+" | C="+c("C")+"<br>E="+c("E")+" | "+"；".join(b["bindingId"] for b in r["currentMcpBindings"])+" → "+"；".join(b["bindingId"] for b in r["proposedMcpBindings"])+" | "+r.get("domainDecision",{}).get("decision","；".join(r["qualifications"]["targetChecks"]))+"<br>"+str(len(r["positiveTests"]))+"允许/"+str(len(r["negativeTests"]))+"拒绝；"+r["sourceEvidence"][-1]["path"]+":"+str(r["sourceEvidence"][-1]["line"])+" |")
md("operation-index.md","\n".join(lines))
lines=["# 既有领域逐项审计","","原99条待核记录在本轮静态方案门禁内逐项核读；已注册binding按实际输入与SDK身份分支核对。下表逐operation列出明确谓词、源码、允许正例和拒绝反例。完整fact场景及条件分支在结构化清单中；本轮没有产品运行通过结论。","","| operationId | credential / role / state / scope与variant | 源码锚点 | 正例 / 反例 | 领域差异与本批闭合 |","| --- | --- | --- | --- | --- |"]
for op,rule in R.RULES.items():
 r=BYID[op];qual=r["qualifications"]
 facts="；".join(g["fact"]+"="+"/".join(str(x) for x in g["allowed"])+(" when "+str(g["when"]) if g.get("when") else "") for g in qual["predicates"])
 src="<br>".join(e["path"]+":"+str(e["line"])+" "+e["anchor"] for e in r["sourceEvidence"] if e["path"]==rule["sourcePath"])
 tests=r["positiveTests"][0]["id"]+"："+str(r["positiveTests"][0]["facts"])+"<br>"+"<br>".join(t["id"]+"："+t["predicate"]+"→"+t["expect"]["reason"] for t in r["negativeTests"])
 lines.append("| "+q+op+q+" | "+facts+"<br>"+rule["decision"]+" | "+src+" | "+tests+" | "+rule.get("domainDifference",{}).get("closure","门禁已核；M0验证准确信息披露/拒绝和正对照，不改变领域授权")+" |")
md("domain-audit.md","\n".join(lines))
origsrc=json.loads(git(["show",PREVIOUS+":docs/plan/agent-mcp-m0/source-manifest.json"]))
paths=set(f["path"] for f in origsrc["files"])|set(blobs)|{"apps/api/src/delivery/repository-configuration.ts"}
files=[]
for path in sorted(paths):
 main=blob(path);wpath=ROOT/path;w=wpath.read_bytes() if wpath.exists() else None
 try:base=git(["show",BASE+":"+path]);baseoid=git(["rev-parse",BASE+":"+path]).decode().strip()
 except subprocess.CalledProcessError:base=None;baseoid=None
 normal=lambda b:b.decode("utf8").replace("\r\n","\n") if b is not None else None
 entry={"path":path,"gitBlob":{"head":MAIN,"objectId":git(["rev-parse",MAIN+":"+path],CACHE).decode().strip(),"bytes":len(main),"sha256":digest(main)},"historicalBase":{"head":BASE,"objectId":baseoid,"bytes":len(base) if base else None,"sha256":digest(base) if base else None},"worktree":{"bytes":len(w),"sha256":digest(w),"crlf":w.count(b"\r\n")} if w is not None else None,"mainEqualsHistoricalBase":main==base,"mappingToHistoricalBase":"字节相同" if w==base else "仅CRLF/LF转换" if normal(w)==normal(base) else "工作树仍历史产品；当前main增量未整合","mappingToMain":"字节相同" if w==main else "仅CRLF/LF转换" if normal(w)==normal(main) else "仅文档候选未整合main产品变化"}
 files.append(entry)
save("source-manifest.json",{"sourceHead":MAIN,"historicalBase":BASE,"observedMainHead":MAIN,"observedAt":datetime.now(timezone.utc).isoformat(),"remoteRefEvidence":"platform-observation-q.json mainRef，精确refs/heads/main，不用FETCH_HEAD","files":files,"mainDelta":{"allPaths":git(["diff","--name-only",BASE,MAIN],CACHE).decode().splitlines(),"sourceChanges":[f["path"] for f in files if not f["mainEqualsHistoricalBase"]],"integration":"产品工作树仍历史base，仅从当前main不可变blob审计。A2改变Repository参数/响应、context provider_action_id及Human配置helper；Agent过滤teamId/availableOnly明确VALIDATION_ERROR。route-policy/MCP/SDK/Runner身份绑定未变。产品阶段按实际主线整合并重新核source，当前不混入未合旧分支。"}})
save("generation.json",{"startedAt":START,"completedAt":datetime.now(timezone.utc).isoformat(),"command":"python -X utf8 -B docs/plan/agent-mcp-m0/audit-generate.py","runtime":sys.version,"platform":platform.platform(),"sourceHead":MAIN,"historicalBase":BASE,"previousArchiveHead":PREVIOUS,"operationCount":len(OPERATIONS),"registeredBindings":len(SCANNED),"domainRules":len(R.RULES),"sourceFiles":len(files),"productChecksRun":False,"productImplemented":False,"planDocId":DOC,"planVersion":None,"platformDocCreatedAt":None,"planBodySource":"本轮完整注入authoritative saved copy，按五处精确替换同步；平台工具全文截断仅核前缀，不冒后端全文读回","planFiles":[{"path":n,"bytes":len((D/n).read_bytes()),"sha256":digest((D/n).read_bytes())} for n in ["savedplan.md","implementation.md"]],"preservation":"history/previous-1bcf-manifest.json；完整Git与工作树原字节在ZIP"} )
print(json.dumps({"operations":len(OPERATIONS),"bindings":len(BINDINGS),"registered":len(SCANNED),"auditedDomain":len(R.RULES),"positiveCases":sum(len(r["positiveTests"]) for r in OPERATIONS),"negativeCases":sum(len(r["negativeTests"]) for r in OPERATIONS),"sourceFiles":len(files),"productTests":"未运行"},ensure_ascii=False))
