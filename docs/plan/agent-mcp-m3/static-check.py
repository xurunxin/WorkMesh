"""M3规划静态核验；不运行产品测试、不写产品代码。"""
from pathlib import Path
import hashlib,json,re,subprocess,zipfile
import yaml

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
MAIN='ef4cb5e1458d911d98433c443dba46e6c224caa0'
FROZEN='c768e1e3db297d8b91b53dd68b60e723a8a40e7d'
ADR=ROOT/'docs/adr/0083-exact-provider-action-query-and-review-repository-scope.md'

def git(*args,data=None):return subprocess.check_output(['git',*args],cwd=ROOT,input=data)
def load(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
def check(data,expected):
    assert len(data)==expected['bytes']
    assert hashlib.sha256(data).hexdigest()==expected['sha256']

def main():
    counts={}
    manifest=load('source-manifest.json')
    check((OUT/'source-snapshot.zip').read_bytes(),manifest['archive'])
    oids=list(dict.fromkeys(e['blobId'] for e in manifest['entries']))
    all_bytes=git('cat-file','--batch',data=('\n'.join(oids)+'\n').encode())
    blobs,at={},0
    for oid in oids:
        end=all_bytes.index(b'\n',at);actual,kind,size=all_bytes[at:end].decode().split()
        assert actual==oid and kind=='blob'
        at=end+1;blobs[oid]=all_bytes[at:at+int(size)];at+=int(size)+1
    assert at==len(all_bytes)
    seen=set()
    with zipfile.ZipFile(OUT/'source-snapshot.zip') as archive:
        assert archive.testzip() is None
        for e in manifest['entries']:
            data=archive.read(e['git']['member']);check(data,e['git']);assert data==blobs[e['blobId']]
            seen.add(e['git']['member'])
            data=archive.read(e['worktree']['member']);check(data,e['worktree']);assert data==(ROOT/e['path']).read_bytes()
            seen.add(e['worktree']['member'])
        for e in manifest['commits']:
            data=archive.read(e['raw']['member']);check(data,e['raw']);assert data==git('cat-file','commit',e['commit'])
            seen.add(e['raw']['member'])
        section=archive.read('frozen/m3-section.md');check(section,manifest['frozenSection'])
        full=git('show',FROZEN+':docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md')
        assert section==full[full.index('## M3：'.encode()):full.index('## M4：'.encode())]
        assert (OUT/'frozen-m3.md').read_bytes()==section.decode().rstrip('\r\n').encode()+b'\n'
        seen.add('frozen/m3-section.md');assert seen==set(archive.namelist())
    frozen=[e for e in manifest['entries'] if e['commit']==FROZEN]
    assert len(frozen)==7 and all(e['frozenEqualsMain'] for e in frozen)
    assert manifest['mainTreeEqualsM2Candidate'] and not manifest['headToMainDiff']
    counts.update(sourceEntries=len(manifest['entries']),sourceMembers=len(seen),frozenDocuments=len(frozen))
    operations=load('operation-decisions.json')['operations']
    current=load('current-openapi-operations.json')
    assert len({e['operationId'] for e in operations})==len(operations)
    for op in operations:
        if op['operationId']=='getProviderAction':
            assert op['currentRest'] is None and op['operationId'] not in current
        else:
            assert op['currentRest']==current[op['operationId']]
            assert op['proposedRest']=={k:current[op['operationId']][k] for k in ['method','path']}
    acceptance=load('acceptance-matrix.json')
    raw_rows=[l for l in section.decode().splitlines() if l.startswith('| ') and not l.startswith(('| 验收类','| ---'))]
    assert raw_rows==[e['originalRow'] for e in acceptance['originalRows']]
    assert len(raw_rows)==9 and all(e['applicability'] and e['status']=='未运行' for e in acceptance['originalRows'])
    assert acceptance['originalDoD'] in section.decode()
    counts.update(operations=len(operations),acceptanceRows=len(raw_rows))
    assert (OUT/'savedplan.md').read_bytes()==(OUT/'implementation.md').read_bytes()
    original=(OUT/'input/platform-injected-original-plan.md').read_text(encoding='utf-8')
    tool=load('input/todos-readback.json')['content'][0]['text']
    visible=tool.split('Saved plan:\n',1)[1].split('…(truncated)',1)[0].rstrip()
    assert original.startswith(visible), '原注入全文与工具可见前缀不符'
    rebuilt=original
    edits=load('input/plan-edits.json')['edits']
    assert len(edits)==7
    for edit in edits:
        assert rebuilt.count(edit['old'])==1
        rebuilt=rebuilt.replace(edit['old'],edit['new'])
    assert rebuilt==(OUT/'savedplan.md').read_text(encoding='utf-8')
    assert 'doc:fpst3y-xxH7WIBMjBXejk' in (OUT/'input/conversation-readback.txt').read_text(encoding='utf-8')
    assert (OUT/'input/current-spec-readback.md').read_text(encoding='utf-8').strip()==tool.split('Spec:\n',1)[1].split('Saved plan:\n',1)[0].strip()
    counts['platformVisiblePrefixChars']=len(visible)
    package=load('planning-tools/package.json')
    lock=yaml.safe_load(git('show',MAIN+':pnpm-lock.yaml'))['importers']
    assert package['dependencies']=={'typescript':lock['.']['devDependencies']['typescript']['version'],
      'yaml':lock['.']['devDependencies']['yaml']['version'],'zod':lock['packages/contracts']['dependencies']['zod']['version']}
    assert set(load('planning-tools/package-lock.json')['packages'])=={'','node_modules/typescript','node_modules/yaml','node_modules/zod'}
    links=0;white=0;files=[]
    for path in sorted(OUT.rglob('*'))+[ADR]:
        if not path.is_file() or '.runtime' in path.parts or '__pycache__' in path.parts:
            continue
        # 原工具读回保真实编码/换行，不对证据原件做正文空白改写。
        if path.suffix in ('.md','.py','.mjs','.ts','.yaml','.json') and '/input/' not in path.as_posix():
            data=path.read_bytes();text=data.decode('utf-8')
            assert not data.startswith(b'\xef\xbb\xbf') and '\r' not in text,path
            assert text.endswith('\n') and not text.endswith('\n\n'),path
            assert not any(line.rstrip(' \t')!=line for line in text.splitlines()),path
            white+=1
            if path.suffix=='.md':
                for target in re.findall(r'\]\(([^)]+)\)',text):
                    if re.match(r'(?:https?://|todo:|doc:)',target):continue
                    target=target.split('#')[0]
                    assert (path.parent/target).resolve().is_file(),(path,target)
                    links+=1
        files.append(str(path.relative_to(ROOT)).replace('\\','/'))
    allowed={'docs/adr/0083-exact-provider-action-query-and-review-repository-scope.md'}
    diff=git('diff','--name-only','HEAD').decode().splitlines()
    new=git('ls-files','--others','--exclude-standard').decode().splitlines()
    assert all(p.startswith('docs/plan/agent-mcp-m3/') or p in allowed for p in diff+new),'越界修改'
    counts.update(utf8WhitespaceFiles=white,localLinks=links,productFilesChanged=0)
    counts['sourceMissingSymbols']=[e['symbol'] for e in load('source-map.json') if not e['found']]
    assert counts['sourceMissingSymbols']==['clock_timestamp'],'缺失clock_timestamp是准确现源码缺口，不冒已有检查'
    artifact=load('artifact-manifest.json')['entries']
    assert {e['path'] for e in artifact}==set(files)-{'docs/plan/agent-mcp-m3/artifact-manifest.json'}
    for e in artifact:check((ROOT/e['path']).read_bytes(),e)
    receipts=list((OUT/'checks').glob('*.json'))
    for path in receipts:
        receipt=json.loads(path.read_text(encoding='utf-8'))
        raw=receipt['rawArchive'];check((ROOT/raw['path']).read_bytes(),raw)
        with zipfile.ZipFile(ROOT/raw['path']) as archive:
            assert archive.testzip() is None
            check(archive.read('stdout.bin'),receipt['rawOutputs']['stdout'])
            check(archive.read('stderr.bin'),receipt['rawOutputs']['stderr'])
            for e in receipt['testedBefore']:
                if e['path'].endswith('/source-snapshot.zip'):continue
                check(archive.read('inputs/'+e['path']),e)
    counts.update(artifactEntries=len(artifact),rawCheckArchives=len(receipts))
    previous=load('history/reviewed-candidate-manifest.json')
    raw=previous['archive'];check((ROOT/raw['path']).read_bytes(),raw)
    with zipfile.ZipFile(ROOT/raw['path']) as archive:
        check(archive.read('commit'),previous['commitObject'])
        assert archive.read('commit')==git('cat-file','commit',previous['reviewedCandidate'])
        assert archive.testzip() is None
        for entry in previous['entries']:
            data=archive.read(entry['member']) if 'member' in entry else (ROOT/entry['unchangedArchive']).read_bytes()
            check(data,entry)
            assert data==git('cat-file','blob',entry['blobId'])
    recovery=load('worker-recovery-matrix.json')
    assert len(recovery['rows'])==18 and recovery['attemptCountMonotonic'] and recovery['newMigrations']==0
    assert len({(e['provider'],e['kind']) for e in recovery['rows']})==18
    for e in recovery['rows']:
        assert e['productStatus']=='未运行' and e['mutationHttpOnRecovery']==0
        assert e['withoutCheckpointAfterClaim']==('bounded_read_retry' if e['kind']=='resolve_repository_context' else 'stop_dead_unknown')
    counts.update(preservedPreviousCandidateFiles=len(previous['entries']),providerKindRecoveryRows=len(recovery['rows']))
    print(json.dumps({'status':'规划静态通过，不是产品通过','counts':counts,'exitCode':0},ensure_ascii=False))

if __name__=='__main__':main()
