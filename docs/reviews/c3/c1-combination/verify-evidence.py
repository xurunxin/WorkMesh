"""只读核验当前组合、历史证据、运行副本及原件归档。"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--index', action='store_true', help='提交前验证 index；默认验证 HEAD')
args = parser.parse_args()
review = Path(__file__).resolve().parent
root = review.parents[3]
listing = subprocess.check_output(['git', 'ls-files', '--stage', '-z'] if args.index else ['git', 'ls-tree', '-r', '-z', 'HEAD'], cwd=root)
current_blobs = {}
for entry in listing.split(b'\0'):
    if entry:
        header, path = entry.decode().split('\t', 1)
        fields = header.split()
        if args.index:
            assert fields[2] == '0', '仍有未解决冲突'
        current_blobs[path] = fields[1] if args.index else fields[2]
read = lambda name: json.loads((review / name).read_text(encoding='utf-8-sig'))
digest = lambda value: hashlib.sha256(value).hexdigest()
binding = read('source-binding.json')
metadata = read('post-validation-metadata.json') if (review / 'post-validation-metadata.json').exists() else {'files': {}}
assert {path for path in current_blobs if not path.startswith('docs/')} == set(binding['files']), '出现未绑定产品路径'
objects = list(dict.fromkeys(row['gitBlob'] for row in binding['files'].values()))
raw = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=root, input=('\n'.join(objects) + '\n').encode())
offset = 0
for object_id in objects:
    end = raw.index(b'\n', offset)
    head = raw[offset:end].decode().split()
    assert head[:2] == [object_id, 'blob']
    size = int(head[2])
    data = raw[end + 1:end + 1 + size]
    for row in binding['files'].values():
        if row['gitBlob'] == object_id:
            assert len(data) == row['gitBytes'] and digest(data) == row['gitSha256']
    offset = end + 1 + size + 1
assert offset == len(raw)
for path, row in binding['files'].items():
    final = metadata['files'].get(path, row)
    if path in metadata['files']:
        assert path == '.gitignore' and final['testedGitBlob'] == row['gitBlob']
    assert current_blobs[path] == final['gitBlob'], path
    assert digest((root / path).read_bytes()) == final['sha256'], path
history = read('historical-evidence.json')
for path, row in history['files'].items():
    assert digest((root / path).read_bytes()) == row['sha256'], path
    assert current_blobs[path] == row['gitBlob'], path
index = read('checks-raw-index.json')
archive = review / index['archive']
assert archive.stat().st_size == index['archiveBytes'] and digest(archive.read_bytes()) == index['archiveSha256']
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    assert set(zipped.namelist()) == {row['member'] for row in index['members']}
    for row in index['members']:
        data = zipped.read(row['member'])
        assert len(data) == row['bytes'] and digest(data) == row['sha256']
        assert zipped.getinfo(row['member']).CRC == row['crc32']
    for item in read('runtime-copies.json')['copies']:
        original = (root / item['sourcePath']).read_bytes()
        assert digest(original) == item['sourceSha256']
        expected = original
        if item['sourcePath'].endswith('stage0.spec.ts'):
            expected = expected.replace(b'http://127.0.0.1:3101', b'http://127.0.0.1:35101').replace(b'http://127.0.0.1:3100', b'http://127.0.0.1:35100')
        if item['sourcePath'] == 'playwright.config.ts':
            expected = expected.replace(b'const apiPort = "3101";', b'const apiPort = "35101";').replace(b'const webPort = "3100";', b'const webPort = "35100";')
            directory = str(Path(item['runtimePath']).parent / '.tmp/c3-c1-combination-01a11890/test-copy')
            expected = expected.replace(b'testDir: "./apps/web/e2e"', b'testDir: ' + json.dumps(directory).encode())
        actual = zipped.read('runtime/' + Path(item['runtimePath']).name)
        assert expected == actual and digest(actual) == item['runtimeSha256']
checks = read('checks.json')
assert all(row['exitCode'] == 0 and row['sourceUnchanged'] and row['sourceBefore'] == row['sourceAfter'] == binding['sourceDigest'] for row in checks)
for name in ['refusal.json', 'config-refusal.json']:
    refusal = read('cleanup-audit/' + name)
    assert not refusal['processStarted'] and refusal['processExitCode'] is None and not refusal['prechecksExecuted']
    assert refusal['reasonAsReturned'] == 'blocked by policy' and not refusal['mutatingTargetActionsAfterRefusal']
    for kind in ['input', 'output']:
        data = (review / 'cleanup-audit' / refusal[kind + 'File']).read_bytes()
        assert digest(data) == refusal[kind + 'Sha256']
        if kind == 'output':
            assert 'blocked by policy' in data.decode()
    assert Path(refusal['target']).exists(), '被拒目标不在原位，需要独审查明，不得自行恢复'
cleanup = read('cleanup-summary.json')
assert not cleanup['cleanupComplete'] and len(cleanup['retainedTemporaryTargets']) == 2
assert all(row['stopExitCode'] == row['removeExitCode'] == 0 and row['verifiedAbsent'] for row in cleanup['containers'])
print(f'核验通过：{len(binding["files"])} 个组合源码、{len(history["files"])} 份历史证据、{len(index["members"])} 个原件成员；目标={"index" if args.index else "HEAD"}。')
if metadata['files']:
    print('最终 Git 忽略规则有单独元数据差异绑定；15 条原检查仍绑定测试时摘要，不冒最终忽略规则已参与旧运行。')
print('旧审批违规事实与子回执缺口保持原义；本核验不代表独审、PR RequiredCI 或合入通过。')
