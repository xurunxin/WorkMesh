"""证据解析、源码/运行字节与逐Gitblob实核；不删除、不跑产品套件。"""
import ast
import collections
import json
import subprocess
import zipfile
from audit import OUT, CURRENT, utc, sha, load, write

def main():
    checks = []
    for p in sorted(OUT.iterdir()):
        if p.suffix == '.json' or p.name.endswith('.json.gz'):
            load(p)
            checks.append(dict(path=p.name,check='JSON/GZIP解析',success=True))
        elif p.suffix == '.py':
            ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
            checks.append(dict(path=p.name,check='Python AST',success=True))
        elif p.suffix == '.zip':
            with zipfile.ZipFile(p) as z:
                assert z.testzip() is None
                for info in z.infolist():
                    z.read(info)
            checks.append(dict(path=p.name,check='全部ZIP成员CRC/读取',success=True))
    digests = load(OUT/'blob-digests.json.gz')
    proc = subprocess.Popen(['git','-C',str(CURRENT),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    count = 0
    for blob,proof in digests.items():
        proc.stdin.write((blob+'\n').encode());proc.stdin.flush()
        header = proc.stdout.readline().decode().split()
        assert header[:2] == [blob,'blob']
        data = proc.stdout.read(int(header[2]))
        assert proc.stdout.read(1) == b'\n'
        assert len(data) == proof['gitBytes'] and sha(data) == proof['gitSha256']
        count += 1
    proc.stdin.close()
    assert proc.wait() == 0
    mapping = load(OUT/'mapping-cleanup-pr217.json.gz')
    transforms = collections.Counter()
    for row in mapping['files']:
        if row['kind'] == 'git-administration':
            continue
        assert row['kind'] == 'tracked'
        b = digests[row['gitBlob']]
        t = b['transforms'][row['reconstruction']]
        assert t['sha256'] == row['windowsSha256'] and t['bytes'] == row['bytes']
        transforms[row['reconstruction']] += 1
    ps_command = [
        'pwsh','-NoProfile','-Command',
        "$records=@(); foreach ($path in @('execute.ps1','references.ps1')) { $errors=$null; $literal=Join-Path 'docs/reviews/cleanup/2026-10-11-worktrees/post-m4' $path; [System.Management.Automation.Language.Parser]::ParseFile($literal,[ref]$null,[ref]$errors) | Out-Null; $records += [pscustomobject]@{path=$path;errors=@($errors)} }; $records | ConvertTo-Json -Depth 8; if (@($records | Where-Object {$_.errors.Count}).Count) { exit 1 }"]
    p = subprocess.run(ps_command,capture_output=True)
    write('powershell-validation.json',dict(input=ps_command,exit=p.returncode,stdout=p.stdout.decode('utf-8','replace'),stderr=p.stderr.decode('utf-8','replace')))
    assert p.returncode == 0
    write('validation-final.json',dict(recordedAt=utc(),checks=checks,verifiedGitBlobs=count,
        mappedRuntimeFiles=sum(transforms.values()),transforms=dict(transforms),zipOriginalMembers=0,
        actualExclusiveReads=load(OUT/'verification-cleanup-pr217.json')['exclusiveReadCount'],
        safetyCases=load(OUT/'safety-checks.json')['result'],result='全部通过；diff --check另保真实调用原件'))
    print(dict(parsedChecks=len(checks),gitBlobs=count,mappedRuntimeFiles=sum(transforms.values()),powershellExit=p.returncode,result='通过'))

if __name__ == '__main__':
    main()
