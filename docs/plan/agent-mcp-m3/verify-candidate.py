"""提交后只读核全部候选Git blob、最终指纹和与末次受测正文的差异。"""
from pathlib import Path
import hashlib,json,subprocess

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
BASE='ef4cb5e1458d911d98433c443dba46e6c224caa0'

def git(*args,data=None):return subprocess.check_output(['git',*args],cwd=ROOT,input=data)
def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

def main():
    head=git('rev-parse','HEAD').decode().strip()
    assert head!=BASE,'必须先提交候选'
    assert git('rev-parse','--abbrev-ref','HEAD').decode().strip()=='tds/conv-01a1246e-406c-7593-ada6-66996634434b'
    paths=git('diff','--name-only',BASE,head).decode().splitlines()
    assert all(p.startswith('docs/plan/agent-mcp-m3/') or p=='docs/adr/0083-exact-provider-action-query-and-review-repository-scope.md' for p in paths)
    assert not git('status','--porcelain').strip(),'候选提交后工作树须干净'
    objects=[git('rev-parse',head+':'+p).decode().strip() for p in paths]
    raw=git('cat-file','--batch',data=('\n'.join(objects)+'\n').encode())
    at=0
    for path,oid in zip(paths,objects):
        end=raw.index(b'\n',at);actual,kind,size=raw[at:end].decode().split();at=end+1
        data=raw[at:at+int(size)];at+=int(size)+1
        assert actual==oid and kind=='blob' and data==(ROOT/path).read_bytes(),path
    assert at==len(raw)
    manifest=json.loads((OUT/'artifact-manifest.json').read_text(encoding='utf-8'))
    assert {e['path'] for e in manifest['entries']}==set(paths)-{'docs/plan/agent-mcp-m3/artifact-manifest.json'}
    for e in manifest['entries']:assert fp((ROOT/e['path']).read_bytes())=={k:e[k] for k in ('bytes','sha256')},e['path']
    receipts=sorted((OUT/'checks').glob('static-*.json'),key=lambda p:int(p.stem.split('-')[-1]))
    last=json.loads(receipts[-1].read_text(encoding='utf-8'))
    assert last['exitCode']==0
    differences=[]
    allowed={'docs/plan/agent-mcp-m3/'+p for p in ('planning-report.md','static-checks.json','artifact-manifest.json')}
    for e in last['testedBefore']:
        if fp((ROOT/e['path']).read_bytes())!={k:e[k] for k in ('bytes','sha256')}:
            assert e['path'] in allowed,('受测正文变化',e['path'])
            differences.append(e['path'])
    tested={e['path'] for e in last['testedBefore']}
    added=[p for p in paths if p not in tested]
    assert all(p.startswith('docs/plan/agent-mcp-m3/checks/') for p in added),added
    print(json.dumps({'candidateHead':head,'sourceMain':BASE,'committedBlobCount':len(paths),
      'manifestEntries':len(manifest['entries']),'testedContentUnchanged':True,
      'finalMetadataChanges':differences,'addedCheckEvidence':added,'productFilesChanged':0,
      'workingTreeClean':True,'exitCode':0},ensure_ascii=True))

if __name__=='__main__':main()
