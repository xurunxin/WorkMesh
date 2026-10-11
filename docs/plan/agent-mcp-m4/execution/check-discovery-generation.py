"""隔离副本验证产品生成器拒绝坏输入；不改历史输入或当前派生表。"""
from pathlib import Path
import hashlib,json,subprocess,sys
root=Path(__file__).resolve().parents[4]
target=root/'.tmp/m4-4adc5e39/discovery-negative-fixture'
if target.exists(): raise ValueError('原夹具已存在，禁止覆盖')
capture=json.loads((root/'docs/plan/agent-mcp-m4/execution/registration-capture.json').read_text(encoding='utf-8'))
paths=['scripts/generate-agent-discovery.py','OPENAPI.yaml','packages/contracts/src/agent-discovery-rules.ts','packages/contracts/src/route-policy.ts']
paths += [f'docs/plan/agent-mcp-{batch}/{name}' for batch,name in [('m0','operation-decisions.json'),('m1','operation-decisions.json'),('m2','product-discovery-decisions.json'),('m3','product-discovery-decisions.json'),('m4','product-discovery-decisions.json')]]
paths += ['docs/plan/agent-mcp-m4/execution/registration-capture.json']+[source['path'] for source in capture['sources']]
for name in paths:
    output=target/name;output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes((root/name).read_bytes())
decision=target/'docs/plan/agent-mcp-m4/product-discovery-decisions.json'
original=decision.read_bytes()
def fingerprints():
    return {name:hashlib.sha256((target/name).read_bytes()).hexdigest() for name in ['packages/contracts/src/agent-discovery-rules.ts','packages/contracts/src/route-policy.ts']}
evidence=[]
for case in ['missing-registration','unknown-operation','changed-old-binding','stale-capture']:
    data=json.loads(original)
    if case=='missing-registration':data['registeredBindingIds'].remove(data['bindings'][0]['bindingId'])
    if case=='unknown-operation':data['bindings'][0]['operationIds']=['notAnOperation']
    if case=='changed-old-binding':
        binding=next(item for item in data['bindings'] if item['bindingId']=='tool:create_project_health_update')
        binding['identityVariants']=[]
    if case=='stale-capture':
        path=target/capture['sources'][0]['path'];path.write_bytes(path.read_bytes()+b'\n')
    decision.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    before=fingerprints()
    result=subprocess.run([sys.executable,'-B',str(target/'scripts/generate-agent-discovery.py')],capture_output=True)
    assert result.returncode!=0 and before==fingerprints(),case
    evidence.append({'case':case,'exitCode':result.returncode,'derivedBytesUnchanged':True,'stdout':result.stdout.decode('utf-8',errors='replace'),'stderr':result.stderr.decode('utf-8',errors='replace')})
(root/'docs/plan/agent-mcp-m4/execution/generator-negative-results.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'negativeCases':len(evidence),'allRejectedWithoutWrites':True}))
