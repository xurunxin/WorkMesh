"""仅盘点 #54–57；不跟随链接，写本清理分支受控证据。"""
import sys
sys.dont_write_bytecode = True
import collections
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
CURRENT = OUT.parents[4]
ROOT = CURRENT.parent
MAIN = '87f88b89297c5c1e346f7ef99118c410f4b4a905'
TARGETS = {54: '01a11ed4-1e73-7802-8bf8-4899c5405f61', 55: '01a12031-e9de-75c4-ab40-b44affcd71f6', 56: '01a121fb-781b-7b58-9bca-a596b92a8cbe', 57: '01a1246e-406c-7593-ada6-66996634434b'}
sys.path.insert(0, str(OUT.parent))
from inventory import scan

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def write(name, data):
    raw = (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode()
    if name.endswith('.gz'):
        raw = gzip.compress(raw, mtime=0)
    (OUT / name).write_bytes(raw)

def call(path, *args):
    argv = ['git', '-C', str(path), *args]
    start = utc()
    p = subprocess.run(argv, capture_output=True)
    return {'input': argv, 'start': start, 'end': utc(), 'exit': p.returncode, 'stdout': p.stdout.decode('utf-8', 'replace'), 'stderr': p.stderr.decode('utf-8', 'replace')}

def category(path):
    parts = path.split('/')
    if 'node_modules' in parts:
        return 'dependency'
    if '.turbo' in parts:
        return 'turbo-output'
    if '.next' in parts or 'dist' in parts:
        return 'build-output'
    if '__pycache__' in parts:
        return 'python-bytecode'
    return 'evidence-or-runtime'

def main():
    rows = []
    for todo, name in TARGETS.items():
        root = ROOT / name
        head = call(root, 'rev-parse', 'HEAD')
        files, links, nested, errors = scan(root)
        ignored_raw = subprocess.run(['git', '-C', str(root), 'ls-files', '--others', '--ignored', '--exclude-standard', '-z'], capture_output=True, check=True).stdout
        ignored = {p.decode() for p in ignored_raw.split(b'\0') if p}
        groups = collections.defaultdict(lambda: {'files': 0, 'bytes': 0})
        paths = []
        for f in files:
            if f['path'] in ignored:
                c = category(f['path'])
                groups[c]['files'] += 1
                groups[c]['bytes'] += f['bytes']
                row = {**f, 'category': c}
                if c != 'dependency':
                    data = (root / f['path']).read_bytes()
                    row['sha256'] = hashlib.sha256(data).hexdigest()
                paths.append(row)
        outside = []
        for link in links:
            t = link['target'].replace('\\\\?\\', '').replace('\\?\\', '')
            t = os.path.normpath(t)
            link['lexicalTarget'] = t
            link['insideCandidate'] = os.path.commonpath([str(root), t]).lower() == str(root).lower()
            if not link['insideCandidate']:
                outside.append(link)
        row = {'todo': todo, 'path': str(root), 'head': head, 'status': call(root, 'status', '--porcelain=v1', '--untracked-files=all'),
               'ancestor': call(CURRENT, 'merge-base', '--is-ancestor', head['stdout'].strip(), MAIN),
               'main': MAIN, 'files': len(files), 'logicalBytes': sum(f['bytes'] for f in files), 'groups': dict(groups),
               'links': links, 'outsideLinks': outside, 'nestedGit': nested, 'errors': errors, 'recordedAt': utc()}
        write(f'ignored-{todo}.json.gz', paths)
        write(f'scan-{todo}.json.gz', {'files': files, 'links': links, 'nested': nested, 'errors': errors})
        rows.append(row)
        print(json.dumps({k: row[k] for k in ['todo', 'logicalBytes', 'groups', 'outsideLinks', 'nestedGit', 'errors']}, ensure_ascii=False), flush=True)
    write('audit.json.gz', rows)

if __name__ == '__main__':
    main()
