"""仅续跑已失败阶段及其未运行后续；先精确核已通过 DB/API 的原日志与消费源码。"""
from pathlib import Path
import hashlib,json,re,subprocess,sys,datetime
ROOT=Path(__file__).resolve().parents[3]; DOC=ROOT/'docs/plan/agent-mcp-m5'
sys.stdout.reconfigure(encoding='utf8')
label='review-combined-integration'
rows=json.loads((DOC/'product-checks.json').read_text(encoding='utf8'))
original=next(row for row in reversed(rows) if row['label']==label)
assert original['argv']==['pnpm.cmd','test:integration'] and original['nativeExit']==1
source=ROOT/original['sourceBinding']['path']; raw=source.read_bytes()
assert hashlib.sha256(raw).hexdigest()==original['sourceBinding']['sha256']
stdout=ROOT/original['logs']['stdout']['path']; output=stdout.read_bytes()
assert hashlib.sha256(output).hexdigest()==original['logs']['stdout']['sha256']
text=re.sub(r'\x1b\[[0-9;]*m','',output.decode('utf8'))
prefix=text.split('> workmesh@ test:conformance:integration ')[0]
assert 'Test Files  17 passed (17)' in prefix and 'Tests  81 passed (81)' in prefix
assert 'Test Files  27 passed (27)' in prefix and 'Tests  278 passed | 1 skipped (279)' in prefix
assert 'Test Files  1 failed | 4 passed (5)' in text
value=json.loads(raw); after={row['path']:row for row in value['after']['entries']}
prefixes=('apps/api/','packages/db/','packages/contracts/','packages/domain/','packages/config/','packages/observability/','packages/artifact-storage/','packages/git-provider/','scripts/')
roots={'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','SCHEMA.sql','tsconfig.json','tsconfig.base.json'}
consumed=[row for row in value['before']['entries'] if row['path'].startswith(prefixes) or row['path'] in roots]
assert consumed
for row in consumed:
 assert after.get(row['path'],{}).get('sha256')==row['sha256'],row['path']
 assert hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
proof={'original':original,'prefixSourceEntries':consumed,'originalWholeCommandExit':1,'prefixCounts':{'db':{'passed':81,'skipped':0},'api':{'passed':278,'skipped':1}},'notRepeated':'已通过且当前消费源码逐文件相等的 DB/API 阶段','resumedCommands':[],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
target=DOC/'product-integration-resume.json'
def save():target.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
# Preserve the first continuation, including its two obsolete discovery assertions.
if target.exists():
 prior=target.read_bytes(); archive=DOC/'input'/('integration-resume-'+hashlib.sha256(prior).hexdigest()+'.json')
 if archive.exists():assert archive.read_bytes()==prior
 else:archive.write_bytes(prior)
proof['supersededContinuation']=str(archive.relative_to(DOC)) if target.exists() else None
previous=next(row for row in reversed(rows) if row['label']=='review-resumed-conformance')
assert previous['nativeExit']==1
priorOutput=(ROOT/previous['logs']['stdout']['path']).read_bytes()
assert hashlib.sha256(priorOutput).hexdigest()==previous['logs']['stdout']['sha256']
priorText=re.sub(r'\x1b\[[0-9;]*m','',priorOutput.decode('utf8'))
assert 'Tests  2 failed | 82 passed (84)' in priorText
assert 'src/mcp-coverage.conformance.test.ts (12 tests | 2 failed)' in priorText
sourceRaw=(ROOT/previous['sourceBinding']['path']).read_bytes()
assert hashlib.sha256(sourceRaw).hexdigest()==previous['sourceBinding']['sha256']
priorBinding=json.loads(sourceRaw); priorAfter={row['path']:row['sha256'] for row in priorBinding['after']['entries']}
excluded={'packages/conformance/src/mcp-coverage.conformance.test.ts'}
native=re.compile(r'^packages/conformance/src/joint-clients\.(acceptance|drivers|external|journeys\.fixture|faults\.fixture|provider\.fixture)\.ts$')
stable=[]
for row in priorBinding['before']['entries']:
 if not row['path'].startswith(('apps/','packages/')) or row['path'] in excluded or native.match(row['path']):continue
 assert priorAfter.get(row['path'])==row['sha256'] and hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
 stable.append(row)
retest=next(row for row in reversed(rows) if row['label']=='review-mcp-recovery-conformance-current')
assert retest['nativeExit']==0 and retest['argv']==['pnpm.cmd','--filter','@workmesh/conformance','test:integration','src/mcp-coverage.conformance.test.ts']
retestRaw=(ROOT/retest['sourceBinding']['path']).read_bytes();assert hashlib.sha256(retestRaw).hexdigest()==retest['sourceBinding']['sha256']
retestBinding=json.loads(retestRaw);retestAfter={row['path']:row['sha256'] for row in retestBinding['after']['entries']}
for row in retestBinding['before']['entries']:
 if row['path'].startswith(('apps/','packages/')) and not native.match(row['path']):
  assert retestAfter.get(row['path'])==row['sha256'] and hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
retestOutput=(ROOT/retest['logs']['stdout']['path']).read_bytes()
assert hashlib.sha256(retestOutput).hexdigest()==retest['logs']['stdout']['sha256']
assert 'Tests  12 passed (12)' in re.sub(r'\x1b\[[0-9;]*m','',retestOutput.decode('utf8'))
proof['conformanceContinuation']={'failedFullRun':previous,'unchangedFourSuitesPassed':72,'stableConsumedEntries':stable,'changedSuiteActualRetest':retest,'currentPassedTotal':84,'wholeCommandExitRemains':1}
proof['resumedCommands'].append({'label':'review-mcp-recovery-conformance-current','argv':retest['argv'],'nativeExit':0,'interpretation':'72 unchanged tests from four suites plus actual 12-test changed-suite rerun; not a new whole-suite exit'})
save()
for suffix, command in [('worker','test:integration:worker'),('recovery','test:integration:recovery')]:
 currentLabel={'worker':'review-final-resumed-worker','recovery':'review-recovery-empty-current'}[suffix]
 receipt=next(row for row in reversed(rows) if row['label']==currentLabel)
 assert receipt['nativeExit']==0 and receipt['argv']==['pnpm.cmd',command]
 for channel in ['stdout','stderr']:
  assert hashlib.sha256((ROOT/receipt['logs'][channel]['path']).read_bytes()).hexdigest()==receipt['logs'][channel]['sha256']
 rawBinding=(ROOT/receipt['sourceBinding']['path']).read_bytes()
 assert hashlib.sha256(rawBinding).hexdigest()==receipt['sourceBinding']['sha256']
 binding=json.loads(rawBinding);afterHashes={row['path']:row['sha256'] for row in binding['after']['entries']}
 for row in binding['before']['entries']:
  if row['path'].startswith(('apps/','packages/')) and not native.match(row['path']):
   assert afterHashes.get(row['path'])==row['sha256'] and hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
 proof['resumedCommands'].append({'label':currentLabel,'argv':receipt['argv'],'nativeExit':receipt['nativeExit'],'verifiedActualReceipt':receipt,'notRepeated':True})
 save()
proof.update({'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'currentConstituentChecks':'passed','originalWholeCommandExitRemains':1,'exactWholeCommandRerun':False})
save();print(json.dumps({'verifiedPrefixEntries':len(consumed),'resumedConstituentsPassed':True,'originalWholeCommandExit':1}))
