"""仅检查受控文档、历史、源码定位与Git字节；不访问产品服务或修改文件。"""
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote
import yaml

directory = Path(__file__).resolve().parent
root = directory.parents[2]
load = lambda name: json.loads((directory/name).read_text(encoding="utf8"))
digest = lambda b: hashlib.sha256(b).hexdigest()
git = lambda args, cwd=root: subprocess.check_output(["git",*args],cwd=cwd)
meta=load("archive-metadata.json"); obs=load("platform-observation-current.json")
source=load("source-manifest.json"); generation=load("generation.json")
decisions=load("operation-decisions.json"); records=decisions["operations"]
base=meta["sourceHead"]; original=meta["originalArchiveHead"]
assert meta["currentDocId"]=="WS-FdgmfTwloZE8hNXvAb"
assert meta["currentVersion"] is None and meta["platformDocCreatedAt"] is None
assert meta["editPlanCalled"] is False and meta["newPlanCreated"] is False
assert meta["productImplemented"] is False and meta["productChecksRun"] is False
head=git(["rev-parse","HEAD"]).decode().strip()
assert all(p.startswith("docs/plan/agent-mcp-m0/") for p in git(["diff","--name-only",base,head]).decode().splitlines())
plan=(directory/"savedplan.md").read_bytes()
assert plan==(directory/"implementation.md").read_bytes()
todo="\n".join(b["text"] for b in obs["todos"]["content"] if b["type"]=="text")
assert "\nSaved plan:\n" in todo
prefix=todo.split("\nSaved plan:\n",1)[1].split("\n…(truncated)",1)[0].rstrip()
assert prefix and plan.decode().startswith(prefix), "当前注入正文与工具可见前缀不一致"
spec=todo.split("\nSpec:\n",1)[1].split("\nSaved plan:\n",1)[0].rstrip()+"\n"
assert (directory/"spec.md").read_text(encoding="utf8")==spec
chat="\n".join(b["text"] for b in obs["conversation"]["content"] if b["type"]=="text")
assert "[plan](doc:"+meta["currentDocId"]+")" in chat and "A: 允许仅文档落盘（推荐）" in chat
assert meta["observedMainHead"]+"\trefs/heads/main" in obs["main"]["content"][0]["text"]
for f in generation["planFiles"]:
 b=(directory/f["path"]).read_bytes();assert len(b)==f["bytes"] and digest(b)==f["sha256"]
originalPlan=git(["show",original+":docs/plan/agent-mcp-m0/savedplan.md"])
assert (directory/"history/original-savedplan.md").read_bytes()==originalPlan and originalPlan!=plan
for row in load("history/original-manifest.json")["files"]:
 b=git(["show",original+":"+row["path"]]);assert len(b)==row["bytes"] and digest(b)==row["sha256"]
 backup=directory/"history"/("original-"+Path(row["path"]).name)
 if backup.exists():assert backup.read_bytes()==b
originalFailure=git(["show",original+":docs/plan/agent-mcp-m0/first-byte-check-failure.md"])
assert (directory/"first-byte-check-failure.md").read_bytes()==originalFailure
api=yaml.safe_load((root/"OPENAPI.yaml").read_text(encoding="utf8"))
operations={v["operationId"]:(m.upper(),p) for p,d in api["paths"].items() for m,v in d.items() if m in ["get","post","put","patch","delete"] and "operationId" in v}
assert len(records)==len({r["operationId"] for r in records})
assert set(operations)=={r["operationId"] for r in records}
index_ids=re.findall(r"^\| `([^`]+)`<br>",(directory/"operation-index.md").read_text(encoding="utf8"),re.M)
assert len(index_ids)==len(set(index_ids)) and set(index_ids)==set(operations)
byid={r["operationId"]:r for r in records}
source_by_path={f["path"]:f for f in source["files"]}
for r in records:
 assert operations[r["operationId"]]==(r["rest"]["method"],r["rest"]["path"])
 assert r["openApiContract"]["responses"] and r["negativeTests"] and r["sourceEvidence"]
 assert isinstance(r["agentDiscoveryDecision"]["C"],dict) and isinstance(r["agentDiscoveryDecision"]["E"],dict)
 assert set(r["applicability"])==set(r["acceptanceCases"])
 q=r["qualifications"]
 assert q["credentialModes"] and q["states"]["source"] and "domainAudit" in q
 assert isinstance(q["delegationRoles"]["allowed"],list) and isinstance(r["variants"],list)
 for e in r["sourceEvidence"]:
  lines=(root/e["path"]).read_text(encoding="utf8").splitlines()
  assert e["line"]>0 and e["anchor"] in lines[e["line"]-1], ("无效定位",r["operationId"],e)
  assert e["gitObjectId"]==source_by_path[e["path"]]["gitBlob"]["objectId"]
 for t in r["negativeTests"]:
  assert t["executionStatus"]=="待产品测试" and t["expect"]["status"]=="blocked"
 if q["domainAudit"].startswith("未核实"):
  for actor in ["C","E"]:
   outcome=r["agentDiscoveryDecision"][actor]
   assert outcome["status"]=="blocked", (r["operationId"],actor)
  assert any(t["expect"]["reason"]=="DOMAIN_DIFFERENCE_PENDING" for t in r["negativeTests"])
assert byid["getCurrentAgentConnectionIdentity"]["agentDiscoveryDecision"]["E"]["reasons"]==["CREDENTIAL_MODE_MISMATCH"]
assert "reviewer" in byid["publishAgentPlan"]["qualifications"]["delegationRoles"]["denied"]
assert byid["publishAgentPlan"]["negativeTests"][1]["expect"]["reason"]=="ROLE_REQUIRED"
bindings={b["bindingId"]:b for b in decisions["bindingDecisions"]}
prepare=bindings["tool:prepare_project_import"]
assert prepare["current"]["operationIds"]==["listProjects"]
assert prepare["proposed"]["execution"]=="adapter_internal" and prepare["proposed"]["operationIds"]==[]
assert not any(b["bindingId"]=="tool:prepare_project_import" for b in byid["listProjects"]["proposedMcpBindings"])
assert decisions["compositeBindings"]["verify_connection"]==["getAgentCapabilityManifest","getCurrentAgentConnectionIdentity","listTeams"]
assert set(decisions["compositeBindings"]["apply_project_import"])=={"listTeams","listWorkflowStates","createProject","createProjectMilestone","createWorkItem","createWorkItemRelation"}
for b in decisions["bindingDecisions"]:
 for op in b["proposed"]["operationIds"]:assert op in byid
 if b["proposed"].get("unspecifiedTarget"):
  assert b["proposed"]["unspecifiedTarget"]["status"]=="requires_target_check"
  assert b["proposed"]["unspecifiedTarget"]["countedInAllowedOperations"] is False
provider=next(v for v in byid["requestProviderAction"]["variants"] if v["variant"]=="open_pull_request")
assert provider["capabilitiesAll"]==["repo:write_branch","repo:open_pr"]
for e in source["files"]:
 b=git(["show",base+":"+e["path"]]);w=(root/e["path"]).read_bytes()
 assert (len(b),digest(b))==(e["gitBlob"]["bytes"],e["gitBlob"]["sha256"])
 assert (len(w),digest(w))==(e["worktree"]["bytes"],e["worktree"]["sha256"])
 assert e["mapping"] in ["字节相同","仅CRLF/LF转换"]
cache=Path("C:/Users/xurx/.tds/workspaces/DzkLDn6UW-IbfoTJzN9Ro/repo")
for e in source["files"]:
 b=git(["show",meta["observedMainHead"]+":"+e["path"]],cache)
 assert (len(b),digest(b))==(e["currentMain"]["bytes"],e["currentMain"]["sha256"])
assert source_by_path["OPENAPI.yaml"]["currentMain"]["equalsBase"]
assert source_by_path["packages/contracts/src/route-policy.ts"]["currentMain"]["equalsBase"]
compat=(directory/"compatibility.md").read_text(encoding="utf8")
apiDto=compat.split("type ApiQualifiedDiscovery = {",1)[1].split("OperationRequirements来自",1)[0]
assert not any(s in apiDto for s in ["registered:","discoverable:","installation_target","mode:"])
for term in ["session: null","delegation: null","manifest: null","同一Token","allowedOperations"]:
 assert term in compat
ci=(directory/"ci-integration.md").read_text(encoding="utf8")
for term in ["api-integration","pnpm test:conformance:integration","set -o pipefail","passWithNoTests=false","ci-logs/mcp-coverage","continue-on-error","validate-ci.mjs","finally","always"]:
 assert term in ci
links=0
for file in directory.rglob("*"):
 if not file.is_file() or file.suffix not in [".md",".json",".mjs",".py"]:continue
 b=file.read_bytes();text=b.decode("utf8")
 assert b"\r" not in b and not b.startswith(b"\xef\xbb\xbf"),file
 assert b.endswith(b"\n") and not b.endswith(b"\n\n"),file
 assert all(line.rstrip()==line for line in text.splitlines()),file
 if file.suffix==".json":json.loads(text)
 if file.suffix==".md" and "history" not in file.parts:
  for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)",text):
   if ":" in target or target.startswith("#"):continue
   assert (file.parent/unquote(target.split("#",1)[0])).exists(), (file,target)
   links+=1
for line in git(["status","--porcelain","--untracked-files=all"]).decode().splitlines():
 assert line[3:].replace("\\","/").startswith("docs/plan/agent-mcp-m0/"),line
print(json.dumps({"结果":"文档静态核验通过","operationCount":len(records),"bindings":len(bindings),"sourceFiles":len(source["files"]),"localLinks":links,"完整spec":True,"保存正文前缀":True,"原历史":True,"四项修订映射":True,"产品测试":"未运行","独审":"待定向复审"},ensure_ascii=False))
