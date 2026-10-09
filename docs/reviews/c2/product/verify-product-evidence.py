"""只读复验实际受测源码、索引 blob 和归档；写入当前核验记录，不改产品或门禁。"""
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = Path(__file__).resolve().parents[4]
BASE = Path(__file__).resolve().parent

def now():
    return datetime.now(timezone.utc).isoformat()

def sha(body):
    return hashlib.sha256(body).hexdigest()

def write(name, value):
    (BASE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

report = {'startedAt': now(), 'checks': [], 'gate': '仅本机与归档核验；独审、视觉停点、当前 Required CI 和 actual main 尚待完成'}
commands = [
    ['node', '--version'],
    ['node', 'docs/plan/c2-wecom/verify-archive.mjs'],
    ['git', 'diff', '--cached', '--check', '18252ba8761aa810c3fd12d31ecae83e8b24d985'],
    ['git', 'diff', '--cached', '--exit-code', '18252ba8761aa810c3fd12d31ecae83e8b24d985', '--', '.github/workflows/ci.yml', 'apps/worker/integration/stage4-automation.integration.test.ts'],
]
for args in commands:
    started = now()
    result = subprocess.run(args, cwd=ROOT, capture_output=True)
    report['checks'].append({'command': args, 'startedAt': started, 'finishedAt': now(), 'exitCode': result.returncode,
                             'stdout': result.stdout.decode('utf-8', errors='replace'), 'stderr': result.stderr.decode('utf-8', errors='replace')})
    if result.returncode:
        write('final-checks.json', report)
        raise SystemExit(result.returncode)

changed = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '18252ba8761aa810c3fd12d31ecae83e8b24d985'], cwd=ROOT).decode().splitlines()
json_paths = [name for name in changed if name.endswith('.json') and (ROOT / name).is_file()]
for name in json_paths:
    json.loads((ROOT / name).read_text(encoding='utf-8-sig'))
report['jsonChecks'] = {'files': len(json_paths), 'result': '通过'}

verified = []
for name in ['docs/plan/c2-wecom/implementation-plan.md', 'docs/plan/c2-wecom/product-design.md']:
    approved = subprocess.check_output(['git', 'show', '178ac8cb297a78ea830f23845aa1d59972cca149:' + name], cwd=ROOT)
    staged = subprocess.check_output(['git', 'show', ':' + name], cwd=ROOT)
    assert approved == staged, name
    verified.append({'path': name, 'approvedHead': '178ac8cb297a78ea830f23845aa1d59972cca149', 'gitBlobSha256': sha(staged), 'unchanged': True})
report['approvedDesign'] = verified

verification = json.loads((BASE / 'verification.json').read_text(encoding='utf-8'))
e2e = ROOT / next(check['receipt'] for check in verification['current']['requiredChecks'] if check['label'] == 'test-e2e')
data = json.loads(e2e.read_text(encoding='utf-8'))
source = next(check['sourceAfter'] for check in data['checks'] if check['label'] == 'test-e2e')
proof = json.loads((e2e.parent / source['path']).read_text(encoding='utf-8'))
index = {line.split('\t', 1)[1]: line.split('\t', 1)[0].split()[1] for line in subprocess.check_output(['git', 'ls-files', '-s'], cwd=ROOT).decode().splitlines()}
objects = subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(row['filteredGitOid'] for row in proof) + '\n').encode(), cwd=ROOT)
position = 0
rows = []
for row in proof:
    end = objects.index(b'\n', position)
    oid, kind, size = objects[position:end].decode().split()
    size = int(size)
    body = objects[end + 1:end + 1 + size]
    position = end + size + 2
    current = (ROOT / row['path']).read_bytes()
    assert kind == 'blob' and oid == row['filteredGitOid'] == index[row['path']] and sha(current) == row['worktreeSha256'], row['path']
    assert hashlib.sha1(f'blob {len(body)}\0'.encode() + body).hexdigest() == oid
    try:
        current.decode('utf-8')
        encoding = 'UTF-8（含 BOM）' if current.startswith(b'\xef\xbb\xbf') else 'UTF-8'
    except UnicodeDecodeError:
        encoding = '二进制原字节'
    rows.append({'path': row['path'], 'worktree': {'bytes': len(current), 'sha256': sha(current), 'encoding': encoding},
                 'gitBlob': {'oid': oid, 'bytes': len(body), 'sha256': sha(body)}, 'identity': current == body})
assert position == len(objects)
write('tested-source-git-bytes.json', rows)
report['testedSource'] = {'files': len(rows), 'fingerprint': source['sha256'], 'actualIndexedBlobCheck': '通过', 'index': 'tested-source-git-bytes.json'}

zip_count = 0
for path in BASE.rglob('*.zip'):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, path
    assert subprocess.check_output(['git', 'show', ':' + path.relative_to(ROOT).as_posix()], cwd=ROOT) == path.read_bytes(), path
    zip_count += 1
report['zipChecks'] = {'archives': zip_count, 'crc': '通过', 'worktreeVsGitBlob': '逐 ZIP 字节一致'}
cleanup = json.loads((BASE / 'temporary-cleanup.json').read_text(encoding='utf-8'))
assert all(row.get('removed') and not Path(row['path']).exists() for row in cleanup)
report['temporaryPaths'] = {'records': len(cleanup), 'allAbsent': True, 'result': '逐路径回执见 temporary-cleanup.json；此处只读确认不存在'}
review = (ROOT / 'docs/reviews/c2/product-review.md').read_text(encoding='utf-8')
for target in re.findall(r'\]\(([^)]+)\)', review):
    if not re.match(r'[a-z]+:', target):
        assert (ROOT / 'docs/reviews/c2' / target.split('#')[0]).exists(), target
report['reviewLinks'] = '通过'
report['inputHead'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
report['finishedAt'] = now()
report['result'] = '通过'
write('final-checks.json', report)
print(json.dumps({'result': report['result'], 'sourceFiles': len(rows), 'jsonFiles': len(json_paths), 'zipArchives': zip_count, 'temporaryPaths': len(cleanup)}, ensure_ascii=False))
