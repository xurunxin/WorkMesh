"""仅核产品证据完整性；规划/产品运行/提交后核验分开。"""
from pathlib import Path
from datetime import datetime
import hashlib,json,subprocess,sys,zipfile
HERE=Path(__file__).parent; ROOT=HERE.resolve().parents[2]
sys.stdout.reconfigure(encoding='utf-8')
def load(name):return json.loads((HERE/name).read_text(encoding='utf-8'))
def sha(data):return hashlib.sha256(data).hexdigest()
def check(data,record):assert len(data)==record['bytes'] and sha(data)==record['sha256']
trees={}
def tree(commit):
    if commit not in trees:
        entries=subprocess.check_output(['git','ls-tree','-rz',commit],cwd=ROOT).split(b'\0')
        trees[commit]={name.decode():meta.decode().split()[2] for entry in entries if entry for meta,name in [entry.split(b'\t',1)]}
    return trees[commit]
counts={}
manifest=load('product-source-manifest.json')
assert sha((HERE/manifest['archive']).read_bytes())==manifest['archiveSha256']
with zipfile.ZipFile(HERE/manifest['archive']) as z:
    assert z.testzip() is None
    for r in manifest['files']:
        raw=z.read(r['members']['runtime']);assert sha(raw)==r['runtimeSha256'] and raw==(ROOT/r['path']).read_bytes()
        if r['sourceBlob']:
            assert tree(r['sourceCommit'])[r['path']]==r['sourceBlob']
            raw=z.read(r['members']['sourceGit']);assert sha(raw)==r['sourceGitSha256']
            assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==r['sourceBlob']
counts['productSourceFiles']=len(manifest['files'])
old=load('source-manifest.json');check((HERE/'source-snapshot.zip').read_bytes(),old['archive'])
with zipfile.ZipFile(HERE/'source-snapshot.zip') as z:
    assert z.testzip() is None
    for r in old['entries']:
        assert tree(r['commit'])[r['path']]==r['blobId']
        raw=z.read(r['git']['member']);check(raw,r['git'])
        assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==r['blobId']
        check(z.read(r['worktree']['member']),r['worktree'])
    for r in old['commits']:check(z.read(r['raw']['member']),r['raw'])
    check(z.read('frozen/m3-section.md'),old['frozenSection'])
    counts.update(frozenSourceEntries=len(old['entries']),frozenMembers=len(z.namelist()))
index=load('product-check-index.json')
assert len(index['required'])==10
receipts={r['id']:r for r in index['receipts']}
assert all(receipts[r]['exit']==0 for r in index['required'].values())
for r in receipts.values():
    assert sha((HERE/r['rawArchive']).read_bytes())==r['archiveSha256']
counts['commandReceipts']=len(receipts)
bindings={r['id']:r for r in load('product-test-source-bindings.json')['rows']}
assert all(bindings[r]['completeUnchangedFinalSource'] and bindings[r]['exit']==0 for r in index['finalAffectedTargets'].values())
assert all(bindings[index['required'][key]]['completeUnchangedFinalSource'] for key in ['test','test:e2e'])
counts['finalAffectedSuitesBound']=len(index['finalAffectedTargets'])
assert len(load('product-operation-matrix.json')['rows'])==40
assert len(load('product-acceptance-matrix.json')['originalRows'])==9
assert len(load('product-recovery-matrix.json')['rows'])==18
counts.update(operationRows=40,acceptanceRows=9,recoveryRows=18)
services=load('product-service-logs-index.json')
assert sha((HERE/services['archive']).read_bytes())==services['archiveSha256']
with zipfile.ZipFile(HERE/services['archive']) as z:
    for r in services['files']:
        assert sha(z.read(r['path']))==r['rawSha256'] and sha((HERE/r['path']).read_bytes())==r['readableSha256']
counts['serviceLogs']=len(services['files'])
owners=load('product-resources.json')['owners']
assert all(r['status']=='removed' and r['cleanupExit']==0 for o in owners for r in o['resources'])
counts['resourceOwners']=len(owners)
observations=[r['observation'] for r in load('product-lock-observations.json')['observations'] if r['receipt']==index['required']['test:integration']+'.json' and r['exit']==0]
waits=[r['m3AuthorityWait'] for r in observations if 'm3AuthorityWait' in r]
assert all(r['waiting'] and r['locks'] and any(x['wait_event_type']=='Lock' and r['blockerPid'] in x['blockers'] for x in r['waiting']) for r in waits)
by_label={r['label']:r for r in waits}
for label in ['stop-commits-first','revoke-commits-first','per-http-sender-holds-authority','stop-waits-for-per-http-authority-commit','merge_pull_request-branch-pin-commits-first','merge_pull_request-base-pin-commits-first','retry_ci_check-branch-pin-commits-first','retry_ci_check-base-pin-commits-first']:
    assert label in by_label
def seconds(a,b):return (datetime.fromisoformat(b)-datetime.fromisoformat(a)).total_seconds()
for r in observations:
    if 'm3UnknownRecovery' in r:
        x=r['m3UnknownRecovery'];assert seconds(x['claimedAt'],x['reclaimedAt'])>=60 and x['writesBeforeRecovery']==1
    if 'm3GenerationRecovery' in r:
        x=r['m3GenerationRecovery'];assert x['stale']['attempt']==x['current']['attempt']==8 and seconds(x['stale']['claimedAt'],x['current']['claimedAt'])>=60
assert seconds(by_label['lease-live-before-real-lock-wait']['waiting'][0]['observed_at'],by_label['lease-expired-still-blocked']['waiting'][0]['observed_at'])>=60
counts['actualLockObservations']=len(waits)
models=list((ROOT/'ci-logs/delivery-recovery').glob('model-*.json'))
for path in models:
    model=json.loads(path.read_text(encoding='utf-8'))
    for capture in model['captures']:
        for result in capture['results']:
            assert not any(s.lower() in result.lower() for s in ['X-Amz-Signature','"uploadUrl"','"downloadUrl"','"requiredHeaders"'])
counts['modelCaptureFiles']=len(models)
result={'exit':0,'counts':counts,'boundary':'仅当前原件完整性与已运行统计核验，不代产品测试、另一Agent正式独审或PR CI；冻结来源的历史工作树字节只与其原ZIP校验，不冒当前源码。'}
(HERE/'product-static-verification.json').write_bytes((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps(result,ensure_ascii=False))
