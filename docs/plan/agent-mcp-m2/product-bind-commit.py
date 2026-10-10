"""绑定已提交产品和实际受测字节；只生成交付证据，不运行产品测试。"""
from pathlib import Path
import hashlib
import json
import subprocess
import time
import zipfile

ROOT = Path(__file__).resolve().parents[3]
BASE = Path(__file__).resolve().parent
PRODUCT = 'b0d46f486a57e3e7723f1f92a7c1e3b89bd64243'


def digest(data):
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def main():
    operations = []

    def command(argv, data=None):
        start = time.time()
        result = subprocess.run(argv, cwd=ROOT, input=data, capture_output=True)
        operations.append({'argv': argv, 'nativeExit': result.returncode,
                           'startedUnix': start, 'endedUnix': time.time(),
                           'stdout': result.stdout.decode('utf-8', errors='replace'),
                           'stderr': result.stderr.decode('utf-8', errors='replace')})
        assert result.returncode == 0, argv
        return result.stdout

    manifest = json.loads((BASE / 'product-source-manifest.json').read_text(encoding='utf-8'))
    assert manifest['observedHead'] == PRODUCT
    receipt = json.loads((BASE / 'product-evidence/run-122.json').read_text(encoding='utf-8'))
    assert receipt['nativeExit'] == 0 and receipt['sourceUnchanged'] is True
    archive = BASE / manifest['archive']['path']
    assert digest(archive.read_bytes()) == {k: manifest['archive'][k] for k in ['bytes', 'sha256']}
    rows = []
    with zipfile.ZipFile(archive) as snapshot:
        for entry in manifest['entries']:
            name = entry['path']
            raw = (ROOT / name).read_bytes()
            actual = digest(raw)
            assert actual == entry['worktree'] == receipt['sourceAfter'][name]
            assert receipt['sourceBefore'][name] == actual
            assert digest(snapshot.read('worktree/' + name)) == actual
            git_bytes = command(['git', 'show', PRODUCT + ':' + name])
            blob = command(['git', 'rev-parse', PRODUCT + ':' + name]).decode().strip()
            assert digest(git_bytes) == {k: entry['gitHead'][k] for k in ['bytes', 'sha256']}
            assert blob == entry['gitHead']['blob']
            assert digest(snapshot.read('gitHead/' + name)) == digest(git_bytes)
            canonical = command(['git', '-c', 'core.safecrlf=false', 'hash-object',
                                 '--path=' + name, '--stdin'], raw).decode().strip()
            assert canonical == blob
            rows.append({'path': name, 'runtimeBeforeAfterWorktree': actual,
                         'gitProductBlob': blob, 'gitRawBytes': digest(git_bytes),
                         'cleanFilteredRuntimeBlob': canonical,
                         'gitRawEqualsWindowsRuntime': git_bytes == raw})
    command(['git', '-c', 'core.safecrlf=false', 'diff', '--check', manifest['main'], PRODUCT])
    command(['git', '-c', 'core.safecrlf=false', 'diff', '--check', manifest['main']])
    changes = command(['git', 'diff', '--name-only', PRODUCT]).decode().splitlines()
    assert all(n.startswith('docs/plan/agent-mcp-m2/') for n in changes), changes
    result = {'kind': '提交后源码/运行字节独立静态绑定，不是新产品测试',
              'productCommit': PRODUCT, 'observedMain': manifest['main'],
              'runtimeReceipt': 'product-evidence/run-122.json',
              'runtimeCommandExit': receipt['nativeExit'],
              'sourceArchive': manifest['archive'], 'entries': rows,
              'commands': operations, 'followingChanges': changes,
              'followingChangesScope': '产品代码在此commit冻结；后续只增交付文档和证据，不循环填未来自引用head',
              'completedUnix': time.time()}
    (BASE / 'product-commit-binding.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'boundFiles': len(rows), 'productCommit': PRODUCT, 'nativeExit': 0}))


if __name__ == '__main__':
    main()
