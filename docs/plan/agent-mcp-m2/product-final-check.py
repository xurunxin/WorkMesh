"""交付静态核验与实际资源观察；不是产品测试，也不补历史未知exit。"""
from pathlib import Path
import hashlib,json,subprocess,sys,time,zipfile
ROOT=Path(__file__).resolve().parents[3]
BASE=Path(__file__).parent
def hashbytes(b):return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def main():
    checks=[];operations=[]
    def command(argv):
        start=time.time();r=subprocess.run(argv,cwd=ROOT,capture_output=True)
        operations.append({'argv':argv,'nativeExit':r.returncode,'startedUnix':start,'endedUnix':time.time(),'stdout':r.stdout.decode('utf-8',errors='replace'),'stderr':r.stderr.decode('utf-8',errors='replace')})
        assert r.returncode==0,argv
        return r.stdout
    for name in ['product-collect.py','product-delivery.py','product-final-check.py']:
        compile((BASE/name).read_bytes(),str(BASE/name),'exec')
    checks.append('三份交付脚本当前UTF8字节可编译，无新增pyc')
    # Only the two py_compile leaves created by this producer this turn; no recursive deletion.
    removed=[];preserved=[]
    for name in ['product-collect','product-delivery']:
        p=BASE/'__pycache__'/f'{name}.cpython-{sys.version_info.major}{sys.version_info.minor}.pyc'
        if not p.exists():continue
        assert p.resolve().is_relative_to(ROOT.resolve()) and not p.is_symlink() and not p.parent.is_symlink()
        row={'path':p.relative_to(ROOT).as_posix(),'absoluteTarget':str(p.resolve()),'before':hashbytes(p.read_bytes()),'ownership':'本轮明确py_compile两份交付脚本产生的叶文件，不属历史恢复或共享store','operation':'Path.unlink verified exact owned leaf, not recursive'}
        preserved.append((row['path'],p.read_bytes()))
        with zipfile.ZipFile(BASE/'product-evidence/document-pyc-before.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
            for name,data in preserved:z.writestr(name,data)
        p.unlink();row['afterExists']=p.exists();row['nativeResult']=0;removed.append(row)
    matrix=json.loads((BASE/'product-closure-matrix.json').read_text(encoding='utf-8'))
    frozen=json.loads((BASE/'acceptance-matrix.json').read_text(encoding='utf-8'))
    assert len(matrix['rows'])==18
    assert [r['frozenRawLine'] for r in matrix['rows']]==[r['frozenRawLine'] for r in frozen['cases']]
    checks.append('18条冻结原验收行逐字相等')
    ops=json.loads((BASE/'product-operation-results.json').read_text(encoding='utf-8'))
    assert len(ops['operations'])==91 and len({r['operationId'] for r in ops['operations']})==91
    current=json.loads((BASE/'operation-decisions.json').read_text(encoding='utf-8'))
    assert [r['operationId'] for r in ops['operations']]==[r['operationId'] for r in current['operations']]
    checks.append('91操作精确原顺序、当前policy/MCP/SDK/Runner及实际运行列齐全')
    manifest=json.loads((BASE/'product-source-manifest.json').read_text(encoding='utf-8'))
    assert hashbytes((BASE/manifest['archive']['path']).read_bytes())=={k:manifest['archive'][k] for k in ['bytes','sha256']}
    with zipfile.ZipFile(BASE/manifest['archive']['path']) as z:
        for row in manifest['entries']:
            assert hashbytes(z.read('worktree/'+row['path']))==row['worktree']==hashbytes((ROOT/row['path']).read_bytes())
            for label in ['gitMain','gitHead']:
                if row[label]:assert hashbytes(z.read(label+'/'+row['path']))=={k:row[label][k] for k in ['bytes','sha256']}
    checks.append('当前产品源码ZIP逐成员/工作树字节与Git原blob索引分别绑定')
    receipts=[(p,json.loads(p.read_text(encoding='utf-8'))) for p in (BASE/'product-evidence').glob('run-*.json')]
    unknown=[p.name for p,r in receipts if 'nativeExit' not in r]
    assert unknown==['run-073.json'],unknown
    checks.append('仅旧run073未知exit原件保留；本轮健康测试均已退出')
    command(['git','-c','core.safecrlf=false','diff','--check',manifest['main']])
    commands=command(['git','ls-files','--others','--exclude-standard']).decode().splitlines()
    generated=[n for n in commands if n.startswith(('apps/','packages/')) and n.endswith(('.js','.d.ts')) and (ROOT/(n[:-5]+'.ts' if n.endswith('.d.ts') else n[:-3]+'.ts')).is_file()]
    assert not generated,generated
    checks.append('完整main→当前工作树diff --check退出0，无新散落js/d.ts编译生成叶文件')
    containers=command(['docker','ps','--filter','label=workmesh.m2.owner','--format','{{.Names}} {{.Status}}']).decode().strip()
    assert not containers,containers
    resources=[json.loads(p.read_text(encoding='utf-8')) for p in (BASE/'product-evidence').glob('*-resources.json')]
    assert all(row['status']=='removed' for owner in resources for row in owner['resources'])
    # Process output intentionally excludes CommandLine, environment and credentials.
    ps="Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*01a121fb-781b-7b58-9bca-a596b92a8cbe*' } | Select-Object ProcessId,ParentProcessId,Name,CreationDate | ConvertTo-Json -Compress"
    observed=command(['powershell','-NoProfile','-Command',ps]).decode('utf-8',errors='replace').strip()
    result={'kind':'交付静态验证及收尾观察，非新产品测试','checks':checks,'operations':operations,'observedWorkspaceProcesses':json.loads(observed) if observed else [],'observedOwnedContainers':containers,'resourceRegistries':len(resources),'registeredContainers':sum(len(r['resources']) for r in resources),'ownedPycCleanup':removed,'pycBeforeArchive':hashbytes((BASE/'product-evidence/document-pyc-before.zip').read_bytes()) if preserved else None,'historicalUnknown':unknown,'protectedTargets':'G1D0C3/共享store/镜像/他人服务/当前恢复目录未操作','completedUnix':time.time()}
    (BASE/'product-final-static-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'staticChecks':len(checks),'ownedContainers':result['registeredContainers'],'exit':0}))
if __name__=='__main__':main()
