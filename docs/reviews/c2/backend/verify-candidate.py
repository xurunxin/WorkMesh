"""只读复核后端候选的提交字节、运行回执、UI 分离与无损证据。"""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/backend'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def digest(body):
    return {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.DEVNULL)

v = read(BASE / 'verification.json')
staged = {line.split('\t', 1)[1]: line.split()[1] for line in git('ls-files', '-s').decode().splitlines()}
sources = read(BASE / v['testedGitBlobs'])
process = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
for row in sources:
    assert digest((ROOT / row['path']).read_bytes()) == row['worktree']
    oid = staged[row['path']]; assert oid == row['gitBlob']['oid']
    process.stdin.write((oid + '\n').encode()); process.stdin.flush()
    header = process.stdout.readline().split(); assert header[1] == b'blob'
    body = process.stdout.read(int(header[2])); assert process.stdout.read(1) == b'\n'
    assert digest(body) == {key: row['gitBlob'][key] for key in ['bytes', 'sha256']}
process.stdin.close(); assert process.wait() == 0
for row in v['deferredUi']:
    assert staged[row['path']] == row['mainOid'] == row['candidateOid']
assert not (ROOT / 'apps/web/e2e/wecom-notifications.spec.ts').exists()
for archive in read(BASE / v['archives']):
    path = ROOT / archive['path']
    assert digest(path.read_bytes()) == {key: archive[key] for key in ['bytes', 'sha256']}
    assert digest(git('show', ':' + archive['path'])) == {key: archive[key] for key in ['bytes', 'sha256']}
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        for member in archive['members']:
            assert digest(z.read(member['member'])) == {key: member[key] for key in ['bytes', 'sha256']}
            assert f"{z.getinfo(member['member']).CRC:08x}" == member['crc32']
for check in v['requiredChecks']:
    report = read(ROOT / check['receipt'])
    actual = next(row for row in report['checks'] if row['label'] == check['label'])
    assert check['exitCode'] == actual['exitCode'] == 0
    assert actual['sourceBefore'] == actual['sourceAfter'] == v['source']
    with zipfile.ZipFile((ROOT / check['receipt']).parent / 'raw-logs.zip') as z:
        assert digest(z.read(check['label'] + '.log')) == {'bytes': actual['rawLogBytes'], 'sha256': actual['rawLogSha256']}
coverage = read(BASE / 'coverage.json')
assert len(coverage['sixOriginalTests']) == 6 and len(coverage['nineCategories']) == 9
assert coverage['sixOriginalTests'][-1]['currentReceipt'] is None
assert subprocess.run(['git', 'diff', '--cached', '--check', v['inputMain']], cwd=ROOT).returncode == 0
print(json.dumps({'源码 Git/工作树': len(sources), 'ZIP CRC/字节': len(read(BASE / v['archives'])), '当前 main UI 字节': len(v['deferredUi']), '必需检查': len(v['requiredChecks']), '六原测试': 6, '九类': 9, '结果': '通过'}, ensure_ascii=False))
