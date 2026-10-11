"""15:05 全清授权后的只读定位；不跟链接、不删除、不输出秘密正文。"""
import sys
sys.dont_write_bytecode = True
import collections
import importlib.util
import os
from pathlib import Path

OUT = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location('previous_audit', OUT.parent / 'audit.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
a.OUT = OUT
CURRENT = a.CURRENT
ROOT = a.ROOT
MAIN = a.MAIN
TARGETS = {}
utc, write, call = a.utc, a.write, a.call
sha, load = a.sha, a.load
DENIED = {
    '01a115d0-87b0-78cd-921d-750713cdde51': 'D0：2026-10-08-historical-worktrees.md 原策略拒绝及父目录',
    '01a116f7-1027-7c75-90df-32ebc5488752': 'G1：同历史报告 G1 shallow clone 原策略拒绝及父目录',
    '01a11890-f4de-7106-b64d-e1b2c0d4608e': 'C3：同历史报告两个原策略拒绝及父目录',
    '01a11acb-1a68-7fba-a359-7119603cde7d': 'G1 审计 JSON 编辑原策略拒绝：remaining-materials-review-2026-10-08.json#/g1Clone/priorEditRejectionReceipt/target',
}

def main():
    results = []
    global_ids = {}
    for row in a.load(OUT / 'usage-opening.json.gz')['rows']:
        root = Path(row['path'])
        data = a.scan(root, full=True)
        for dev, inode, size in data.pop('identities'):
            key = (dev, inode)
            assert key not in global_ids or global_ids[key] == size
            global_ids[key] = size
        result = dict(path=str(root), excluded=DENIED.get(root.name) or ('本轮当前构建' if root == CURRENT else None),
            head=a.call(root, 'rev-parse', 'HEAD'), branch=a.call(root, 'branch', '--show-current'),
            status=a.call(root, 'status', '--porcelain=v1', '--untracked-files=all'),
            ignored=a.call(root, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory'), scan=data)
        results.append(result)
        groups = collections.Counter()
        for f in data['files']:
            rel = f['path']
            if rel.startswith('.tmp/'):
                groups['/'.join(rel.split('/')[:3])] += f['bytes']
        print(a.json.dumps(dict(path=root.name, excluded=result['excluded'], files=len(data['files']),
            logicalBytes=data['logicalBytes'], readonly=len(data['readonly']), nested=data['nestedGit'],
            statusLines=len(result['status']['stdout'].splitlines()), tmp=groups.most_common(15)), ensure_ascii=False), flush=True)
    a.write('audit-opening.json.gz', dict(recordedAt=a.utc(), rows=results, globalIdentityBytes=sum(global_ids.values()),
        freeVolumeBytes=a.shutil.disk_usage('C:/').free, physicalNetReleasedBytes=None))

if __name__ == '__main__':
    main()
