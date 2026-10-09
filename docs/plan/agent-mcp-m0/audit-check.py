"""文档语义、不可变源码和历史字节核验；不启动服务、不写产品、不跑产品测试。"""
import hashlib,importlib.util,json,re,subprocess,zipfile
from copy import deepcopy
from pathlib import Path
from urllib.parse import unquote
import yaml
import time
from itertools import product
CHECK_START=time.perf_counter()
D=Path(__file__).resolve().parent;ROOT=D.parents[2]
CACHE=Path("C:/Users/xurx/.tds/workspaces/DzkLDn6UW-IbfoTJzN9Ro/repo")
def load(n):return json.loads((D/n).read_text(encoding="utf8"))
def digest(b):return hashlib.sha256(b).hexdigest()
def git(args,cwd=ROOT):return subprocess.check_output(["git",*args],cwd=cwd)
def module(n):
 spec=importlib.util.spec_from_file_location(n.replace("-","_"),D/(n+".py"));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
syntax_module=module("binding-syntax");evaluation=module("discovery-evaluation");rules=module("audit-rules")
meta=load("archive-metadata.json");obs=load("platform-observation-q.json")
data=load("operation-decisions.json");source=load("source-manifest.json");generation=load("generation.json")
MAIN=meta["observedMainHead"];PREVIOUS=meta["previousArchiveHead"];ORIGINAL=meta["originalArchiveHead"];BASE=meta["historicalBase"]
assert meta["currentDocId"]=="Qd1Ks9EH9uEvl1JW3O68D" and meta["currentVersion"] is None and meta["platformDocCreatedAt"] is None
assert not any(meta[k] for k in ["newPlanCreated","editPlanCalled","productImplemented","productChecksRun"])
blobs={}
def blob(path):
 if path not in blobs:blobs[path]=git(["show",MAIN+":"+path],CACHE)
 return blobs[path]
plan=(D/"savedplan.md").read_bytes();assert plan==(D/"implementation.md").read_bytes()
full=load("plan-fulltext-binding.json")
assert full["fullInjectedBodyMatches"] and (len(plan),digest(plan))==(full["bytes"],full["sha256"])
todo="\n".join(b["text"] for b in obs["todos"]["content"] if b["type"]=="text")
prefix=todo.split("\nSaved plan:\n",1)[1].split("\n…(truncated)",1)[0].rstrip()
assert prefix and plan.decode().startswith(prefix)
spec=todo.split("\nSpec:\n",1)[1].split("\nSaved plan:\n",1)[0].rstrip()+"\n"
assert (D/"spec.md").read_text(encoding="utf8")==spec
chat="\n".join(b["text"] for b in obs["conversation"]["content"] if b["type"]=="text")
assert "[plan](doc:"+meta["currentDocId"]+")" in chat
assert MAIN+"\trefs/heads/main" in obs["mainRef"]["content"][0]["text"]
history=load("history/previous-1bcf-manifest.json")
with zipfile.ZipFile(D/"history/previous-1bcf.zip") as z:
 assert z.testzip() is None
 index=json.loads(z.read("index.json"));assert index==history
 for row in history["files"]:
  b=git(["show",PREVIOUS+":"+row["path"]]);assert b==z.read(row["gitBlob"]["member"])
  for kind in ["gitBlob","worktree"]:
   saved=z.read(row[kind]["member"]);assert (len(saved),digest(saved))==(row[kind]["bytes"],row[kind]["sha256"])
  assert row["gitObjectId"]==git(["rev-parse",PREVIOUS+":"+row["path"]]).decode().strip()
 old_plan=git(["show",PREVIOUS+":docs/plan/agent-mcp-m0/savedplan.md"]).decode("utf8")
 reconstructed=old_plan
 for replacement in obs["replacements"]:
  old_part,new_part=replacement
  assert reconstructed.count(old_part)==1
  reconstructed=reconstructed.replace(old_part,new_part,1)
 assert reconstructed==plan.decode("utf8"),"完整旧正文+实际五处替换不能重建当前注入正文"
assert (D/"first-byte-check-failure.md").read_bytes()==git(["show",ORIGINAL+":docs/plan/agent-mcp-m0/first-byte-check-failure.md"])
for f in load("history/original-manifest.json")["files"]:
 b=git(["show",ORIGINAL+":"+f["path"]]);assert (len(b),digest(b))==(f["bytes"],f["sha256"])
for f in generation["planFiles"]:
 b=(D/f["path"]).read_bytes();assert (len(b),digest(b))==(f["bytes"],f["sha256"])
api=yaml.safe_load(blob("OPENAPI.yaml").decode("utf8"))
operations={v["operationId"]:(m.upper(),p,v) for p,d in api["paths"].items() for m,v in d.items() if m in ["get","post","patch","put","delete"] and "operationId" in v}
records=data["operations"];byid={r["operationId"]:r for r in records}
assert len(byid)==len(records) and set(byid)==set(operations)
old=json.loads(git(["show",PREVIOUS+":docs/plan/agent-mcp-m0/operation-decisions.json"]))
pending={r["operationId"] for r in old["operations"] if r["qualifications"]["domainAudit"].startswith("未核实")}
assert pending==set(rules.RULES)
assert all(byid[op]["domainAuditComplete"] and byid[op].get("domainDecision") for op in pending)
source_by_path={f["path"]:f for f in source["files"]}
positive_count=negative_count=0
for r in records:
 op=r["operationId"];method,path,contract=operations[op]
 assert (method,path)==(r["rest"]["method"],r["rest"]["path"])
 assert r["openApiContract"]["sourceHead"]==MAIN and r["openApiContract"]["responses"]
 assert r["domainAuditComplete"] and not r["qualifications"]["domainAudit"].startswith("未核实")
 assert "DOMAIN_DIFFERENCE_PENDING" not in json.dumps(r,ensure_ascii=False)
 assert r["positiveTests"] and r["negativeTests"] and r["sourceEvidence"]
 assert set(r["applicability"])==set(r["acceptanceCases"])
 q=r["qualifications"];gates=q["predicates"]
 assert q["credentialModes"] and gates and all(g["description"] and g["allowed"] for g in gates)
 for e in r["sourceEvidence"]:
  lines=blob(e["path"]).decode("utf8").splitlines()
  assert e["line"]>0 and e["anchor"] in lines[e["line"]-1],("无效定位",op,e)
  assert e["sourceHead"]==MAIN and e["gitObjectId"]==source_by_path[e["path"]]["gitBlob"]["objectId"]
 for t in r["positiveTests"]:
  assert evaluation.evaluate_predicates(gates,t["facts"])==t["expect"] and t["expect"]["status"]=="eligible",(op,t["id"])
  assert t["executionStatus"].startswith("待产品测试")
  if op in pending and t["actor"]=="E":assert t["facts"]["credentialMode"]=="agent_session"
  if op in pending and t["actor"]=="C":assert t["facts"]["credentialMode"]=="coordination_connection"
  positive_count+=1
 for t in r["negativeTests"]:
  assert evaluation.evaluate_predicates(gates,t["facts"])==t["expect"] and t["expect"]["status"]=="blocked",(op,t["id"])
  assert not t["id"].startswith("M0-PENDING")
  assert t["executionStatus"].startswith("待产品测试")
  negative_count+=1
 assert {g["fact"] for g in gates}=={t["expect"]["failedFact"] for t in r["negativeTests"]},("缺门禁反例",op)
 if op in pending:
  rule=r["domainDecision"]
  assert rule["decision"] and rule["anchors"] and rule["sourcePath"]
  if rule.get("domainDifference"):assert rule["domainDifference"]["kind"] and rule["domainDifference"]["closure"] and r["currentDomainVsProposedDiscovery"]["closure"]
  assert rule["affectedCurrentBindings"]==[b["bindingId"] for b in r["currentMcpBindings"]]
assert byid["getCurrentAgentConnectionIdentity"]["agentDiscoveryDecision"]["E"]["reasons"]==["CREDENTIAL_MODE_MISMATCH"]
assert byid["getServerInfo"]["agentDiscoveryDecision"]["E"]["status"]=="eligible"
assert not any(g["fact"] in ["role","state","sessionKind","liveAuthority"] for g in byid["getServerInfo"]["qualifications"]["predicates"])
assert "reviewer" in byid["publishAgentPlan"]["qualifications"]["delegationRoles"]["denied"]
assert byid["getDocument"]["agentDiscoveryDecision"]["E"]["status"]=="requires_target_check"
assert {g["fact"] for g in byid["getDocument"]["qualifications"]["predicates"]}>={"documentOwnerBinding","documentOwnerCapabilityScope"}
assert {g["fact"] for g in byid["getInboxItem"]["qualifications"]["predicates"]}>={"inboxAudience","inboxSourceScope"}
assert {g["fact"] for g in byid["renewLease"]["qualifications"]["predicates"]}>={"leaseHolderMatches","leaseStatus","leaseNotExpired"}
assert byid["settleWorkbenchAttempt"]["qualifications"]["states"]["commandNewWrite"]==["acknowledged","planning","executing","awaiting_input","awaiting_approval","blocked"]
assert byid["getWorkbenchAttemptCredential"]["qualifications"]["states"]["commandNewWrite"]==["executing"]
assert byid["getDocument"]["agentDiscoveryDecision"]["C"]["reasons"]==["RESOURCE_SCOPE_DENIED"]
index_ids=re.findall(r"^\| "+chr(96)+r"([^"+chr(96)+r"]+)"+chr(96)+r"<br>",(D/"operation-index.md").read_text(encoding="utf8"),re.M)
assert len(index_ids)==len(set(index_ids)) and set(index_ids)==set(operations)
syntax=syntax_module.scan(blob("apps/mcp/src/index.ts").decode(),blob("apps/mcp/src/coordination-product.ts").decode())
refresh=syntax_module.refresh_condition(blob("packages/agent-sdk/src/index.ts").decode())
fields=["options.skipTokenRefresh","options.authorizationToken","options.refreshSessionId","this.installationToken","this.coordinationToken","this.sessionToken"]
for values in product([False,True],repeat=len(fields)):
 facts=dict(zip(fields,values));skip,explicit,target,installation,connection,session=values
 assert syntax_module.evaluate_boolean(refresh,facts)==(not skip and not explicit and target and installation and (connection or not session))
assert not syntax_module.evaluate_boolean(refresh,dict(zip(fields,[False,False,True,False,False,True])))
assert syntax_module.evaluate_boolean(refresh,dict(zip(fields,[False,False,True,True,True,False])))
bindings={b["bindingId"]:b for b in data["bindingDecisions"]}
assert set(syntax)=={b["bindingId"] for b in bindings.values() if b["current"]}
for bid,b in bindings.items():
 if b["current"]:
  evaluation.validate_binding(b,syntax[bid])
  assert b["current"]["source"]["sourceHead"]==MAIN
  for e in b["current"]["sdkMethodSources"]:
   lines=blob(e["path"]).decode().splitlines();assert e["anchor"] in lines[e["line"]-1]
 for op in b["proposed"]["operationIds"]:assert op in byid
 if b["proposed"]["identityBinding"]=="explicit_identity_variants":assert any(v["variant"]=="self_execution" for v in b["proposed"]["identityVariants"])
prepare=bindings["tool:prepare_project_import"]
assert prepare["current"]["operationIds"]==["listProjects"] and prepare["proposed"]["execution"]=="adapter_internal" and prepare["proposed"]["operationIds"]==[]
assert not any(b["bindingId"]=="tool:prepare_project_import" for b in byid["listProjects"]["proposedMcpBindings"])
C={"credentialMode":"coordination_connection","sessionId":"current-C"}
E={"credentialMode":"agent_session","sessionId":"self-E"}
verify=bindings["tool:verify_connection"];claim=bindings["tool:claim_work_item"]
assert evaluation.project_binding(verify,C,bridge=False)=={"status":"eligible","reason":None,"allowedOperations":data["compositeBindings"]["verify_connection"]}
assert evaluation.project_binding(verify,E)["status"]=="blocked"
assert evaluation.project_binding(claim,C,bridge=False)["status"]=="eligible"
assert evaluation.project_binding(claim,E)["status"]=="blocked"
self_bindings=["resource:agent-session","resource:session-context","resource:session-plan","resource:session-activity","tool:get_agent_session","tool:get_session_context","tool:get_session_plan","tool:list_session_activities"]
for bid in self_bindings:
 b=bindings[bid];evaluation.validate_binding(b,syntax[bid] if bid in syntax else {"inputFields":{},"uriParameters":[]})
 for mode in ["read-only","read-write"]:
  assert evaluation.project_binding(b,E,mode,bridge=False)["status"]=="eligible"
  assert evaluation.project_binding(b,E,mode,target="self-E",bridge=False)["status"]=="eligible"
  assert evaluation.project_binding(b,E,mode,target="other-E",bridge=False)["status"]=="blocked"
  assert evaluation.project_binding(b,E,mode,target="self-E",bridge=False)["status"]=="eligible"
 assert evaluation.project_binding(b,C,bridge=True)["status"]=="requires_target_check"
 assert evaluation.project_binding(b,C,bridge=False)["status"]=="blocked"
 assert evaluation.project_binding(b,C,target="target-E",bridge=True,target_qualification=False)["status"]=="blocked"
 assert evaluation.project_binding(b,C,target="target-E",bridge=True,target_qualification=True)["selectedVariant"]=="target_execution"
write=bindings["tool:create_project"]
ro=[evaluation.project_binding(verify,C,"read-only"),evaluation.project_binding(write,C,"read-only")]
rw=[evaluation.project_binding(verify,C,"read-write"),evaluation.project_binding(write,C,"read-write")]
assert ro[1]["status"]=="blocked" and rw[1]["status"]=="eligible"
assert "createProject" not in evaluation.context_allowed(ro) and "createProject" in evaluation.context_allowed(rw)
# 变异只在内存；显式输入+身份规则必须能发现语义破坏。
mutants=[]
bad=deepcopy(verify);bad["proposed"]["identityBinding"]="explicit_identity_variants";bad["proposed"]["targetParameter"]="sessionId";mutants.append((bad,syntax["tool:verify_connection"]))
bad=deepcopy(bindings["resource:agent-session"]);bad["proposed"]["identityVariants"][0]["installationBridgeRequired"]=True;mutants.append((bad,syntax["resource:agent-session"]))
for bad,syn in mutants:
 try:evaluation.validate_binding(bad,syn)
 except AssertionError:pass
 else:raise AssertionError("绑定语义变异未被拒绝")
source_text=blob("apps/mcp/src/index.ts").decode()
changed=source_text.replace("verified: true as const,","verified: true as const, sessionId: 'callback-output-only',",1)
assert changed!=source_text
new_syntax=syntax_module.scan(changed,blob("apps/mcp/src/coordination-product.ts").decode())
assert new_syntax["tool:verify_connection"]["inputFields"]==syntax["tool:verify_connection"]["inputFields"] and new_syntax["tool:verify_connection"]["sdkMethods"]==syntax["tool:verify_connection"]["sdkMethods"]
evaluation.validate_binding(verify,new_syntax["tool:verify_connection"])
for f in source["files"]:
 b=blob(f["path"]);assert (len(b),digest(b))==(f["gitBlob"]["bytes"],f["gitBlob"]["sha256"])
 assert f["gitBlob"]["head"]==MAIN
 wpath=ROOT/f["path"]
 if f["worktree"]:
  w=wpath.read_bytes();assert (len(w),digest(w))==(f["worktree"]["bytes"],f["worktree"]["sha256"])
  assert f["mappingToHistoricalBase"] in ["字节相同","仅CRLF/LF转换"],f["path"]
 else:assert not wpath.exists()
assert not source_by_path["OPENAPI.yaml"]["mainEqualsHistoricalBase"]
for p in ["packages/contracts/src/route-policy.ts","apps/mcp/src/index.ts","packages/agent-sdk/src/index.ts","apps/agent-runner/src/workmesh-tools.ts"]:
 assert source_by_path[p]["mainEqualsHistoricalBase"],p
byte_report=load("archive-byte-manifest.json")
assert byte_report["planDocId"]==meta["currentDocId"]
for row in byte_report["files"]:
 w=(ROOT/row["path"]).read_bytes();staged=git(["show",":"+row["path"]])
 assert w==staged and digest(w)==row["worktreeSha256"]==row["gitBlobSha256"]
 assert row["gitObjectId"]==git(["rev-parse",":"+row["path"]]).decode().strip()
assert (D/"archive-byte-manifest.json").read_bytes()==git(["show",":docs/plan/agent-mcp-m0/archive-byte-manifest.json"])
filters=byid["listRepositories"]["openApiContract"]["parameters"];assert {"teamId","availableOnly"}<={x.get("name") for x in filters}
compat=(D/"compatibility.md").read_text(encoding="utf8")
dto=compat.split("type ApiQualifiedDiscovery = {",1)[1].split("OperationRequirements来自",1)[0]
assert not any(s in dto for s in ["registered:","discoverable:","installation_target","mode:"])
ci=(D/"ci-integration.md").read_text(encoding="utf8")
for term in ["api-integration","pnpm test:conformance:integration","set -o pipefail","passWithNoTests=false","ci-logs/mcp-coverage","continue-on-error","validate-ci.mjs","finally","always"]:assert term in ci
links=0
for f in D.rglob("*"):
 if not f.is_file() or f.suffix not in [".md",".json",".mjs",".py"]:continue
 b=f.read_bytes();s=b.decode("utf8")
 if "history" not in f.parts:
  assert b"\r" not in b and not b.startswith(b"\xef\xbb\xbf"),f
  assert b.endswith(b"\n") and not b.endswith(b"\n\n"),f
  assert all(l.rstrip()==l for l in s.splitlines()),f
 if f.suffix==".json":json.loads(s)
 if f.suffix==".md" and "history" not in f.parts:
  for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)",s):
   if ":" in target or target.startswith("#"):continue
   assert (f.parent/unquote(target.split("#",1)[0])).exists(),(f,target)
   links+=1
for line in git(["status","--porcelain","--untracked-files=all"]).decode().splitlines():assert line[3:].replace("\\","/").startswith("docs/plan/agent-mcp-m0/"),line
assert all(p.startswith("docs/plan/agent-mcp-m0/") for p in git(["diff","--name-only",BASE,"HEAD"]).decode().splitlines())
print(json.dumps({"结果":"受控文档静态语义核验通过","operations":len(records),"registeredBindings":len(syntax),"allBindings":len(bindings),"auditedPreviousPending":len(pending),"existingBindingsPreviouslyPending":data["auditClosure"]["priorBoundPending"],"positivePredicatesEvaluated":positive_count,"negativePredicatesEvaluated":negative_count,"sdkCredentialConditionTruthTableCases":64,"semanticMutationsRejected":len(mutants),"callbackOutputDoesNotChangeIdentity":True,"sourceFiles":len(source["files"]),"oldFilesBytePreserved":len(history["files"]),"localLinks":links,"checkerElapsedSeconds":round(time.perf_counter()-CHECK_START,6),"完整spec":True,"全文绑定":True,"产品测试":"未运行","独审":"两项待定向复审"},ensure_ascii=False))
