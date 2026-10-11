"""绑定本卡文档的实际staged bytes，两个自引用账本除外；不提交/推送。"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
excluded = ['docs/plan/agent-mcp-m4/input/delivery-manifest.json',
            'docs/plan/agent-mcp-m4/input/delivery-checks.json']
receipts = []
def run(args):
    start=time.perf_counter()
    result=subprocess.run(args,cwd=ROOT,capture_output=True)
    receipts.append({'command':args,'exitCode':result.returncode,'runtimeSeconds':time.perf_counter()-start,
                     'stdout':result.stdout.decode('utf-8',errors='replace'),'stderr':result.stderr.decode('utf-8',errors='replace')})
    if result.returncode:
        raise RuntimeError(args)
    return result.stdout
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
run(['git','diff','--cached','--check'])
paths=run(['git','diff','--cached','--name-only']).decode().splitlines()
records=[]
for path in paths:
    if not (path.startswith('docs/plan/agent-mcp-m4/') or path=='docs/adr/0086-optional-agent-domain-read-projections.md'):
        raise RuntimeError(f'发现非规划改动：{path}')
    if path in excluded:
        continue
    # 全文byte消费原stdout不写巨大工具回执；只记录其hash及实际长度。
    result=subprocess.run(['git','show',f':{path}'],cwd=ROOT,capture_output=True,check=True)
    staged=result.stdout
    working=(ROOT/path).read_bytes()
    mapping='identity' if working==staged else 'LF_to_CRLF' if working==staged.replace(b'\n',b'\r\n') else 'different'
    if mapping=='different':
        raise RuntimeError(f'未经说明的staged/worktree差异：{path}')
    blob=subprocess.run(['git','rev-parse',f':{path}'],cwd=ROOT,capture_output=True,check=True).stdout.decode().strip()
    records.append({'path':path,'stagedBlob':blob,'stagedBytes':len(staged),'stagedSha256':sha(staged),
                    'worktreeBytes':len(working),'worktreeSha256':sha(working),'byteMapping':mapping})
manifest={'scope':'仅本卡规划文档，非产品受测源码','records':records,'excludedSelfReference':excluded,
          'fullBlobRead':True,'physicalNetReleasedBytes':None,'productRuntime':'未运行'}
(OUT/'input/delivery-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
data={'sampleUtc':datetime.now(timezone.utc).isoformat(),'receipts':receipts,
      'stagedPlanningFilesChecked':len(records),'excludedSelfReference':excluded,
      'commitVerification':'提交后另按该清单逐blob核对；准确head仅最终回复及Git自身记录，不循环自写',
      'remoteDelivery':'平台在回合结束push，当前未取得push回执，不声称远端可见',
      'productChecksRun':False}
(OUT/'input/delivery-checks.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'文档staged匹配':len(records),'白名单内':True,'排除自引用账本':len(excluded),'whitespaceExit':0},ensure_ascii=False))
