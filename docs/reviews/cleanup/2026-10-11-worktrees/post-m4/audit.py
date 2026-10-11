"""本轮只读复核；复用已合盘点门禁，不跟链接，不执行删除。"""
import sys
sys.dont_write_bytecode = True
import collections
import datetime
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

OUT = Path(__file__).absolute().parent
BASE = OUT.parent
CURRENT = OUT.parents[4]
ROOT = CURRENT.parent
MAIN = '6a06ce338f90bf16ce27e3cca1a76771eba42e6e'
spec = importlib.util.spec_from_file_location('usage', BASE / 'usage-inventory.py')
usage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(usage)

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw.decode('utf-8-sig'))

def write(name, value):
    path = OUT / name
    assert path.parent == OUT and not usage.directory_gate(OUT)
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    with path.open('xb') as stream:
        stream.write(gzip.compress(raw, mtime=0) if name.endswith('.gz') else raw)

def call(path, *args):
    argv = ['git', '-C', str(path), *args]
    start = utc()
    p = subprocess.run(argv, capture_output=True)
    return dict(input=argv, startedAt=start, endedAt=utc(), exit=p.returncode,
                stdout=p.stdout.decode('utf-8', 'replace'), stderr=p.stderr.decode('utf-8', 'replace'))

def scan(root, full=False):
    assert not usage.directory_gate(root)
    groups = collections.defaultdict(lambda: {'files': 0, 'logicalBytes': 0, 'identityBytes': 0})
    seen = set()
    files, links, nested, readonly, errors, identities = [], [], [], [], [], []
    stack = [root]
    while stack:
        directory = stack.pop()
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    rel = os.path.relpath(entry.path, root).replace('\\', '/')
                    try:
                        s = entry.stat(follow_symlinks=False)
                        if s.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                            links.append(dict(path=rel, target=os.readlink(entry.path), attributes=s.st_file_attributes))
                        elif entry.is_dir(follow_symlinks=False):
                            if entry.name in ('.git', 'repo.git'):
                                nested.append(rel)
                            stack.append(Path(entry.path))
                        elif stat.S_ISREG(s.st_mode):
                            # Windows DirEntry 缓存的 stat 可返回 inode=0；实读文件本体。
                            s = os.stat(entry.path, follow_symlinks=False)
                            identity = (s.st_dev, s.st_ino)
                            assert s.st_ino != 0
                            g = groups[usage.group(rel)]
                            g['files'] += 1
                            g['logicalBytes'] += s.st_size
                            if identity not in seen:
                                g['identityBytes'] += s.st_size
                                seen.add(identity)
                                identities.append((s.st_dev, s.st_ino, s.st_size))
                            f = dict(path=rel, bytes=s.st_size, attributes=s.st_file_attributes,
                                     device=s.st_dev, fileId=s.st_ino, nlink=s.st_nlink)
                            if full:
                                files.append(f)
                            if s.st_file_attributes & stat.FILE_ATTRIBUTE_READONLY:
                                readonly.append(f)
                            if entry.name == '.git' and rel != '.git':
                                nested.append(rel)
                    except OSError as e:
                        errors.append(dict(path=rel, error=str(e)))
        except OSError as e:
            errors.append(dict(path=str(directory), error=str(e)))
    return dict(startedAt=None, endedAt=utc(), groups=dict(groups),
                logicalBytes=sum(g['logicalBytes'] for g in groups.values()),
                identityBytes=sum(g['identityBytes'] for g in groups.values()),
                files=files, links=links, nestedGit=nested, readonly=readonly, errors=errors,
                identities=identities)

def main():
    opening = load(OUT / 'usage-opening.json.gz')
    old = {r['path']: r for r in load(BASE / 'followup/retained-directories.json')['rows']}
    protected = load(BASE / 'protected-paths.json')
    results = []
    global_ids = {}
    started = utc()
    for row in opening['rows']:
        path = Path(row['path'])
        if path == CURRENT:
            # 当前交付也计占用，但绝不候选。
            pass
        before = utc()
        data = scan(path, full=path.name == '01a12766-4132-7d8c-a542-dcbfb2008b49')
        data['startedAt'] = before
        for device, file_id, size in data.pop('identities'):
            key = (device, file_id)
            if key in global_ids:
                assert global_ids[key] == size, '采样间同身份长度改变；不得混合计算'
            global_ids[key] = size
        if data['files']:
            write('candidate-scan.json.gz', data)
        data.pop('files')
        prefix = str(path).lower()
        matches = [p for p in protected if p.get('source') and
                   (p['path'].lower() == prefix or p['path'].lower().startswith(prefix + '\\'))]
        result = dict(path=str(path), historical=old.get(str(path)),
                      protectionMatches=[dict(**p, existsNow=Path(p['path']).exists()) for p in matches],
                      head=call(path, 'rev-parse', 'HEAD'), branch=call(path, 'branch', '--show-current'),
                      status=call(path, 'status', '--porcelain=v1', '--untracked-files=all'),
                      ignored=call(path, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory'),
                      registrationType='linked' if (path / '.git').is_file() else 'independent-or-unknown',
                      scan=data)
        result['ancestor'] = call(CURRENT, 'merge-base', '--is-ancestor', result['head']['stdout'].strip(), MAIN)
        results.append(result)
        print(json.dumps(dict(path=path.name, logicalBytes=data['logicalBytes'], identityBytes=data['identityBytes'],
                              readonly=len(data['readonly']), nested=data['nestedGit'], protected=len(matches)), ensure_ascii=False), flush=True)
    write('audit-opening.json.gz', dict(startedAt=started, endedAt=utc(), main=MAIN, rows=results,
          globalIdentityBytes=sum(global_ids.values()), freeVolumeBytes=shutil.disk_usage('C:/').free,
          physicalNetReleasedBytes=None, limitation='文件身份去重长度仍非物理分配；活动采样非一致快照；不跟 reparse point。'))

if __name__ == '__main__':
    main()
