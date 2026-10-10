"""验证最终文档索引，不重复产品测试或覆盖历史资源清理原件。"""
from pathlib import Path
import hashlib
import json
import runpy
import subprocess
import sys
import time

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]


def main():
    for name in ['product-collect.py', 'product-delivery.py', 'product-final-check.py',
                 'product-bind-commit.py', 'product-verify-package.py']:
        compile((BASE / name).read_bytes(), str(BASE / name), 'exec')
    binding = json.loads((BASE / 'product-commit-binding.json').read_text(encoding='utf-8'))
    assert len(binding['entries']) == 49
    assert all(r['nativeExit'] == 0 for r in binding['commands'])
    # The subprocess carries the exact absolute __file__ and a separately observed native exit.
    code = 'import runpy; runpy.run_path(' + repr(str(BASE / 'product-collect.py')) + ')["artifacts"]()'
    argv = [sys.executable, '-c', code]
    start = time.time()
    result = subprocess.run(argv, cwd=ROOT, capture_output=True)
    assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
    operation = {'argv': argv, 'nativeExit': result.returncode,
                 'startedUnix': start, 'endedUnix': time.time(),
                 'runtimeSeconds': time.time() - start,
                 'stdout': result.stdout.decode('utf-8', errors='replace'),
                 'stderr': result.stderr.decode('utf-8', errors='replace')}
    index = json.loads((BASE / 'product-artifact-manifest.json').read_text(encoding='utf-8'))
    for row in index['files']:
        raw = (ROOT / row['path']).read_bytes()
        assert len(raw) == row['bytes'] and hashlib.sha256(raw).hexdigest() == row['sha256'], row['path']
    names = {r['path'] for r in index['files']}
    for name in ['product-final-static-checks.json', 'product-commit-binding.json',
                 'product-packaging-events.json', 'product-evidence/document-pyc-before.zip']:
        assert (BASE / name).relative_to(ROOT).as_posix() in names
    validation = {'kind': '最终索引全字节静态验证，不是产品测试',
                  'absoluteIndexInvocation': operation,
                  'verifiedIndexedFilesBeforeThisReceipt': len(index['files']),
                  'requiredNewEvidencePresent': True,
                  'committedProductRuntimeBindings': 49,
                  'historicalUnknownExitNotReconstructed': True,
                  'sourceSnapshotUnchangedByThisOperation': True,
                  'completedUnix': time.time()}
    (BASE / 'product-package-validation.json').write_text(
        json.dumps(validation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    # Include this receipt too; exclude only the manifest itself to avoid a self-hash cycle.
    runpy.run_path(str(BASE / 'product-collect.py'))['artifacts']()
    final = json.loads((BASE / 'product-artifact-manifest.json').read_text(encoding='utf-8'))
    for row in final['files']:
        raw = (ROOT / row['path']).read_bytes()
        assert len(raw) == row['bytes'] and hashlib.sha256(raw).hexdigest() == row['sha256'], row['path']
    print(json.dumps({'indexedFiles': len(final['files']), 'validated': True}))


if __name__ == '__main__':
    main()
