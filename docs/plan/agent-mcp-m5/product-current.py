"""核对本轮真实回执的受测源码；不重建缺失历史字节或退出。"""
from pathlib import Path
import hashlib,json,datetime
ROOT=Path(__file__).resolve().parents[3]
DOC=ROOT/'docs/plan/agent-mcp-m5'
label='review-api-status-final'
receipt=next(row for row in json.loads((DOC/'product-checks.json').read_text(encoding='utf8')) if row['label']==label)
source=ROOT/receipt['sourceBinding']['path']
assert hashlib.sha256(source.read_bytes()).hexdigest()==receipt['sourceBinding']['sha256']
value=json.loads(source.read_text(encoding='utf8')); before={row['path']:row for row in value['before']['entries']}; after={row['path']:row for row in value['after']['entries']}
changed=[path for path in sorted(before.keys()|after.keys()) if before.get(path)!=after.get(path)]
prefixes=('apps/api/','packages/db/','packages/contracts/','packages/domain/','packages/config/')
consumed=[row for path,row in before.items() if path.startswith(prefixes)]
assert all(before[row['path']]==after[row['path']] for row in consumed)
assert all(hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'] for row in consumed)
report={'label':label,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualExit':receipt['nativeExit'],'runtimeSeconds':receipt['runtimeSeconds'],
 'counts':'27 files passed; 278 tests passed; 1 skipped','sourceManifest':receipt['sourceBinding'],'headAtStart':value['before']['head'],
 'entireRepoUnchanged':False,'changedOutsideConsumedApi':changed,'stableConsumedEntries':consumed,
 'runtimeVsGit':'runtimeBlob hashes exact local bytes including Windows line endings; headBlob is the recorded Git object, not proof of equal runtime bytes',
 'limitations':'source scope does not certify pending actual client journeys or every transitive dependency'}
(DOC/'review-api-status-binding.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps({'actualExit':receipt['nativeExit'],'stableApiEntries':len(consumed),'changedOutsideApi':changed}))
