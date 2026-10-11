"""操作后登记/保护/身份与总量复核；不重发删除。"""
import shutil
from pathlib import Path
from audit import OUT, BASE, CURRENT, ROOT, MAIN, utc, load, write, call, scan

def main():
    before = load(OUT/'audit-opening.json.gz')
    operation = load(OUT/'execution-cleanup-pr217.json')
    target = Path(operation['target'])
    assert not target.exists() and operation['error'] is None
    assert operation['calls'][-1]['exit'] == 0
    registration = call(CURRENT,'worktree','list','--porcelain')
    assert registration['exit'] == 0 and target.name not in registration['stdout']
    rows, global_ids = [], {}
    started = utc()
    for old in before['rows']:
        p = Path(old['path'])
        if p == target:
            continue
        assert p.exists()
        head = call(p,'rev-parse','HEAD')
        assert head['exit'] == 0
        if p != CURRENT:
            assert head['stdout'] == old['head']['stdout']
        snapshot = scan(p)
        assert not snapshot['errors']
        for device,ident,size in snapshot.pop('identities'):
            key = (device,ident)
            if key in global_ids:
                assert global_ids[key] == size
            global_ids[key] = size
        snapshot.pop('files')
        rows.append(dict(path=str(p),head=head,scan=snapshot,logicalChangeSinceIdentityOpening=snapshot['logicalBytes']-old['scan']['logicalBytes']))
    main_root = ROOT/'DzkLDn6UW-IbfoTJzN9Ro/repo'
    main_snapshot = scan(main_root)
    main_ids = main_snapshot.pop('identities')
    assert not main_snapshot['errors']
    global_worktree_identity = sum(global_ids.values())
    for device,ident,size in main_ids:
        key = (device,ident)
        if key in global_ids:
            assert global_ids[key] == size
        global_ids[key] = size
    protected = []
    for old in before['rows']:
        for entry in old['protectionMatches']:
            now = Path(entry['path']).exists()
            assert now == entry['existsNow'],entry['path']
            protected.append(dict(path=entry['path'],source=entry.get('source'),before=entry['existsNow'],after=now))
    inherited = load(BASE/'protected-paths.json')
    # 完整旧台账含缺失历史路径、根外精确保护；对本轮开工缺少存在性快照者不补造before。
    full_protected = [dict(**p,existsAfter=Path(p['path']).exists()) for p in inherited]
    explicit = [ROOT/'01a126be-7aba-7b1d-a57a-f58317f89a67',
        ROOT/'01a1264e-bd35-76d4-b328-03e9b91301f3'/'.tmp/m5-runtime',
        ROOT/'01a127d4-e047-7e57-81c2-3d054851fc88'/'.tmp/m4-4adc5e39',CURRENT,main_root]
    assert all(p.exists() for p in explicit)
    blocks = []
    for block in registration['stdout'].strip().split('\n\n'):
        fields = dict(line.split(' ',1) for line in block.splitlines() if ' ' in line)
        p = Path(fields['worktree'])
        assert p.exists() and '\nprunable' not in block
        head = call(p,'rev-parse','HEAD')
        assert head['exit'] == 0
        blocks.append(dict(path=str(p),head=head))
    write('protected-after.json.gz',dict(recordedAt=utc(),comparedOpeningPaths=protected,
        comparedChanges=0,fullHistoricalObservations=full_protected,
        explicitProtected=[dict(path=str(p),exists=True) for p in explicit],
        limitation='本轮source匹配路径逐项before/after；全历史台账部分旧缺失为只读after观察，不倒填未取本轮before。'))
    write('identity-after.json.gz',dict(startedAt=started,endedAt=utc(),rows=rows,mainRepositorySeparate=main_snapshot,
        worktreeGlobalIdentityBytes=global_worktree_identity,projectGlobalIdentityBytes=sum(global_ids.values()),
        diskFreeBytes=shutil.disk_usage('C:/').free,physicalNetReleasedBytes=None,
        limitation='文件身份去重的长度非物理分配；跨树相同内容但不同身份不合并，活动采样非一致快照。'))
    write('postflight.json',dict(recordedAt=utc(),target=str(target),targetExists=False,
        originalGitExit=operation['calls'][-1]['exit'],registration=registration,registeredHealthy=blocks,
        registrationCountBefore=len(load(OUT/'git-environment.json')['registration']['stdout'].strip().split('\n\n')),
        registrationCountAfter=len(blocks),comparedProtectedPaths=len(protected),protectionChanges=0,
        logicalRemovedBytes=3030837288,volumeFreeChangeBytes=operation['diskAfter']['FreeSpace']-operation['diskBefore']['FreeSpace'],
        physicalNetReleasedBytes=None,result='一个完整工作树已回收；其它登记可读、保护无变化；未重做历史成功或重试历史停止/拒绝。'))
    print(dict(registrationBefore=22,registrationAfter=len(blocks),protectedCompared=len(protected),protectionChanges=0,
               identityWorktreeBytes=global_worktree_identity,identityProjectBytes=sum(global_ids.values())))

if __name__ == '__main__':
    main()
