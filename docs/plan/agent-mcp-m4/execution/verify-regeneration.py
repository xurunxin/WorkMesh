"""暂存预期产物后，两轮产品生成完整字节一致与零工作树差异。"""
from pathlib import Path
import hashlib,json,subprocess,time
root=Path(__file__).resolve().parents[4]
outputs=['packages/contracts/src/agent-discovery-rules.ts','packages/contracts/src/route-policy.ts','OPENAPI.yaml','docs/route-policy-matrix.md','apps/agent-runner/src/workbench-skill-manifest.ts']
inputs=['docs/plan/agent-mcp-m0/operation-decisions.json','docs/plan/agent-mcp-m1/operation-decisions.json','docs/plan/agent-mcp-m2/product-discovery-decisions.json','docs/plan/agent-mcp-m3/product-discovery-decisions.json']
def fingerprint(names):return [{'path':name,'bytes':len((raw:=(root/name).read_bytes())),'sha256':hashlib.sha256(raw).hexdigest()} for name in names]
history=fingerprint(inputs)
commands=[]
def run(args):
    start=time.perf_counter();result=subprocess.run(args,cwd=root,capture_output=True)
    commands.append({'command':args,'exitCode':result.returncode,'runtimeSeconds':time.perf_counter()-start,'stdout':result.stdout.decode('utf-8',errors='replace'),'stderr':result.stderr.decode('utf-8',errors='replace')})
    if result.returncode:raise RuntimeError('生成关口失败：'+str(args))
snapshots=[fingerprint(outputs)]
for iteration in range(2):
    run(['python','-B','scripts/generate-agent-discovery.py'])
    run(['pnpm.cmd','generate:route-policy'])
    run(['pnpm.cmd','generate:runner-skill'])
    snapshots.append(fingerprint(outputs))
    assert snapshots[0]==snapshots[-1],'重复生成产生字节差异'
    run(['git','diff','--exit-code','--',*outputs])
assert history==fingerprint(inputs),'修改历史输入'
for name in inputs:
    result=subprocess.run(['git','diff','c2b3d363c037157df13beb82799d99d07a9b7db8','--exit-code','--',name],cwd=root,capture_output=True)
    assert result.returncode==0,name
report={'outputs':snapshots,'historicalInputs':history,'historicalInputsUnchangedFromMain':True,'commands':commands,'zeroDiff':True,'claim':'仅生成一致性，产品测试另查实际回执'}
(root/'docs/plan/agent-mcp-m4/execution/generation-current.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'rounds':2,'generatedFiles':len(outputs),'zeroDiff':True,'historicalInputsPreserved':len(inputs)}))
