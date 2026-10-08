"""只保全本轮必要脱敏原件；不删除任何运行目录或旧证据。"""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

review = Path(__file__).resolve().parent
root = review.parents[3]
temporary = root / '.tmp/c3-c1-combination-01a11890'
resources = json.loads((review / 'resources.json').read_text(encoding='utf8'))
assert resources['owner'] == temporary.name
before = json.loads((temporary / 'source-before.json').read_text(encoding='utf8'))
after = json.loads((temporary / 'source-after.json').read_text(encoding='utf8'))
assert before['digest'] == after['digest'] and before['files'] == after['files']
checks = json.loads((review / 'checks.json').read_text(encoding='utf8'))
assert all(item['sourceUnchanged'] and item['sourceBefore'] == before['digest'] for item in checks)
objects = list(dict.fromkeys(item['gitBlob'] for item in before['files'].values()))
output = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=root, input=('\n'.join(objects) + '\n').encode())
blobs = {}
offset = 0
for object_id in objects:
    end = output.index(b'\n', offset)
    header = output[offset:end].decode().split()
    assert header[:2] == [object_id, 'blob']
    size = int(header[2])
    blobs[object_id] = output[end + 1:end + 1 + size]
    offset = end + 1 + size + 1
assert offset == len(output)
binding = {}
for path, item in before['files'].items():
    git_bytes = blobs[item['gitBlob']]
    worktree = (root / path).read_bytes()
    assert hashlib.sha256(worktree).hexdigest() == item['sha256'], path
    binding[path] = item | {'gitBytes': len(git_bytes), 'gitSha256': hashlib.sha256(git_bytes).hexdigest(),
                          'worktreeAndGitBytesIdentical': worktree == git_bytes}
(review / 'source-binding.json').write_text(json.dumps({'sourceDigest': before['digest'], 'files': binding,
    'policy': '运行工作区与 Git blob 分别绑定；Windows CRLF 不冒作 LF blob'}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
members = {path.name: path for path in temporary.iterdir() if path.is_file()}
runtime = json.loads((review / 'runtime-copies.json').read_text(encoding='utf8'))
for row in runtime['copies']:
    path = Path(row['runtimePath'])
    assert hashlib.sha256(path.read_bytes()).hexdigest() == row['runtimeSha256']
    members['runtime/' + path.name] = path
last = temporary / 'playwright/root-mixed/output/.last-run.json'
if last.exists():
    members['last-run.json'] = last
archive = review / 'checks-raw.zip'
assert not archive.exists(), '禁止覆盖已保全归档'
index = []
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
    for name, path in sorted(members.items()):
        raw = path.read_bytes()
        zipped.writestr(name, raw)
        index.append({'member': name, 'originalPath': str(path), 'bytes': len(raw),
                      'sha256': hashlib.sha256(raw).hexdigest(), 'crc32': zipped.getinfo(name).CRC})
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    for member in index:
        assert zipped.read(member['member']) == Path(member['originalPath']).read_bytes()
(review / 'checks-raw-index.json').write_text(json.dumps({'archive': archive.name,
    'archiveBytes': archive.stat().st_size, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'members': index, 'verifiedOriginalBytes': True,
    'excluded': ['认证 .auth/storageState、浏览器 profile、HTML reporter 构建资产、.next 缓存、trace/video；不作为验收输出']},
    ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'已保全 {len(index)} 个原字节成员及 {len(binding)} 个组合源码绑定；没有清理操作。')
