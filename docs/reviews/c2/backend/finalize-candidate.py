"""绑定本轮后端候选、实际运行输入与保全原件，不改写历史验收记录。"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/backend'
MAIN = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'
OLD = '5c870d9fe3c30736b8ce87292e1d0bf35838ae83'
SCOPE = 'b60f50712730a0acdc7406f02331cd7323a1bd7d'
UI = ['apps/web/app/attention-center.tsx', 'apps/web/app/lib/canonical-route.test.ts',
      'apps/web/app/lib/canonical-route.ts', 'apps/web/app/lib/use-authenticated-actor.test.ts',
      'apps/web/app/lib/use-authenticated-actor.ts', 'apps/web/app/login/page.tsx',
      'apps/web/e2e/attention-center.spec.ts']

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.DEVNULL)

def digest(body):
    return {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if len(sys.argv) not in [2, 3]:
    raise SystemExit('指定完整检查 run ID；端口占用时另给同源码 E2E 重跑 ID')
run = sys.argv[1]
folder = ROOT / 'docs/reviews/c2/product' / run
report = read(folder / 'results.json')
required = ['lint', 'typecheck', 'test', 'test-integration', 'test-e2e']
checks = {row['label']: row for row in report['checks']}
assert report['mode'] == 'backend'
check_receipts = {label: folder.relative_to(ROOT).as_posix() + '/results.json' for label in required}
e2e_folder = folder
if len(sys.argv) == 3:
    assert report.get('failure') == 'test-e2e failed'
    e2e_folder = ROOT / 'docs/reviews/c2/product' / sys.argv[2]
    rerun = read(e2e_folder / 'results.json')
    assert rerun['mode'] == 'root-e2e' and 'failure' not in rerun
    checks['test-e2e'] = next(row for row in rerun['checks'] if row['label'] == 'test-e2e')
    check_receipts['test-e2e'] = e2e_folder.relative_to(ROOT).as_posix() + '/results.json'
else:
    assert 'failure' not in report
assert all(checks[label]['exitCode'] == 0 for label in required)
proof = checks['test-e2e']['sourceAfter']
assert all(checks[label]['sourceBefore'] == proof == checks[label]['sourceAfter'] for label in required)
sources = read(e2e_folder / proof['path'])
assert digest((e2e_folder / proof['path']).read_bytes()) == {key: proof[key] for key in ['bytes', 'sha256']}
subprocess.run(['git', 'add', '--all'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
assert subprocess.run(['git', 'merge-base', '--is-ancestor', OLD, 'HEAD'], cwd=ROOT).returncode == 0
assert subprocess.run(['git', 'merge-base', '--is-ancestor', MAIN, 'HEAD'], cwd=ROOT).returncode == 0
approved_plan = []
for name in ['docs/plan/c2-wecom/implementation-plan.md', 'docs/plan/c2-wecom/product-design.md']:
    oid = git('rev-parse', ':' + name).decode().strip()
    approved_oid = git('rev-parse', '178ac8cb297a78ea830f23845aa1d59972cca149:' + name).decode().strip()
    assert oid == approved_oid
    approved_plan.append({'path': name, 'approvedHead': '178ac8cb297a78ea830f23845aa1d59972cca149', 'oid': oid, 'unchanged': True})
ui = []
for name in UI:
    oid = git('rev-parse', ':' + name).decode().strip()
    main_oid = git('rev-parse', MAIN + ':' + name).decode().strip()
    assert oid == main_oid, name
    ui.append({'path': name, 'mainOid': main_oid, 'candidateOid': oid, 'identical': True})
assert not (ROOT / 'apps/web/e2e/wecom-notifications.spec.ts').exists()
assert git('diff', '--cached', '--name-only', MAIN, '--', 'apps/web').decode().splitlines() == ['apps/web/e2e/wecom-backend-compatibility.spec.ts']

# cat-file --batch 实读索引 blob 原字节，避免 Windows archive 换行转换。
objects = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
blob_rows = []
staged = {line.split('\t', 1)[1]: line.split()[1] for line in git('ls-files', '-s').decode().splitlines()}
for row in sources:
    body = (ROOT / row['path']).read_bytes()
    assert digest(body) == {'bytes': row['worktreeBytes'], 'sha256': row['worktreeSha256']}, row['path']
    oid = staged[row['path']]
    assert oid == row['filteredGitOid'], row['path']
    objects.stdin.write((oid + '\n').encode()); objects.stdin.flush()
    header = objects.stdout.readline().decode().strip().split()
    assert header[0] == oid and header[1] == 'blob'
    blob = objects.stdout.read(int(header[2])); assert objects.stdout.read(1) == b'\n'
    try:
        body.decode('utf-8'); encoding = 'UTF-8 BOM' if body.startswith(b'\xef\xbb\xbf') else 'UTF-8'
    except UnicodeDecodeError:
        encoding = '二进制原字节'
    blob_rows.append({'path': row['path'], 'encoding': encoding, 'lineEndings': {'worktreeCrlf': body.count(b'\r\n'), 'worktreeLf': body.count(b'\n'), 'gitCrlf': blob.count(b'\r\n'), 'gitLf': blob.count(b'\n')}, 'worktree': digest(body), 'gitBlob': {'oid': oid, **digest(blob)}, 'identity': '一致' if blob == body else '工作树/Git 换行转换，分列原字节'})
objects.stdin.close(); assert objects.wait() == 0
write(BASE / 'tested-source-blobs.json', blob_rows)

changed = git('diff', '--cached', '--name-only', MAIN).decode().splitlines()
product_paths = [name for name in changed if not name.startswith('docs/')]
hunks = []
for name in product_paths:
    patch = git('diff', '--cached', '--no-ext-diff', '--binary', MAIN, '--', name)
    oid = git('rev-parse', ':' + name).decode().strip()
    old_result = subprocess.run(['git', 'rev-parse', '--verify', OLD + ':' + name], cwd=ROOT, capture_output=True)
    old_oid = old_result.stdout.decode().strip() if old_result.returncode == 0 else None
    hunks.append({'path': name, 'candidateOid': oid, 'oldOid': old_oid, 'sameAsPreservedOld': oid == old_oid,
                  'functionalHunk': digest(patch), 'origin': '当前 main 重生 Worker zod 锁增量' if name == 'pnpm-lock.yaml' else '本轮 main 消费者兼容测试' if name.endswith('wecom-backend-compatibility.spec.ts') else '受控旧后端功能切片，包含 merge-head quota 修复'})
patch = git('diff', '--cached', '--no-ext-diff', '--binary', MAIN, '--', *product_paths)
with zipfile.ZipFile(BASE / 'backend-candidate.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('backend-candidate.patch', patch)
assert not any(name.startswith(('.github/', 'scripts/', 'apps/mcp/', 'packages/contracts/')) or name in ['OPENAPI.yaml', 'SCHEMA.sql'] for name in product_paths)
assert git('diff', '--cached', '--name-only', OLD, '--', 'apps/api', 'apps/worker', 'packages/db/src/channel-notifications.ts') == b''

archives = []
for path in sorted((ROOT / 'docs/reviews/c2').rglob('*.zip')):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None, str(path)
        members = [{'member': entry.filename, 'crc32': f'{entry.CRC:08x}', **digest(z.read(entry.filename))} for entry in z.infolist()]
    archives.append({'path': path.relative_to(ROOT).as_posix(), **digest(path.read_bytes()), 'crc': '通过', 'members': members})
write(BASE / 'archive-integrity.json', archives)
preservation = read(BASE / 'preservation.json')
assert digest((BASE / 'historical-spec-chief.md').read_bytes()) == {key: preservation['oldSpecCopy'][key] for key in ['bytes', 'sha256']}
current_spec = next(row for row in preservation['entries'] if row['path'] == 'current-spec.md')
assert digest((BASE / 'current-spec.md').read_bytes()) == {key: current_spec[key] for key in ['bytes', 'sha256']}
with zipfile.ZipFile(BASE / 'preserved-source.zip') as z:
    for entry in preservation['entries']:
        assert digest(z.read(entry['member'])) == {key: entry[key] for key in ['bytes', 'sha256']}

with zipfile.ZipFile(folder / 'raw-logs.zip') as z:
    for row in report['checks']:
        assert digest(z.read(row['label'] + '.log')) == {'bytes': row['rawLogBytes'], 'sha256': row['rawLogSha256']}
cleanup = read(ROOT / 'docs/reviews/c2/product/temporary-cleanup.json')
old_cleanup = json.loads(git('show', OLD + ':docs/reviews/c2/product/temporary-cleanup.json'))
assert cleanup[:len(old_cleanup)] == old_cleanup

coverage = read(BASE / 'coverage.json')
receipt = folder.relative_to(ROOT).as_posix() + '/results.json'
for category in coverage['nineCategories']:
    category['status'] = '本轮适用用例实际检查通过；旧 UI 仍延后' if category['applicable'] else '明确不适用，不计通过'
    for case in category.get('cases', []): case['currentReceipt'] = receipt
for original in coverage['sixOriginalTests']:
    original['currentReceipt'] = receipt if original['original'] != 6 else None
    if original['original'] in [2, 3, 4, 5]: original['e2eReceipt'] = check_receipts['test-e2e']
coverage['result'] = '本轮五项必需检查通过；新候选独审/最新 CI/main/Chief 仍待齐'
coverage['candidateChecks'] = {'receipt': receipt, 'e2eReceipt': check_receipts['test-e2e'], 'source': proof, 'scope': '后端及 main 原消费者；不表示旧 UI 已接受'}
write(BASE / 'coverage.json', coverage)
verification = {
    'recordedAt': datetime.now(timezone.utc).isoformat(), 'inputMain': MAIN, 'preservedOldHead': OLD, 'scopeFirstHead': SCOPE,
    'candidateOutputHead': None, 'outputHeadReason': '提交尚未生成，精确输出由平台推送回执给出；不自引用反复提交',
    'source': proof, 'testedGitBlobs': 'tested-source-blobs.json', 'archives': 'archive-integrity.json',
    'functionalHunks': hunks, 'candidatePatch': {'archive': 'backend-candidate.zip', 'member': 'backend-candidate.patch', **digest(patch)},
    'approvedProductPlan': approved_plan, 'deferredUi': ui, 'removedFromCandidateOnly': 'apps/web/e2e/wecom-notifications.spec.ts；旧原件在可达旧 HEAD 与 preserved-source.zip',
    'requiredChecks': [{**checks[label], 'receipt': check_receipts[label]} for label in required],
    'currentConsumerLimitation': '未登录打开链接后，main 登录成功回首页并丢失事项定位；须重新打开链接。新 returnTo/焦点/视觉正式延后，未接受',
    'cleanup': {'receipt': 'docs/reviews/c2/product/temporary-cleanup.json', 'historicalPrefixUnchanged': True, 'currentRuns': [row for row in cleanup if row['run'].startswith('20261009T04')]},
    'gate': {'independentNewCandidateReview': '待定向独审', 'latestRequiredCi': '待新候选推送', 'actualMain': '尚未合入', 'chiefConfirmation': '待必需门禁齐后确认'},
    'scope': {'migrations': False, 'newRoutesEventsPermissions': False, 'realWecomSends': False, 'uiAcceptance': '延后，不属于本轮 DoD'},
}
write(BASE / 'verification.json', verification)
print(json.dumps({'sourceFiles': len(blob_rows), 'archives': len(archives), 'hunks': len(hunks), 'requiredChecks': len(required)}, ensure_ascii=False))
