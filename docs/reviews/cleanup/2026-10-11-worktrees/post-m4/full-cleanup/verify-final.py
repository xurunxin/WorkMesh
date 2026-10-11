"""独立解析最终交付和真实回执，复核不可变预检 Git 对象与归档 CRC。"""
import sys
sys.dont_write_bytecode=True
import ast
import json
import subprocess
import zipfile
import audit

a,OUT,CURRENT=audit.a,audit.OUT,audit.CURRENT


def main():
    started=a.utc()
    parsed=[]
    for pattern in ('*.json','*.json.gz'):
        for path in sorted(OUT.glob(pattern)):
            a.load(path)
            parsed.append(dict(path=path.name,bytes=path.stat().st_size,sha256=a.sha(path.read_bytes())))
    sources=[]
    for path in sorted(OUT.glob('*.py')):
        ast.parse(path.read_text(encoding='utf-8-sig'),filename=str(path))
        sources.append(path.name)
    binding=a.load(OUT/'preflight-binding.json')
    objects=[]
    bound_files = binding['files'] + a.load(OUT/'hardlink-source-binding.json')['files'] + a.load(OUT/'gate-resume-source-binding.json')['files']
    for row in bound_files:
        args=['git','-C',str(CURRENT),'cat-file','blob',row['gitBlob']]
        begin=a.utc();result=subprocess.run(args,capture_output=True)
        assert result.returncode==0 and len(result.stdout)==row['gitBytes'] and a.sha(result.stdout)==row['gitSha256']
        objects.append(dict(path=row['path'],blob=row['gitBlob'],input=args,startedAt=begin,endedAt=a.utc(),exitCode=result.returncode,
            bytes=len(result.stdout),sha256=a.sha(result.stdout),stderr=result.stderr.decode('utf-8','replace')))
    plan=a.load(OUT/'execution-plan.json')
    archive=OUT/plan['archive']['path']
    assert a.sha(archive.read_bytes())==plan['archive']['sha256']
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        members=[dict(member=info.filename,bytes=info.file_size,crc32=info.CRC,sha256=a.sha(z.read(info))) for info in z.infolist()]
    final=a.load(OUT/'audit-after.json.gz')
    assert len(final['results'])==len(plan['targets'])
    expected={r['key']:r for r in plan['targets']}
    successful=0
    for row in final['results']:
        assert row['logicalBytes']==expected[row['key']]['logicalBytes']
        receipt=a.load(OUT/row['receipt'])
        assert receipt['endedAt'] and receipt['existsAfter']==row['existsNow']
        if row['success']:
            assert not receipt['error'] and not row['existsNow'] and not row['registeredNow']
            native=[c for c in receipt['calls'] if c['kind']=='native-subprocess' and 'input' in c
                and 'worktree' in c['input'] and 'remove' in c['input']]
            assert len(native)==1 and native[0]['exitCode']==0
            successful+=1
    assert final['physicalNetReleasedBytes'] is None and len(final['protectedChecks'])==4
    report=(OUT/'report.md').read_text(encoding='utf-8')
    assert '物理净释放' in report and 'RequiredCI' in report
    assert a.load(OUT/'entry-verification-handoff.json')['success']
    assert a.load(OUT/'new-machine-verification.json')['success']
    assert a.load(OUT/'rebuild-verification-copy-isolation.json')['storeUnchangedAfterPrivateWrite']
    assert a.load(OUT/'thin-plan-verification.json')['sharedConfigUnchanged']
    a.write('final-verification.json',dict(startedAt=started,endedAt=a.utc(),success=True,parsed=parsed,pythonAst=sources,
        immutablePreflightCommit=binding['commit'],gitObjects=objects,archiveMembers=members,
        successfulWorktrees=successful,stoppedWorktrees=len(plan['targets'])-successful,
        physicalNetReleasedBytes=None,scope='真实回执/占用/JSON/ZIP/Git对象/入口边界；PowerShell语法与diff另有原调用'))
    print(json.dumps(dict(success=True,jsonFiles=len(parsed),pythonFiles=len(sources),preflightGitObjects=len(objects),archiveMembers=len(members),removed=successful)))


if __name__=='__main__':main()
