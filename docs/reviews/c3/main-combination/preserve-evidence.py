"""保全本轮脱敏原件；逐成员核对原字节与 CRC 后才允许清理临时路径。"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile
from datetime import datetime, timezone

review = Path(__file__).resolve().parent
root = review.parents[3]


def save(name, value):
    (review / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def read(name):
    return json.loads((review / name).read_text(encoding='utf8'))


folders = {'': 'c3-main-combination-01a11890', 'retry': 'c3-main-combination-01a11890-retry',
           'accepted': 'c3-main-combination-01a11890-accepted', 'browser': 'c3-main-combination-01a11890-browser'}
raw_source = json.loads((root / '.tmp' / folders[''] / 'source-before.json').read_text(encoding='utf8'))
files = raw_source['files']
objects = list(dict.fromkeys(item['gitBlob'] for item in files.values()))
blob_output = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=root,
                                     input=('\n'.join(objects) + '\n').encode())
blobs = {}
offset = 0
for object_id in objects:
    end = blob_output.index(b'\n', offset)
    header = blob_output[offset:end].decode().split()
    assert header[:2] == [object_id, 'blob']
    size = int(header[2])
    blobs[object_id] = blob_output[end + 1:end + 1 + size]
    offset = end + 1 + size + 1
assert offset == len(blob_output)
binding = {}
for path, item in files.items():
    data = blobs[item['gitBlob']]
    current = (root / path).read_bytes()
    assert hashlib.sha256(current).hexdigest() == item['sha256'], path
    binding[path] = {**item, 'gitBytes': len(data), 'gitSha256': hashlib.sha256(data).hexdigest(),
                     'worktreeAndGitBytesIdentical': current == data}
save('source-binding.json', {'sourceDigest': raw_source['digest'], 'files': binding,
                            'rawSourceFiles': files, 'interpretation': 'Git blob 与运行工作区字节分别记录，未混称 CRLF 与 LF'})

members = {}
for prefix, name in folders.items():
    directory = root / '.tmp' / name
    for path in directory.iterdir():
        if path.is_file():
            member = (prefix + '/' if prefix else '') + path.name
            members[member] = path
    for label in ['source-before.json', 'source-after.json']:
        data = json.loads((directory / label).read_text(encoding='utf8'))
        assert data['files'] == files and data['digest'] == raw_source['digest']
members['first-capture/source-before.json'] = root / '.tmp/c3-main-combination-first-capture/source-before.json'
for item in read('browser/runtime-copies.json')['copies']:
    path = Path(item['runtimePath'])
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item['runtimeSha256']
    members['browser/runtime/' + path.name] = path
for prefix in ['accepted', 'browser']:
    last = root / '.tmp' / folders[prefix] / 'playwright/root-mixed/output/.last-run.json'
    if last.exists():
        members[prefix + '/last-run.json'] = last

archive = review / 'checks-raw.zip'
assert not archive.exists(), '禁止覆盖已保全归档'
rows = []
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as zipped:
    for name, path in sorted(members.items()):
        data = path.read_bytes()
        zipped.writestr(name, data)
        info = zipped.getinfo(name)
        rows.append({'member': name, 'originalPath': str(path), 'bytes': len(data),
                     'sha256': hashlib.sha256(data).hexdigest(), 'crc32': info.CRC,
                     'bytePolicy': '保存后原件字节；输出捕获阶段秘密替换次数见对应 receipt，不格式化日志'})
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    for row in rows:
        assert zipped.read(row['member']) == Path(row['originalPath']).read_bytes()
save('checks-raw-index.json', {'archive': archive.name, 'archiveBytes': archive.stat().st_size,
     'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'members': rows,
     'excluded': ['认证 storageState、.auth、浏览器 profile、HTML reporter 构建资产、.next 缓存；没有测试失败截图或视频需保留'],
     'verifiedOriginalBytes': True})

def log(prefix, name):
    text = (root / '.tmp' / folders[prefix] / (name + '.log')).read_text(encoding='utf8', errors='replace')
    return re.sub(r'\x1b\[[0-9;]*m', '', text)

unit = log('', 'unit')
unit_rows = [line for line in unit.splitlines() if re.search(r'Tests\s+\d+ passed', line)]
unit_passed = sum(int(re.search(r'Tests\s+(\d+) passed', row)[1]) for row in unit_rows)
unit_skipped = sum(int(re.search(r'\|\s+(\d+) skipped', row)[1]) for row in unit_rows if re.search(r'\|\s+(\d+) skipped', row))
api = log('accepted', 'api-integration')
browser = log('browser', 'e2e-llm')
assert '171 passed | 1 skipped' in api and '3 passed' in browser
checks = []
for prefix in folders:
    checks.extend({'run': prefix or 'first', **check} for check in read((prefix + '/' if prefix else '') + 'checks.json'))
save('verification.json', {'recordedAt': datetime.now(timezone.utc).isoformat(),
     'sourceDigest': raw_source['digest'], 'productionSourceFiles': len(files), 'allCheckSourcesUnchanged': all(c['sourceUnchanged'] for c in checks),
     'unit': {'passed': unit_passed, 'skipped': unit_skipped, 'tasksSuccessful': 29, 'cached': 0,
              'skipReason': 'Worker 的两个 Linux 专属原生隔离用例，Windows 不适用'},
     'apiIntegration': {'passed': 171, 'skipped': 1, 'filesPassed': 23,
                        'skipReason': 'RUN_WORKBENCH_LIVE=0，不执行真实 MiniMax 调用',
                        'A1CombinationScenarios': 3, 'A1ReadinessCasesPassed': 14,
                        'C3PublicReadsWithValidCredentials': 9, 'C3LlmListEarlyDenials': 9},
     'formalE2e': {'listed': 3, 'passed': 3, 'skipped': 0, 'fullSuiteRerun': False,
                   'browserPortFailure': '既有端口被其他工作区占用，首次 0 用例执行；端口副本复验通过'},
     'lint': {'tasksSuccessful': 18, 'cached': 4}, 'typecheck': {'tasksSuccessful': 18, 'cached': 4},
     'routePolicy': {'routeCount': 270, 'generatedCheckExitCode': 0}, 'apiBuildExitCode': 0, 'ciValidateExitCode': 0,
     'checkCount': len(checks), 'archiveMembers': len(rows), 'rawArchiveVerified': True,
     'historicalReuse': '未变化的 DB/Worker/recovery、只读 Docker 挂载与旧 mocked 对照保留原提交验收含义，未重跑、不计本轮通过',
     'review': '本轮主线整合与新增边界断言待独审；上一 blocking 的独审通过不冒本轮组合审查',
     'requiredCi': '尚无 PR；待 Chief 经标准 merge_builds 建立最新 PR 必需 CI 门禁',
     'mergeStatus': '候选正常整合尚待平台提交；不声称合入 main'})
print(f'已保全并复核 {len(rows)} 个原字节成员，{len(files)} 个组合源码；单元 {unit_passed} 通过/{unit_skipped} 跳过。')
