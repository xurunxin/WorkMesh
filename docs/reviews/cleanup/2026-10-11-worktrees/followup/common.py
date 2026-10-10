"""本轮精确候选与只读证据函数；不含删除操作。"""
import sys
sys.dont_write_bytecode = True
import datetime
import gzip
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

OUT = Path(__file__).absolute().parent
CURRENT = OUT.parents[4]
ROOT = CURRENT.parent
MAIN = '2da4918682f5238499131cff2c71ab465fcc080e'
TARGETS = {
    'g1-plan': '01a115ed-0894-7af5-b31f-4ffe208e198a',
    'g1-build': '01a11661-dbed-70ca-85d6-05851a0213e1',
    'upgrade-first': '01a11a0e-d8a0-7474-ad05-791c239b82fe',
    'upgrade-final': '01a11a77-e1c5-763d-ad86-a1bcf4d672e6',
    'cleanup-old': '01a126be-7aba-7b1d-a57a-f58317f89a67',
}

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

# 只加载现有函数；所有历史脚本的 main 均不执行，不改旧证据。
sys.path.insert(0, str(OUT.parent / 'continuation'))
sys.path.insert(0, str(OUT.parent))
inventory = module('followup_inventory', OUT.parent / 'usage-inventory.py')
scanner = module('followup_scanner', OUT.parent / 'inventory.py')
native = module('followup_native', OUT.parent / 'continuation/metadata_proof_import.py')
sanitizer = module('followup_sanitizer', OUT.parent / 'continuation/finish-mapping.py')

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def write(name, value):
    path = OUT / name
    assert path.parent == OUT and not path.exists(), path
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    with path.open('xb') as stream:
        stream.write(gzip.compress(raw, mtime=0) if name.endswith('.gz') else raw)

def load(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw.decode('utf-8-sig'))

def call(path, *args):
    argv = ['git', '-C', str(path), *args]
    started = utc()
    p = subprocess.run(argv, capture_output=True)
    return {'input': argv, 'startedAt': started, 'endedAt': utc(), 'exit': p.returncode,
            'stdout': p.stdout.decode('utf-8', 'replace'), 'stderr': p.stderr.decode('utf-8', 'replace')}

def git(*args):
    return subprocess.run(['git', '-C', str(CURRENT), *args], capture_output=True, check=True).stdout

def tree(commit):
    result = {}
    for item in git('ls-tree', '-r', '-z', commit).split(b'\0'):
        if item:
            meta, path = item.split(b'\t')
            mode, kind, blob = meta.decode().split()
            assert kind == 'blob' and mode in ('100644', '100755')
            result[path.decode()] = {'mode': mode, 'blob': blob}
    return result

def gate(path):
    blocked = inventory.directory_gate(path)
    assert not blocked, blocked
    assert path.parent == ROOT and path != CURRENT and path.name in TARGETS.values()

def protection_conflicts(path):
    prefix = str(path).lower()
    return [r for r in load(OUT.parent / 'protected-paths.json')
            if r.get('source') and (r['path'].lower() == prefix or r['path'].lower().startswith(prefix + '\\'))]
