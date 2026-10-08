"""核验组合源码、历史字节、运行前后摘要和本轮归档；不将历史运行冒作当前结果。"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

review = Path(__file__).resolve().parent
root = review.parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--index', action='store_true', help='仅核验尚待平台提交的 index，不称为已提交 HEAD')
args = parser.parse_args()


def git(*command):
    return subprocess.check_output(['git', *command], cwd=root)


def read(name):
    return json.loads((review / name).read_text(encoding='utf8'))


binding = read('source-binding.json')
expected = {path: item['gitBlob'] for path, item in binding['files'].items()}
if args.index:
    rows = git('ls-files', '-sz').split(b'\0')
    actual = {}
    for row in rows:
        if not row:
            continue
        header, path = row.split(b'\t', 1)
        mode, blob, stage = header.split()
        assert stage == b'0', '存在未解决冲突'
        if not path.startswith(b'docs/'):
            actual[path.decode()] = blob.decode()
    assert git('rev-parse', 'MERGE_HEAD').decode().strip() == read('input.json')['mainSource']
else:
    actual = {}
    for row in git('ls-tree', '-rz', '--full-tree', 'HEAD').split(b'\0'):
        if row:
            header, path = row.split(b'\t', 1)
            if not path.startswith(b'docs/'):
                actual[path.decode()] = header.split()[2].decode()
    subprocess.run(['git', 'merge-base', '--is-ancestor', read('input.json')['mainSource'], 'HEAD'], cwd=root, check=True)
assert actual == expected, '组合产品源码与本轮验收绑定不一致'
objects = list(dict.fromkeys(item['gitBlob'] for item in binding['files'].values()))
raw = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=root, input=('\n'.join(objects) + '\n').encode())
blobs = {}
offset = 0
for blob in objects:
    end = raw.index(b'\n', offset)
    header = raw[offset:end].decode().split()
    assert header[:2] == [blob, 'blob']
    size = int(header[2])
    blobs[blob] = raw[end + 1:end + 1 + size]
    offset = end + 1 + size + 1
assert offset == len(raw)
for path, item in binding['files'].items():
    data = blobs[item['gitBlob']]
    assert len(data) == item['gitBytes'] and hashlib.sha256(data).hexdigest() == item['gitSha256'], path
    current = (root / path).read_bytes()
    assert hashlib.sha256(current).hexdigest() == item['sha256'], path

history = read('history-integrity.json')
historical_paths = list(history['files'])
historical_blobs = subprocess.check_output(['git', 'hash-object', '--stdin-paths'], cwd=root,
                                         input=('\n'.join(historical_paths) + '\n').encode()).decode().splitlines()
for path, blob in zip(historical_paths, historical_blobs):
    item = history['files'][path]
    assert blob == item['gitBlob'], path
for check in read('checks.json'):
    assert check['sourceBefore'] == check['sourceAfter'] == read('input.json')['sourceDigest']
    assert check['sourceUnchanged']
for check in read('accepted/checks.json'):
    assert check['exitCode'] == (1 if check['name'] == 'e2e-llm' else 0) and check['sourceUnchanged']
    assert check['sourceBefore'] == check['sourceAfter'] == read('input.json')['sourceDigest']
for check in read('browser/checks.json'):
    assert check['exitCode'] == 0 and check['sourceUnchanged']
    assert check['sourceBefore'] == check['sourceAfter'] == read('input.json')['sourceDigest']

index = read('checks-raw-index.json')
archive = review / index['archive']
assert hashlib.sha256(archive.read_bytes()).hexdigest() == index['archiveSha256']
with zipfile.ZipFile(archive) as zipped:
    assert sorted(zipped.namelist()) == sorted(item['member'] for item in index['members'])
    for item in index['members']:
        data = zipped.read(item['member'])
        assert len(data) == item['bytes'] and hashlib.sha256(data).hexdigest() == item['sha256']
        assert zipped.getinfo(item['member']).CRC == item['crc32']
    for check in read('checks.json'):
        data = zipped.read(check['name'] + '.log')
        assert hashlib.sha256(data).hexdigest() == check['logSha256']
    for check in read('accepted/checks.json'):
        assert hashlib.sha256(zipped.read('accepted/' + check['name'] + '.log')).hexdigest() == check['logSha256']
    for check in read('retry/checks.json'):
        assert hashlib.sha256(zipped.read('retry/' + check['name'] + '.log')).hexdigest() == check['logSha256']
    for check in read('browser/checks.json'):
        assert hashlib.sha256(zipped.read('browser/' + check['name'] + '.log')).hexdigest() == check['logSha256']
    before = json.loads(zipped.read('source-before.json'))
    after = json.loads(zipped.read('source-after.json'))
    assert before['files'] == after['files'] == binding['rawSourceFiles']
    runtime = read('browser/runtime-copies.json')
    assert not runtime['assertionChanges'] and not runtime['timeoutChanges']
    for item in runtime['copies']:
        original = (root / item['sourcePath']).read_bytes()
        assert hashlib.sha256(original).hexdigest() == item['sourceSha256']
        patched = original
        if item['sourcePath'].endswith('stage0.spec.ts'):
            patched = patched.replace(b'http://127.0.0.1:3101', b'http://127.0.0.1:34101').replace(b'http://127.0.0.1:3100', b'http://127.0.0.1:34100')
        elif item['sourcePath'] == 'playwright.config.ts':
            patched = patched.replace(b'const apiPort = "3101";', b'const apiPort = "34101";').replace(b'const webPort = "3100";', b'const webPort = "34100";')
            directory = str(Path(runtime['copies'][0]['runtimePath']).parent)
            patched = patched.replace(b'testDir: "./apps/web/e2e"', b'testDir: ' + json.dumps(directory).encode())
        assert hashlib.sha256(patched).hexdigest() == item['runtimeSha256']
        assert patched == zipped.read('browser/runtime/' + Path(item['runtimePath']).name)
for name in ['resources.json', 'retry/resources.json', 'accepted/resources.json', 'browser/resources.json']:
    assert all(item['cleanup'].get('verifiedAbsent') for item in read(name)['containers'])
print(f"核验成功：{len(expected)} 个组合源码、{len(history['files'])} 个历史证据文件、{len(index['members'])} 个本轮归档成员；目标={'index（尚未提交）' if args.index else 'HEAD'}")
