"""记录实际静态命令/native exit/runtime/原输出；绝不运行产品检查。"""
from pathlib import Path
import hashlib,json,os,subprocess,time,zipfile,sys
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
def sha(b):return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()}
paths=[str(p.relative_to(ROOT)).replace("\\","/") for p in OUT.rglob("*") if p.is_file()]
paths+=["docs/adr/0082-parent-child-status-projection.md"]
node="""import {classifyChanges,readWorkspaces} from './scripts/ci-policy.mjs';
let s='';for await (const c of process.stdin)s+=c;
console.log(JSON.stringify({node:process.version,execPath:process.execPath,
classification:classifyChanges(JSON.parse(s),readWorkspaces())}));"""
cmds=[
 (["python","docs/plan/agent-mcp-m2/generate-evidence.py","--matrix-only"],None),
 (["python","docs/plan/agent-mcp-m2/static-check.py"],None),
 (["git","diff","--check","cfce77546b64c2a8d7d12949261c38e2f666d5ae"],None),
 (["node","--input-type=module","-e",node],json.dumps(paths).encode())
]
old=list((OUT/"input").glob("static-run-*.json"))
i=max([int(p.stem.rsplit("-",1)[1]) for p in old]+[0])+1
records=[];raws={}
for n,(cmd,inp) in enumerate(cmds,1):
    measured=[*OUT.glob("*.py"),OUT/"dto-proposal.ts",OUT/"openapi-proposal.yaml",
              OUT/"savedplan.md",OUT/"implementation.md",ROOT/"scripts/ci-policy.mjs",ROOT/"scripts/ci-policy.test.mjs"]
    before={str(q.relative_to(ROOT)).replace("\\","/"):sha(q.read_bytes()) for q in measured}
    start=time.time()
    childEnv={**os.environ,"PYTHONIOENCODING":"utf-8"}
    p=subprocess.run(cmd,input=inp,cwd=ROOT,capture_output=True,env=childEnv)
    end=time.time()
    after={str(q.relative_to(ROOT)).replace("\\","/"):sha(q.read_bytes()) for q in measured}
    for kind,data in [("stdout",p.stdout),("stderr",p.stderr)]:raws[f"command-{n}.{kind}"]=data
    records.append({"argv":cmd,"cwd":str(ROOT),"nativeExit":p.returncode,
       "outputEncoding":"UTF-8（本轮Python子进程显式PYTHONIOENCODING，不改系统）",
       "pythonRuntime":{"version":sys.version,"execPath":sys.executable},
       "startedUnix":start,"endedUnix":end,"runtimeSeconds":end-start,
       "stdout":{"member":f"command-{n}.stdout",**sha(p.stdout)},
       "stderr":{"member":f"command-{n}.stderr",**sha(p.stderr)},
       "displayStdout":p.stdout.decode("utf-8",errors="replace"),
       "displayStderr":p.stderr.decode("utf-8",errors="replace"),
       "sourceBefore":before,"sourceAfter":after,"sourceUnchanged":before==after,
       "testCounts":None,"skip":None,"status":"passed" if p.returncode==0 else "failed"})
archive=f"input/static-run-{i:03d}-originals.zip"
with zipfile.ZipFile(OUT/archive,"w",compression=zipfile.ZIP_DEFLATED) as z:
    for name,b in raws.items():
        info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,b)
run={"kind":"规划静态实跑","sequence":i,"commands":records,
     "archive":{"path":archive,**sha((OUT/archive).read_bytes())},
     "futureProductTests":"全部未运行","firstFailureRetained":"input/planning-first-failures.json及不可覆盖static-run-*"}
text=json.dumps(run,ensure_ascii=False,indent=2)+"\n"
(OUT/f"input/static-run-{i:03d}.json").write_text(text,encoding="utf-8",newline="\n")
(OUT/"static-checks.json").write_text(text,encoding="utf-8",newline="\n")
print(json.dumps({"staticRun":i,"exits":[x["nativeExit"] for x in records]},ensure_ascii=False))
sys.exit(0 if all(x["nativeExit"]==0 for x in records) else 1)
