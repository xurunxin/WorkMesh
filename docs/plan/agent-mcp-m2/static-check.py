"""M2 规划包独立静态校验；不运行产品或假称运行。"""
from pathlib import Path
import difflib,hashlib,json,re,subprocess,zipfile
import yaml

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
MAIN="cfce77546b64c2a8d7d12949261c38e2f666d5ae"
FROZEN="c768e1e3db297d8b91b53dd68b60e723a8a40e7d"

def git(*a):return subprocess.check_output(["git",*a],cwd=ROOT)
def load(name):return json.loads((OUT/name).read_text(encoding="utf-8"))
def same(b,h):
    assert len(b)==h["bytes"],"byte长度不等"
    assert hashlib.sha256(b).hexdigest()==h["sha256"],"SHA256不等"

def main():
    counts={}
    manifest=load("source-manifest.json")
    with zipfile.ZipFile(OUT/"source-snapshot.zip") as z:
        assert z.testzip() is None
        same((OUT/"source-snapshot.zip").read_bytes(),manifest["archive"])
        members=set()
        # 一次批量读取完整不可变Git对象，避免shared refs/工具截断。
        oids=list(dict.fromkeys(x["blobId"] for x in manifest["entries"]))
        raw= subprocess.check_output(["git","cat-file","--batch"],input=("\n".join(oids)+"\n").encode(),cwd=ROOT)
        blobs={}
        at=0
        for oid in oids:
            end=raw.index(b"\n",at);header=raw[at:end].decode().split()
            assert header[0]==oid and header[1]=="blob",header
            n=int(header[2]);at=end+1;blobs[oid]=raw[at:at+n];at+=n+1
        for e in manifest["entries"]:
            b=z.read(e["git"]["member"]);same(b,e["git"])
            assert b==blobs[e["blobId"]]
            members.add(e["git"]["member"])
            if e["worktree"]:
                wb=z.read(e["worktree"]["member"]);same(wb,e["worktree"])
                assert wb==(ROOT/e["path"]).read_bytes(),e["path"]
                members.add(e["worktree"]["member"])
        for e in manifest["commits"]:
            b=z.read(e["raw"]["member"]);same(b,e["raw"]);assert b==git("cat-file","commit",e["commit"])
            members.add(e["raw"]["member"])
        b=z.read("frozen/m2-section.md");same(b,manifest["frozenSection"])
        frozen=git("show",FROZEN+":docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md")
        assert b==frozen[frozen.index("## M2：".encode()):frozen.index("## M3：".encode())]
        assert (OUT/"frozen-m2.md").read_text(encoding="utf-8")==b.decode().rstrip("\r\n")+"\n"
        members.add("frozen/m2-section.md")
        assert members==set(z.namelist()),"ZIP有无索引member"
        counts.update(sourceEntries=len(manifest["entries"]),archiveMembers=len(members))
    frozenEntries=[x for x in manifest["entries"] if x["commit"]==FROZEN]
    assert len(frozenEntries)==7 and all(x["frozenEqualsMain"] for x in frozenEntries)
    currentPaths={x["path"] for x in manifest["entries"] if x["commit"]==MAIN}
    required=["CONTEXT.md","AGENT_PROTOCOL.md","OPENAPI.yaml","SCHEMA.sql",
      "docs/adr/0017-agent-planning-collaboration-and-budgets.md",
      "apps/api/src/live-read-authorization.ts","apps/api/src/agent/routes.ts",
      "apps/api/src/agent/commands.ts","apps/api/src/collaboration/routes.ts",
      "apps/api/src/documents.ts","apps/api/src/guidance.ts","apps/api/src/inbox/routes.ts",
      "packages/contracts/src/index.ts","packages/contracts/src/route-policy.ts",
      "packages/agent-sdk/src/index.ts","apps/mcp/src/index.ts","apps/mcp/src/coordination-product.ts",
      "apps/agent-runner/src/workmesh-tools.ts","apps/agent-runner/src/run-session.ts",
      "packages/db/src/agent-concurrency.ts","scripts/ci-policy.mjs","scripts/ci-policy.test.mjs",
      "packages/conformance/src/mcp-coverage.fixture.ts",
      "packages/conformance/src/execution-recovery.fixture.ts",
      "docs/plan/agent-mcp-m1/product-report.md",
      "docs/plan/agent-mcp-m1/product-review-repair-report.md",
      "docs/plan/agent-mcp-m1/product-queued-author-repair-report.md",
      "docs/plan/agent-mcp-m1/product-ci410-report.md"]
    # ADR编号权威，文件slug由真实Git目录确定，不猜。
    required=[p for p in required if not p.startswith("docs/adr/0017-")]
    assert any(p.startswith("docs/adr/0017-") for p in currentPaths)
    assert set(required)<=currentPaths,set(required)-currentPaths
    assert len(manifest["m1Precondition"]["reviewedProductToEvidenceDiff"])==5
    assert manifest["m1Precondition"]["mainEqualsSecondParentTree"]
    assert (OUT/"savedplan.md").read_bytes()==(OUT/"implementation.md").read_bytes()
    assert (OUT/"history/author-original-plan.md").read_bytes()==(OUT/"input/platform-injected-savedplan.md").read_bytes()
    reconstructed=(OUT/"input/platform-injected-savedplan.md").read_text(encoding="utf-8")
    for edit in load("input/plan-edits.json")["edits"]:
        assert reconstructed.count(edit["old"])==1
        reconstructed=reconstructed.replace(edit["old"],edit["new"])
    assert reconstructed==(OUT/"history/reviewed-plan.md").read_text(encoding="utf-8")
    assert (OUT/"savedplan.md").read_bytes()==(OUT/"input/platform-injected-revised-plan.md").read_bytes()
    assert (OUT/"savedplan.md").read_bytes()==(OUT/"history/author-revised-plan.md").read_bytes()
    assert (OUT/"spec.md").read_bytes()==(OUT/"input/current-platform-spec.md").read_bytes()
    provenance=load("input/provenance.json")
    assert provenance["originalPlan"]["docId"]=="5XFjpFz5JO_Sf6_WBAZD6"
    assert provenance["originalPlan"]["toolVisiblePrefixMatchedCharacters"]>0
    assert not provenance["originalPlan"]["platformFullReadbackObtained"]
    assert not provenance["implementation"]["separatePlatformOriginalObtained"]
    current=provenance["savedCopyAfterEdits"]
    assert current["docId"]=="prvLepVgLTOEbRNt56WSU"
    assert current["toolVisiblePrefixMatchedCharacters"]>0
    assert not current["platformFullReadbackObtained"]
    same((OUT/"savedplan.md").read_bytes(),current["fullText"])
    assert provenance["budgetAuthorization"]["questionDocId"]=="q-ka2GipEunxQuHuFYGap2C"
    assert provenance["originalReview"]["blocking"]==3
    old=load("history/reviewed-candidate-manifest.json")
    same((OUT/"history/reviewed-candidate.zip").read_bytes(),old["archive"])
    with zipfile.ZipFile(OUT/"history/reviewed-candidate.zip") as z:
        assert z.testzip() is None
        assert len(old["entries"])==52
        rawCommit=z.read(old["rawCommit"]["member"])
        same(rawCommit,old["rawCommit"])
        assert rawCommit==git("cat-file","commit",old["commit"])
        oldOids=[e["blobId"] for e in old["entries"]]
        batch=subprocess.check_output(["git","cat-file","--batch"],input=("\n".join(oldOids)+"\n").encode(),cwd=ROOT)
        offset=0
        for e in old["entries"]:
            end=batch.index(b"\n",offset);oid,kind,n=batch[offset:end].decode().split()
            assert oid==e["blobId"] and kind=="blob"
            offset=end+1;actual=batch[offset:offset+int(n)];offset+=int(n)+1
            archived=z.read(e["member"]);same(archived,e);assert archived==actual
    counts["reviewedCandidateOriginals"]=52
    delta=load("history/reviewed-to-current-plan-manifest.json")
    same((OUT/delta["archive"]["path"]).read_bytes(),delta["archive"])
    before=(OUT/"history/reviewed-plan.md").read_text(encoding="utf-8")
    after=(OUT/"savedplan.md").read_text(encoding="utf-8")
    expected="".join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),
        fromfile="5356/savedplan.md",tofile="platform/savedplan.md")).encode("utf-8")
    with zipfile.ZipFile(OUT/delta["archive"]["path"]) as z:
        assert z.testzip() is None and z.namelist()==["plan.diff"]
        raw=z.read("plan.diff");same(raw,delta["original"]);assert raw==expected
    readable=("\n".join(line.rstrip() for line in raw.decode("utf-8").splitlines()).rstrip()+"\n").encode("utf-8")
    same(readable,delta["readable"])
    assert readable==(OUT/"history/reviewed-to-current-plan.diff").read_bytes()
    assert (OUT/"input/chief-feedback.md").is_file()
    assert "提交规划工件（推荐）" in json.dumps(provenance,ensure_ascii=False)
    counts["visiblePrefixCharacters"]=provenance["originalPlan"]["toolVisiblePrefixMatchedCharacters"]
    counts["currentPlanVisiblePrefixCharacters"]=current["toolVisiblePrefixMatchedCharacters"]
    operations=load("operation-decisions.json")
    assert operations["notFoundIdentifiers"]==[]
    api=yaml.safe_load((ROOT/"OPENAPI.yaml").read_text(encoding="utf-8"))
    catalog={v["operationId"]:(m.upper(),p) for p,ms in api["paths"].items() for m,v in ms.items()
      if isinstance(v,dict) and "operationId" in v}
    ids=[o["operationId"] for o in operations["operations"]];assert len(ids)==len(set(ids))
    schemas=set(re.findall(r"export const (\w+)\s*=",(ROOT/"packages/contracts/src/index.ts").read_text(encoding="utf-8")))
    for o in operations["operations"]:
        if o["operationId"]!="listAgentSessionChildren":
            assert catalog[o["operationId"]]==(o["rest"]["method"],o["rest"]["path"])
        else:assert o["sdk"]["name"]=="listChildSessions"
        for k in ["contracts","sdk","mcp","runner","policy","credentialsAndScope","pagination","decision","tests"]:
            assert o[k],(o["operationId"],k)
        assert set(o.get("namedSchemas",[]))<=schemas
        assert o["futureProductTestStatus"]=="未运行"
        if o["operationId"] in ("createChildAgentSession","createReviewDelegation"):
            assert "childAgentSessionResponseSchema" in o["contracts"]
            assert len(o["preserveResponseFields"])==5
            assert o["budgetContract"]["automaticRelease"] is False
            assert o["budgetContract"]["autoResizeToRemaining"] is False
            assert "body.budget" in o["budgetContract"]["effective"]
    must={"createChildAgentSession","createReviewDelegation","listAgentSessionChildren",
       "listWorkItemComments","listProjectMilestones","listWorkItemRelations","listDocumentHistory",
       "getDocumentRevision","diffDocumentRevisions","restoreDocumentRevision","exportDocumentMarkdown",
       "getWorkspaceGuidance","getTeamGuidance","getProjectGuidance",
       "createWorkItemDecision","createProjectDecision","createSessionDecision","getDecision",
       "listInbox","getInboxItem","claimInboxItem","acknowledgeInboxItem","replyInboxItem",
       "listHandoffs","offerHandoff","inspectExactTargetHandoff","requestHandoff","rejectHandoff",
       "getWorkRoom","postWorkRoomMessage"}
    assert must<=set(ids),must-set(ids)
    for o in operations["operations"]:
        if o["operationId"] in ("createComment","updateComment","getWorkRoomTimeline","acceptHandoff","cancelHandoff","completeHandoff","finalizeDecision"):
            assert "Human" in o["decision"]
    counts["operationRows"]=len(ids)
    accept=load("acceptance-matrix.json")
    rows=[l for l in (OUT/"frozen-m2.md").read_text(encoding="utf-8").splitlines()
          if l.startswith("| ") and not l.startswith(("| 验收类","| ---"))]
    assert len(rows)==18
    assert [x["frozenRawLine"] for x in accept["cases"]]==rows
    assert all(x["status"]=="未来未运行" and x["actualExit"] is None for x in accept["cases"])
    assert len(accept["requiredChildNonCompletedStates"])==12
    counts["frozenAcceptanceRows"]=18
    proposal=yaml.safe_load((OUT/"openapi-proposal.yaml").read_text(encoding="utf-8"))
    get=proposal["paths"]["/api/v1/agent-sessions/{id}/children"]["get"]
    assert get["operationId"]=="listAgentSessionChildren" and get["security"]==[{"AgentSessionToken":[]}]
    assert proposal["components"]["schemas"]["ChildSessionStatus"]["additionalProperties"] is False
    assert len(proposal["components"]["schemas"]["ChildSessionStatus"]["properties"])==8
    assert proposal["components"]["schemas"]["ChildSessionStatus"]["properties"]["resultArtifactIds"]["maxItems"]==100
    reviewInput=proposal["components"]["schemas"]["ReviewDelegationInput"]
    assert "budget" in reviewInput["properties"] and "budget" not in reviewInput["required"]
    child=proposal["components"]["schemas"]["ChildAgentSession"]["allOf"][1]
    requiredFields={"parent_session_id","plan_step_version_id","required_for_parent","inherited_budget","max_child_sessions"}
    assert requiredFields<=set(child["required"]) and child["additionalProperties"] is True
    assert proposal["components"]["schemas"]["ReviewDelegationResponse"]["additionalProperties"] is True
    dto=(OUT/"dto-proposal.ts").read_text(encoding="utf-8")
    assert "budget: childBudgetInputSchema.optional()" in dto
    assert "z.record(z.number().finite().nonnegative())" in dto
    assert "agentSessionResponseSchema.extend({" in dto
    assert all(f+":" in dto for f in requiredFields)
    assert "inherited_budget: childBudgetInputSchema" in dto and "budget: childBudgetInputSchema" in dto
    assert "lease: leaseResponseSchema," in dto and "leaseResponseSchema.passthrough()" not in dto
    # 解析草案ref必须能在当前合同＋增量合同中找到，不当现行已注册。
    import copy
    merged=copy.deepcopy(api)
    merged["components"]["schemas"].update(proposal["components"]["schemas"])
    def refs(node):
        if isinstance(node,dict):
            for k,v in node.items():
                if k=="$ref":
                    assert v.startswith("#/"),v
                    resolved=merged
                    for token in v[2:].split("/"):resolved=resolved[token]
                else:refs(v)
        elif isinstance(node,list):
            for v in node:refs(v)
    refs(proposal)
    artifacts=load("artifact-manifest.json")
    for e in artifacts["entries"]:same((ROOT/e["path"]).read_bytes(),e)
    counts["sealedFiles"]=len(artifacts["entries"])
    for script in OUT.glob("*.py"):compile(script.read_text(encoding="utf-8"),str(script),"exec")
    changed=git("diff","--name-only",MAIN).decode().splitlines()
    untracked=git("ls-files","--others","--exclude-standard").decode().splitlines()
    assert all(p.startswith("docs/plan/agent-mcp-m2/") or p=="docs/adr/0082-parent-child-status-projection.md" for p in changed+untracked),changed+untracked
    check=subprocess.run(["git","diff","--check",MAIN],cwd=ROOT,capture_output=True)
    assert check.returncode==0,check.stdout.decode(errors="replace")+check.stderr.decode(errors="replace")
    links=0
    for file in [*OUT.rglob("*.md"),ROOT/"docs/adr/0082-parent-child-status-projection.md"]:
        text=file.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)",text):
            if ":" in target or target.startswith("#"):continue
            path=target.split("#")[0]
            if path:
                assert (file.parent/path).resolve().exists(),(str(file),target)
                links+=1
    counts["localMarkdownLinks"]=links
    counts["productRuntimeTests"]=0
    print(json.dumps({"status":"passed","counts":counts,
      "limitation":"静态源/文本/路径/DTO核对；不证明SQL、runtime授权、产品测试、RequiredCI或独审"},ensure_ascii=False))

if __name__=="__main__":main()
