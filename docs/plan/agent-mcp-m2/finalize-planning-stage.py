"""记录实际暂存字节，并只读复核提交；不运行产品测试。"""
from pathlib import Path
import hashlib,json,subprocess,sys,time

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
MAIN="cfce77546b64c2a8d7d12949261c38e2f666d5ae"
BASE="5356b0619bffe3130a377f68e38a2a89931962a1"
RECEIPT="docs/plan/agent-mcp-m2/input/stage-receipt.json"
def git(*args):return subprocess.check_output(["git",*args],cwd=ROOT)
def digest(b):return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()}
def allowed(p):return p.startswith("docs/plan/agent-mcp-m2/") or p=="docs/adr/0082-parent-child-status-projection.md"
def verify():
    receipt=json.loads((ROOT/RECEIPT).read_text(encoding="utf-8"))
    head=git("rev-parse","HEAD").decode().strip()
    assert git("rev-parse","HEAD^").decode().strip()==BASE
    expected={e["path"] for e in receipt["entries"]}|{RECEIPT}
    assert set(git("diff","--name-only",MAIN,"HEAD").decode().splitlines())==expected
    for e in receipt["entries"]:
        p=e["path"];b=git("show","HEAD:"+p)
        assert digest(b)=={k:e[k] for k in ["bytes","sha256"]},p
        assert git("rev-parse","HEAD:"+p).decode().strip()==e["blobId"],p
        assert b==(ROOT/p).read_bytes(),p
    assert git("show","HEAD:"+RECEIPT)==(ROOT/RECEIPT).read_bytes()
    assert not git("status","--porcelain"),"提交后工作树不干净"
    print(json.dumps({"head":head,"commitBlobsVerified":len(expected),"worktreeClean":True,"productTestsRun":0}))
def stage():
    assert git("rev-parse","HEAD").decode().strip()==BASE
    assert git("branch","--show-current").decode().strip()=="tds/conv-01a121fb-781b-7b58-9bca-a596b92a8cbe"
    paths=git("diff","--cached","--name-only",MAIN).decode().splitlines()
    assert paths and all(allowed(p) for p in paths)
    entries=[]
    for p in paths:
        if p==RECEIPT:continue
        b=git("show",":"+p)
        assert b==(ROOT/p).read_bytes(),p+"工作树与暂存不同"
        entries.append({"path":p,"blobId":git("rev-parse",":"+p).decode().strip(),**digest(b),"worktreeEqualsStage":True})
    argv=["git","diff","--cached","--check",MAIN]
    started=time.time();result=subprocess.run(argv,cwd=ROOT,capture_output=True);ended=time.time()
    assert result.returncode==0,result.stdout.decode(errors="replace")+result.stderr.decode(errors="replace")
    latest=json.loads((OUT/"static-checks.json").read_text(encoding="utf-8"))
    assert all(c["nativeExit"]==0 for c in latest["commands"])
    data={"kind":"本轮实际staged字节与完整范围核验","base":MAIN,"revisionBase":BASE,
        "entries":entries,"selfExcluded":RECEIPT+"避免自引用；提交后独立比对receipt blob与工作树",
        "check":{"argv":argv,"cwd":str(ROOT),"nativeExit":result.returncode,
            "runtimeSeconds":ended-started,"stdout":result.stdout.decode("utf-8"),"stderr":result.stderr.decode("utf-8")},
        "latestStaticReceipt":"input/static-run-"+str(latest["sequence"]).zfill(3)+".json",
        "oldReceiptPreserved":"history/reviewed-stage-receipt.json及旧候选ZIP",
        "productFilesChanged":False,"productTestsRun":0,"migrationsAdded":False,
        "reviewStatus":"三blocking待_oY复审；不自confirm，产品实现未开始",
        "headBinding":"最终回复给提交准确head；使用本脚本--verify-commit逐blob核对，不循环写自身head"}
    (ROOT/RECEIPT).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps({"stagedFilesExcludingReceipt":len(entries),"nativeExit":result.returncode,"productTestsRun":0}))
if __name__=="__main__":
    if sys.argv[1:]==["--verify-commit"]:verify()
    else:
        assert not sys.argv[1:]
        stage()
