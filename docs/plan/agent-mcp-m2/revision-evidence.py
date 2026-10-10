"""保全旧候选、平台注入与原审查；仅改M2规划工件。"""
from pathlib import Path
import difflib,hashlib,json,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
BASE="5356b0619bffe3130a377f68e38a2a89931962a1"
def git(*a):return subprocess.check_output(["git",*a],cwd=ROOT)
def h(b):return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()}
def write(p,data):
    (OUT/p).write_text(data if isinstance(data,str) else json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
def text(path):
    data=json.loads((OUT/path).read_text(encoding="utf-8"))
    if data.get("status")=="fulfilled":data=data["value"]
    return "\n".join(x.get("text","") for x in data.get("content",[]) if x["type"]=="text")
def preserve_diff():
    before=(OUT/"history/reviewed-plan.md").read_text(encoding="utf-8")
    after=(OUT/"input/platform-injected-revised-plan.md").read_text(encoding="utf-8")
    raw="".join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),
        fromfile="5356/savedplan.md",tofile="platform/savedplan.md")).encode("utf-8")
    archive=OUT/"history/reviewed-to-current-plan-original.zip"
    if archive.exists():
        with zipfile.ZipFile(archive) as z:assert z.read("plan.diff")==raw
    else:
        with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED) as z:
            info=zipfile.ZipInfo("plan.diff",(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,raw)
    # 原始unified diff的空白context行触发diff --check；原件在ZIP，可读副本仅去行尾空白。
    readable="\n".join(line.rstrip() for line in raw.decode("utf-8").splitlines()).rstrip()+"\n"
    write("history/reviewed-to-current-plan.diff",readable)
    write("history/reviewed-to-current-plan-manifest.json",{
        "archive":{"path":str(archive.relative_to(OUT)).replace("\\","/"),**h(archive.read_bytes())},
        "original":{"member":"plan.diff",**h(raw)},"readable":h(readable.encode("utf-8")),
        "meaning":"ZIP为完整原始差异；.diff为去行尾空白的阅读副本，不作为原始patch。首败static-run-007保留。"})
def preserve():
    paths=git("diff-tree","--no-commit-id","--name-only","-r",BASE).decode().splitlines()
    assert len(paths)==52
    entries=[]
    archive=OUT/"history/reviewed-candidate.zip"
    with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            b=git("show",BASE+":"+p)
            info=zipfile.ZipInfo(p,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,b)
            entries.append({"commit":BASE,"path":p,"blobId":git("rev-parse",BASE+":"+p).decode().strip(),"member":p,**h(b)})
        raw=git("cat-file","commit",BASE)
        info=zipfile.ZipInfo("git/commit",(1980,1,1,0,0,0));z.writestr(info,raw)
    write("history/reviewed-candidate-manifest.json",{"commit":BASE,"tree":git("rev-parse",BASE+"^{tree}").decode().strip(),
        "parents":git("show","-s","--format=%P",BASE).decode().strip().split(),
        "entries":entries,"archive":h(archive.read_bytes()),"rawCommit":{"member":"git/commit",**h(raw)},
        "meaning":"52原候选完整Git blob，包括首败回执/原plan/source ZIP；不冒当时工作树/未保存中间字节"})
    # 旧文件来自准确Git对象，另保全文便于独审。
    for src,dst in [("savedplan.md","history/reviewed-plan.md"),("input/provenance.json","history/reviewed-provenance.json"),
                    ("input/stage-receipt.json","history/reviewed-stage-receipt.json"),
                    ("planning-report.md","history/reviewed-planning-report.md")]:
        (OUT/dst).write_bytes(git("show",BASE+":docs/plan/agent-mcp-m2/"+src))
    conv=text("input/revision-conversation-readback.json")
    marker="(assistant/plan_review/"
    a=conv.index(marker);start=conv.rfind("\n[",0,a)+1;end=conv.index("\n[",a)
    write("input/original-review.md",conv[start:end].rstrip()+"\n")
    a=conv.rfind("(user/plan_revision)");start=conv.rfind("\n[",0,a)+1
    end=conv.index("\n--- In-flight",a)
    write("input/current-chief-feedback.md",conv[start:end].rstrip()+"\n")
    plan=(OUT/"input/platform-injected-revised-plan.md").read_bytes()
    (OUT/"history/author-revised-plan.md").write_bytes(plan)
    (OUT/"savedplan.md").write_bytes(plan);(OUT/"implementation.md").write_bytes(plan)
    (OUT/"spec.md").write_bytes((OUT/"input/current-platform-spec.md").read_bytes())
    preserve_diff()
def current_provenance():
    original=json.loads((OUT/"history/reviewed-provenance.json").read_text(encoding="utf-8"))
    plan=(OUT/"input/platform-injected-revised-plan.md").read_bytes()
    todo=text("input/revision-todo-readback.json")
    visible=todo[todo.index("Saved plan"):];visible=visible[visible.index("## 上下文与假设"):]
    matched=0
    for x,y in zip(plan.decode(),visible):
        if x!=y:break
        matched+=1
    original.update({
      "historicalProvenance":"history/reviewed-provenance.json原件保全；originalPlan键只描述首轮原件",
      "savedCopyAfterEdits":{"files":["savedplan.md","implementation.md"],
        "source":"本轮用户消息authoritative saved copy完整注入，并核本轮todos可见前缀",
        "docId":"prvLepVgLTOEbRNt56WSU","fullText":h(plan),"platformVersion":None,
        "platformCreatedAt":None,"platformFullReadbackObtained":False,
        "toolVisiblePrefixMatchedCharacters":matched,
        "input":"input/platform-injected-revised-plan.md","author":"history/author-revised-plan.md",
        "difference":"history/reviewed-to-current-plan.diff",
        "differenceOriginal":"history/reviewed-to-current-plan-manifest.json",
        "independentImplementationOriginal":False},
      "budgetAuthorization":{"questionDocId":"q-ka2GipEunxQuHuFYGap2C",
        "answer":"允许显式缩减预算（推荐）","source":["input/current-platform-spec.md","input/revision-conversation-readback.json"],
        "scope":"ReviewDelegationInput可选budget合同、有效执行/预留同值；不释放旧预留"},
      "writeAuthorization":{"questionDocId":"q-cKVakWbsPo380TgcEY7Ng","answer":"提交规划工件（推荐）",
        "source":["input/current-platform-spec.md","input/current-chief-feedback.md"],
        "persistsAcrossPlanningRevisions":True,"productImplementationAuthorizedThisTurn":False,
        "resolution":"本轮明确允许修改并提交受控规划文件，覆盖模板Do not modify any files yet"},
      "originalReview":{"reviewedHead":BASE,"file":"input/original-review.md",
        "rawContainer":"input/revision-conversation-readback.json","blocking":3,
        "status":"原审查未关闭；本轮修订等待_oY复审，不自称审核通过"},
      "implementation":{"separatePlatformOriginalObtained":False,"docId":None,
        "source":"implementation.md为本轮savedplan仓库byte-equal执行副本",
        "limitation":"独立platform implementation注入原件未取得"},
      "currentSpec":{"file":"spec.md","source":"todos Spec完整段，工具在Saved plan段截断，原返回分别保存",
        "input":"input/current-platform-spec.md","hash":h((OUT/"spec.md").read_bytes())},
      "currentChiefFeedback":{"file":"input/current-chief-feedback.md","source":"原conversation可见原件，不冒独审裁定"}
    })
    write("input/provenance.json",original)
    m=json.loads((OUT/"source-manifest.json").read_text(encoding="utf-8"))
    m["planningRevision"]={"base":BASE,"sourceMainUnchanged":True,
       "mainObserved":"input/revision-main-observation.json",
       "currentSpec":"input/current-platform-spec.md","currentPlan":"input/platform-injected-revised-plan.md",
       "reviewedCandidate":"history/reviewed-candidate-manifest.json",
       "productSourceNote":"877来源原对象和source ZIP保持原字节；本轮static重新逐项核工作树，非用旧checks代新组合"}
    write("source-manifest.json",m)
if __name__=="__main__":
    if not (OUT/"history/reviewed-candidate-manifest.json").exists():preserve()
    preserve_diff()
    current_provenance()
    print(json.dumps({"reviewedHead":BASE,"currentPlanDoc":"prvLepVgLTOEbRNt56WSU",
                     "status":"旧候选/原审查/平台全文保全，待本轮独立静态核验"},ensure_ascii=False))
