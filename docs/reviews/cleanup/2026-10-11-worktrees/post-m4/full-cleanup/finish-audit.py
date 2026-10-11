"""收尾只读核验：删除结果、拒绝父目录身份、共享资源与剩余组成。"""
import sys
sys.dont_write_bytecode = True
import collections
import os
from pathlib import Path
import shutil
import audit

a = audit.a
OUT, CURRENT, ROOT = audit.OUT, audit.CURRENT, audit.ROOT


def main():
    started = a.utc()
    opening = a.load(OUT / 'audit-opening.json.gz')
    before = {r['path']: r for r in opening['rows']}
    usage = a.load(OUT / 'usage-after.json.gz')
    assert usage['complete'] and usage['errors'] == 0
    registration = a.call(CURRENT, 'worktree', 'list', '--porcelain')
    assert registration['exit'] == 0
    registered = {line[9:].replace('\\', '/') for line in registration['stdout'].splitlines() if line.startswith('worktree ')}
    results = []
    for target in a.load(OUT / 'execution-plan.json')['targets']:
        receipt = a.load(OUT / ('execution-' + target['key'] + '.json'))
        present = os.path.lexists(target['path'])
        listed = target['path'].replace('\\', '/') in registered
        success = receipt['error'] is None and receipt['existsAfter'] is False and not present and not listed
        results.append(dict(key=target['key'],path=target['path'],logicalBytes=target['logicalBytes'],
            receipt='execution-' + target['key'] + '.json',result=receipt['result'],error=receipt['error'],
            existsNow=present,registeredNow=listed,success=success))
    rows, global_ids, protected = [], {}, []
    for row in usage['rows']:
        root = Path(row['path'])
        data = a.scan(root, full=True)
        assert not data['errors'], data['errors']
        for dev, inode, size in data.pop('identities'):
            identity = (dev,inode)
            assert identity not in global_ids or global_ids[identity] == size
            global_ids[identity] = size
        record = dict(path=str(root),scan=data,head=a.call(root,'rev-parse','HEAD'),
            status=a.call(root,'status','--porcelain=v1','--untracked-files=all'),
            reason=audit.DENIED.get(root.name) or ('本轮当前构建' if root == CURRENT else '实际首败/现场变化，见逐目标回执'))
        assert record['head']['exit'] == record['status']['exit'] == 0
        rows.append(record)
        if root.name in audit.DENIED:
            old = before[str(root)]
            old_files = {f['path']:f for f in old['scan']['files']}
            now_files = {f['path']:f for f in data['files']}
            # 同一文件的其它派生 hardlink 被移除会改变 nlink；本体身份/长度/属性仍应一致。
            fields = ('path','bytes','attributes','device','fileId')
            differences = [p for p in old_files.keys() | now_files.keys()
                if p not in old_files or p not in now_files or any(old_files[p][k] != now_files[p][k] for k in fields)]
            link_count_changes = [dict(path=p,before=old_files[p]['nlink'],after=now_files[p]['nlink'])
                for p in old_files.keys() & now_files.keys() if old_files[p]['nlink'] != now_files[p]['nlink']]
            check = dict(path=str(root),files=len(now_files),differences=differences,nlinkChanges=link_count_changes,
                linksEqual=sorted(old['scan']['links'],key=lambda x:x['path']) == sorted(data['links'],key=lambda x:x['path']),
                headEqual=old['head']['stdout'] == record['head']['stdout'],statusEqual=old['status']['stdout'] == record['status']['stdout'])
            assert not differences and check['linksEqual'] and check['headEqual'] and check['statusEqual'], check
            protected.append(check)
    worktree_ids = dict(global_ids)
    main_root = Path(usage['mainRepositorySeparate']['path'])
    main_scan = a.scan(main_root, full=False)
    assert not main_scan['errors']
    for dev, inode, size in main_scan.pop('identities'):
        identity = (dev,inode)
        assert identity not in global_ids or global_ids[identity] == size
        global_ids[identity] = size
    private = []
    for name in ('rebuild-verification.json','rebuild-verification-isolated.json','rebuild-verification-copy-isolation.json'):
        proof = a.load(OUT / name)
        path = Path(proof['privateVirtualStore'])
        assert path.parent == Path('X:/packages/workmesh-task-virtual-stores') and path.name.startswith(CURRENT.name + '-proof-')
        if path.exists():
            scanned = a.scan(path,full=False)
            assert not scanned['errors']
            scanned.pop('identities')
            private.append(dict(path=str(path),source=name,scan=scanned,
                reason='本轮当前验证产生的专属环境；本轮合入后按精确 owner/现场引用独立收尾，非共享 CAS'))
    runtime = a.load(OUT / 'runtime-shared-source.json')
    native_path = Path(runtime['path'])
    native_stat = os.stat(native_path,follow_symlinks=False)
    assert native_stat.st_size == runtime['bytes'] and a.sha(native_path.read_bytes()) == runtime['sha256']
    package = a.load(OUT / 'rebuild-verification-copy-isolation.json')
    cas = Path(package['storePath'])
    assert a.sha(cas.read_bytes()) == package['packageSha256']
    containers_before = a.load(OUT / 'activity-opening.json')['containers']
    activity_after = a.load(OUT / 'activity-after.json')
    after_ids = {c['id']:c for c in activity_after['containers']}
    container_receipts = a.load(OUT / 'containers-execution.json')['rows']
    removed_ids = {r['target'] for r in container_receipts if not r['error']}
    unrelated_changes = []
    for old in containers_before:
        if old['id'] in removed_ids:
            assert old['id'] not in after_ids
            continue
        now = after_ids.get(old['id'])
        if now is None or any(old[k] != now[k] for k in ('name','mounts','imageId')):
            unrelated_changes.append(dict(id=old['id'],name=old['name'],kind='缺失或名称/挂载/镜像变化；未对该目标调用删除'))
    a.write('audit-after.json.gz',dict(startedAt=started,endedAt=a.utc(),rows=rows,mainSeparate=main_scan,
        worktreeIdentityBytes=sum(worktree_ids.values()),worktreesAndMainIdentityBytes=sum(global_ids.values()),
        openingWorktreeIdentityBytes=opening['globalIdentityBytes'],openingMainIdentityBytes=None,
        protectedChecks=protected,privateCurrentTestEnvironments=private,results=results,registration=registration,
        sharedNative=dict(path=runtime['path'],sha256=runtime['sha256'],bytes=native_stat.st_size,nlinkBefore=runtime['nlink'],nlinkAfter=native_stat.st_nlink),
        sharedCASSample=dict(path=str(cas),sha256=package['packageSha256'],unchanged=True),
        containers=dict(receipts=container_receipts,otherContainerChanges=unrelated_changes,
            newOtherContainers=[c['id'] for c in activity_after['containers'] if c['id'] not in {b['id'] for b in containers_before}]),
        volumeFreeBytes=dict(openingC=opening['freeVolumeBytes'],afterC=shutil.disk_usage('C:/').free,
            afterX=shutil.disk_usage('X:/').free),physicalNetReleasedBytes=None))
    print(a.json.dumps(dict(removed=sum(r['success'] for r in results),failures=[r for r in results if not r['success']],
        remaining=len(rows),protected=len(protected),worktreeIdentityBytes=sum(worktree_ids.values()),
        aggregateIdentityBytes=sum(global_ids.values()),privateCurrentTestBytes=sum(r['scan']['logicalBytes'] for r in private),
        physicalNetReleasedBytes=None),ensure_ascii=False))


if __name__ == '__main__':
    main()
