"""本次只读盘点工具；不跟随任何 Windows reparse point，不执行删除。"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

OUT = Path(__file__).resolve().parent
CURRENT = OUT.parents[3]
ROOT = CURRENT.parent
RECENT = {
    '01a11e5e-9e0c-704b-a590-3fee492f4f6a': 53,
    '01a11ed4-1e73-7802-8bf8-4899c5405f61': 54,
    '01a12031-e9de-75c4-ab40-b44affcd71f6': 55,
    '01a121fb-781b-7b58-9bca-a596b92a8cbe': 56,
    '01a1246e-406c-7593-ada6-66996634434b': 57,
}

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def git(path, *args):
    call = ['git', '-C', str(path), *args]
    started = utc()
    p = subprocess.run(call, capture_output=True)
    result = {'input': call, 'startedAt': started, 'endedAt': utc(), 'exitCode': p.returncode,
              'stdout': p.stdout.decode('utf-8', errors='replace'), 'stderr': p.stderr.decode('utf-8', errors='replace')}
    return result

def scan(root):
    files, links, nested, errors = [], [], [], []
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
                            links.append({'path': rel, 'target': os.readlink(entry.path), 'attributes': s.st_file_attributes})
                        elif entry.is_dir(follow_symlinks=False):
                            if entry.name == '.git':
                                nested.append(rel)
                            stack.append(Path(entry.path))
                        else:
                            files.append({'path': rel, 'bytes': s.st_size})
                            if entry.name == '.git' and rel != '.git':
                                nested.append(rel)
                    except OSError as e:
                        errors.append({'path': rel, 'error': str(e)})
        except OSError as e:
            errors.append({'path': str(directory), 'error': str(e)})
    return files, links, nested, errors

def inventory():
    registration = git(CURRENT, 'worktree', 'list', '--porcelain')
    write('registration-before.json', registration)
    rows = []
    registered = {}
    for block in registration['stdout'].strip().split('\n\n'):
        fields = dict(line.split(' ', 1) for line in block.splitlines() if ' ' in line)
        registered[str(Path(fields['worktree']).resolve()).lower()] = fields
    # 仅列举指定根的直接子目录；确认 WorkMesh git remote 后才扫描。
    for path in ROOT.iterdir():
        if not path.name.startswith('01a') or not path.is_dir():
            continue
        remote = git(path, 'remote', 'get-url', 'origin')
        if remote['exitCode'] or remote['stdout'].strip() != 'https://github.com/xurunxin/WorkMesh.git':
            rows.append({'path': str(path), 'decision': '保留：归属未确认', 'remote': remote})
            continue
        row = {'path': str(path), 'todo': RECENT.get(path.name), 'startedAt': utc(),
               'remote': remote, 'registration': registered.get(str(path.resolve()).lower()),
               'head': git(path, 'rev-parse', 'HEAD'),
               'status': git(path, 'status', '--porcelain=v1', '--untracked-files=all'),
               'ignored': git(path, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory')}
        files, links, nested, errors = scan(path)
        row.update({'logicalBytesWithoutFollowingLinks': sum(f['bytes'] for f in files),
                    'fileCount': len(files), 'links': links, 'nestedGit': nested, 'scanErrors': errors,
                    'endedAt': utc()})
        if path.name in RECENT:
            write(f'files-{RECENT[path.name]}.json', files)
        rows.append(row)
        print(json.dumps({'name': path.name, 'todo': row['todo'], 'bytes': row['logicalBytesWithoutFollowingLinks'],
                          'files': len(files), 'links': len(links), 'nested': nested, 'errors': len(errors),
                          'dirty': row['status']['stdout'][:250], 'ignored': row['ignored']['stdout'][:350]}, ensure_ascii=False), flush=True)
    write('inventory.json', {'startedAt': registration['startedAt'], 'endedAt': utc(), 'root': str(ROOT), 'rows': rows,
                            'limitations': '普通文件逻辑长度含 hardlink 重复计数；链接目标未遍历；不代表物理占用。活动目录扫描不构成一致快照。'})

if __name__ == '__main__':
    inventory()
