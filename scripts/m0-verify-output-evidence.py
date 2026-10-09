"""校验原日志、ZIP与旧索引字节承诺；重复归档不得重写已有ZIP。"""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
directory = root / 'docs/plan/agent-mcp-m0/product-evidence'
digest = lambda data: hashlib.sha256(data).hexdigest()
existing = {path.name: digest(path.read_bytes()) for path in directory.glob('raw-output-*.zip')}
for _ in range(2):
    subprocess.run(['python', str(root / 'scripts/m0-finalize-evidence.py')], cwd=root, check=True)
    assert all(digest((directory / name).read_bytes()) == value for name, value in existing.items())
rows = json.loads((directory / 'raw-output-index.json').read_text(encoding='utf8'))
original = json.loads(subprocess.check_output(['git', 'show', '6cf8b105a320e9f72eba4aef5d335de8ae344730:docs/plan/agent-mcp-m0/product-evidence/raw-output-index.json'], cwd=root))
assert rows[:len(original)] == original, '旧索引原件承诺不得倒写'
history = json.loads((directory / 'review3-historical-archive-bindings.json').read_text(encoding='utf8'))
assert history['originalIndexSha256'] == digest(subprocess.check_output(['git', 'show', history['sourceHead'] + ':docs/plan/agent-mcp-m0/product-evidence/raw-output-index.json'], cwd=root))
historical = {row['path']: row for row in history['historicalDeclarationDifferences']}
differences = 0
for row in rows:
    archive = directory / row['archive']
    actual = digest(archive.read_bytes())
    if actual != row['archiveSha256']:
        # 不把旧声明算作通过；严格绑定旧Git实物，原声明缺口单列。
        binding = historical[row['path']]
        assert binding['archive'] == row['archive'] and binding['declaredArchiveSha256'] == row['archiveSha256']
        immutable = subprocess.check_output(['git', 'show', binding['sourceHead'] + ':docs/plan/agent-mcp-m0/product-evidence/' + row['archive']], cwd=root)
        assert actual == digest(immutable) == binding['sourceGitArchiveSha256']
        assert row in original
        differences += 1
    with zipfile.ZipFile(archive) as saved:
        output = saved.read(row['member'])
    assert (len(output), digest(output)) == (row['originalBytes'], row['originalSha256'])
    readable = (directory / row['path']).read_bytes()
    assert (len(readable), digest(readable)) == (row['readableBytes'], row['readableSha256'])
print(json.dumps({'结果': '原输出和旧ZIP/索引承诺核验通过', 'outputs': len(rows),
                  'oldRowsUnchanged': len(original), 'existingZipsUnchangedAfterTwoPasses': len(existing),
                  'historicalContainerDeclarationsUnverified': differences,
                  'historicalMembersVerified': True}, ensure_ascii=False))
