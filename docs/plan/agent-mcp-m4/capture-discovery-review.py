"""完整只读消费审查涉及的Git来源；只写规划元数据，不调用产品生成器。"""
from pathlib import Path
import hashlib,json,re,subprocess,time
from datetime import datetime,timezone

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
MAIN='c2b3d363c037157df13beb82799d99d07a9b7db8'
OLD='4e144f35759525a8a377acc73ba2f2dbfe02ab67'
TARGET=OUT/'input/discovery-review'
TARGET.mkdir(exist_ok=True)
start=time.perf_counter()
start_utc=datetime.now(timezone.utc).isoformat()
def git(*args):
    return subprocess.run(['git',*args],cwd=ROOT,capture_output=True,check=True).stdout
def sha(raw): return hashlib.sha256(raw).hexdigest()
def write(name,data):
    (TARGET/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
paths=[
 'scripts/generate-agent-discovery.py','scripts/generate-route-policy-artifacts.mts',
 'scripts/generate-runner-skill-manifest.mjs','scripts/run-ci-source.mjs',
 'packages/contracts/src/agent-discovery.ts','packages/contracts/src/agent-discovery-rules.ts',
 'packages/contracts/src/agent-discovery.test.ts','packages/contracts/src/route-policy.ts',
 'apps/mcp/src/discovery.ts','apps/mcp/src/index.ts',
 'docs/plan/agent-mcp-m0/operation-decisions.json','docs/plan/agent-mcp-m1/operation-decisions.json',
 'docs/plan/agent-mcp-m2/product-discovery-decisions.json',
 'docs/plan/agent-mcp-m3/product-discovery-decisions.json',
]
records=[]
texts={}
for path in paths:
    blob=git('rev-parse',f'{MAIN}:{path}').decode().strip()
    raw=git('cat-file','blob',blob)
    texts[path]=raw.decode('utf-8')
    working=(ROOT/path).read_bytes()
    records.append({'commit':MAIN,'path':path,'gitBlob':blob,'gitBytes':len(raw),
                    'gitSha256':sha(raw),'completeBlobRead':True,
                    'worktreeBytes':len(working),'worktreeSha256':sha(working),
                    'byteMapping':'identity' if working==raw else 'LF_to_CRLF' if working==raw.replace(b'\n',b'\r\n') else 'different'})
write('source-manifest.json',{'main':MAIN,'reviewedCandidate':OLD,'records':records,
                            'productGeneratorsExecuted':False,'productTestsExecuted':False})
rules=[];bindings=[]
for line in texts['packages/contracts/src/agent-discovery-rules.ts'].splitlines():
    text=line.strip().removesuffix(',')
    if text.startswith('{"operationId":'): rules.append(json.loads(text))
    if text.startswith('{"bindingId":'): bindings.append(json.loads(text))
policy=texts['packages/contracts/src/route-policy.ts']
section=policy.split('const mcpOperationIds = {',1)[1].split('} as const',1)[0]
mappings=dict(re.findall(r"'([^']+)': '([^']+)'",section))
m2=json.loads(texts['docs/plan/agent-mcp-m2/product-discovery-decisions.json'])
m3=json.loads(texts['docs/plan/agent-mcp-m3/product-discovery-decisions.json'])
old_registered=sorted(set(m2['registeredBindingIds'])|set(m3['registeredBindingIds']))
write('discovery-baseline.json',{'main':MAIN,'allBindings':bindings,'policyMappings':mappings,
      'historicalRegisteredBindingIds':old_registered,
      'registrationEvidence':'不可变M2/M3输入，非本轮runtime注册实测',
      'fourLegacyRules':[r for r in rules if r['operationId'] in {'getInitiativeRollup','getAutomationRun','getUsageSummary','streamA2ATaskEvents'}],
      'operationIds':[r['operationId'] for r in rules],
      'generatorIssue':'规则只合M0-M3；registered只M2/M3；四旧规则仍Human查询门禁'})
historical=json.loads(git('show',f'{OLD}:docs/plan/agent-mcp-m4/input/delivery-manifest.json'))
for record in historical['records']:
    raw=git('show',f'{OLD}:{record["path"]}')
    assert len(raw)==record['stagedBytes'] and sha(raw)==record['stagedSha256'],record['path']
for path in ['docs/plan/agent-mcp-m4/input/delivery-checks.json','docs/plan/agent-mcp-m4/input/delivery-manifest.json']:
    json.loads(git('show',f'{OLD}:{path}'))
write('source-capture-receipt.json',{'command':'python -B docs/plan/agent-mcp-m4/capture-discovery-review.py',
      'startUtc':start_utc,'endUtc':datetime.now(timezone.utc).isoformat(),
      'runtimeSeconds':time.perf_counter()-start,'exitCode':0,'completeSourceBlobs':len(records),
      'oldCandidateManifestMatches':len(historical['records']),'oldCandidateSelfReferenceJsonRead':2,
      'oldCandidateReachable':git('merge-base','--is-ancestor',OLD,'HEAD')==b'',
      'productGenerationOrTestsRun':False})
print(json.dumps({'完整新增审查来源':len(records),'旧候选全文匹配':len(historical['records']),
      '旧bindings':len(bindings),'旧policyMappings':len(mappings),'旧registry输入':len(old_registered)},ensure_ascii=False))
