"""绑定本轮实际回执并核验暂存字节；既有检查与首次失败保持历史含义。"""
import hashlib
import json
import re
from pathlib import Path
import subprocess
import sys
import zipfile
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/product'
OUT = Path(__file__).resolve().parent
INPUT_HEAD = '61736fa2298279f76642309ee2e2478439258f80'
MAIN = '74f247f9240eaf21e74ef248f71a445c1d4276d7'
FIRST_RUN = '20261008T165543Z-057421'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def digest(body):
    return hashlib.sha256(body).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.DEVNULL)

def relative(path):
    return path.relative_to(ROOT).as_posix()

def stamp():
    return datetime.now(timezone.utc).isoformat()

runs = [(path, read(path)) for path in sorted(BASE.glob('*/results.json')) if path.parent.name >= FIRST_RUN]
assert all(row.get('finishedAt') for _, row in runs), '不得归档仍活动的检查'
required = []
for label in ['lint', 'typecheck', 'test', 'test-integration', 'test-e2e']:
    matches = [(path, check) for path, row in runs for check in row['checks'] if check['label'] == label and check['exitCode'] == 0]
    assert matches, label
    path, check = matches[-1]
    assert check['sourceBefore'] == check['sourceAfter'], label
    required.append({**check, 'receipt': relative(path)})
assert len({row['sourceAfter']['sha256'] for row in required}) == 1, '五项检查必须同源码'
source = required[-1]['sourceAfter']
proof_path = ROOT / required[-1]['receipt']
proof = read(proof_path.parent / source['path'])
green = [(path, row, check) for path, row in runs for check in row['checks'] if check['label'] == 'quota-regression' and check['exitCode'] == 0][-1]
assert green[2]['sourceBefore'] == green[2]['sourceAfter'] == source

note = {
    'recordedAt': stamp(), 'inputHead': INPUT_HEAD, 'actualMainInput': MAIN,
    'mainSource': {'tool': 'git', 'projectId': 'DzkLDn6UW-IbfoTJzN9Ro', 'args': ['ls-remote', 'origin', 'refs/heads/main'], 'result': MAIN, 'observationTime': None, '说明': '本轮实读精确 ref；工具未提供响应时间，非 origin/main 或 FETCH_HEAD 推断'},
    'mainDifference': '相对 18252ba 仅新增 19 份清理证据，已正常整合；未变更 C3/A1/C1 产品语义',
    'fix': '首次检测 state/quota 丢失时，在冷却提前返回之前原子恢复 quota sentinel；同一次丢失不再次改 epoch 或 ready。保留全局旧许可失效、D+60 与完成+60 额度语义。',
    'file': 'apps/worker/src/wecom-notifications.ts',
    'case': {'file': 'apps/api/integration/wecom-notifications.integration.test.ts', 'name': 'quota 丢失只触发一次冷却：多 Worker 重试不延期，120 秒后两个目标恢复且旧许可失效', 'matrixIds': ['R1-16-1', 'R1-16-8', 'R1-16-9'], 'receipt': relative(green[0]), 'result': '真实 Redis Lua 通过；仅 TIME 替换为受控时钟，serial TTL 到期单独模拟；保留原生 Redis TIME 用例'},
    'requiredChecks': required,
    'summaries': {row['label']: [line.strip() for line in (ROOT / row['receipt']).parent.joinpath(row['label'] + '.log').read_text(encoding='utf-8').splitlines() if re.search(r'\b(?:Test Files|Tests\s|\d+ passed \()', line)] for row in required if row['label'] in ['test-integration', 'test-e2e']},
    'source': source,
    'failures': [{'receipt': relative(path), 'failure': row.get('failure'), 'meaning': '原实现回归首败' if path.parent.name == FIRST_RUN else '保留本轮真实失败，不算通过'} for path, row in runs if row.get('failure')],
    'assertionCorrections': '第二轮失败来自忽略既有 retryAfterMs 最小 100ms；第三轮失败来自 node-redis 将 inf score 解为 NaN。断言改为遵守最小退避、检查实际 sentinel 成员，许可余量验证包含往返耗时；所有原回执及受测指纹不改写。',
    'history': '61736fa 的五项绿色、首败原件与归档缺口均为旧源码证据；不冒作本轮修订验收。已审产品方案原样保留。',
    'scope': '仅频控恢复修复及补测；无迁移、新 API/事件、权限/CI 变更或真实外发。UI 产品文件未变，原视觉停点仍待 Chief。',
    'gates': {'independentReview': '待本轮成果复审', 'requiredCI': '待最新 PR 实际检查', 'actualMain': '尚未合入产品，不宣称整卡验收', 'chiefConfirmation': '待'},
    'runs': [relative(path) for path, _ in runs],
}
write(OUT / 'verification.json', note)

# 只追加当前修订字段，不将旧绿色/历史矩阵重写为本轮测试结果。
pointer = {'review': 'docs/reviews/c2/quota-recovery/review.md', 'verification': 'docs/reviews/c2/quota-recovery/verification.json', 'inputHead': INPUT_HEAD, 'actualMainInput': MAIN, 'case': note['case'], 'status': '本轮五项必需本机检查通过；待独审/latest CI/actual main/Chief'}
for name in ['docs/plan/c2-wecom/test-coverage.json', 'docs/reviews/c2/product/verification.json']:
    path = ROOT / name; value = read(path); value['currentQuotaRecovery'] = pointer; write(path, value)
for name, collection in [('docs/plan/activation-task-specs/index.json', 'tasks'), ('docs/reviews/r1/test-coverage.json', 'features')]:
    path = ROOT / name; value = read(path)
    next(row for row in value[collection] if row['seqNum'] == 16)['currentQuotaRecovery'] = pointer
    write(path, value)

for name, text in [
    ('docs/plan/activation-task-specs/16.md', '本轮修复 quota 丢失反复重启冷却的问题，追加真实 Redis 多 Worker/120 秒后双目标恢复及旧许可失效用例。当前回执见 [频控恢复审阅](../../reviews/c2/quota-recovery/review.md)。此前五项绿色保持旧源码含义；本轮新五项检查另存 currentQuotaRecovery，仍停 review。'),
    ('docs/reviews/r1/test-coverage.md', 'C2 的原六测试、九类与 DoD 保留；R1-16-1/8/9 追加真实 Redis quota 丢失后固定冷却、六路并发重试、双目标恢复和旧许可失效，当前回执见 [频控恢复审阅](../c2/quota-recovery/review.md)。'),
]:
    path = ROOT / name; text = '\n\n<!-- C2-QUOTA-RECOVERY -->\n\n' + text + '\n'
    assert '<!-- C2-QUOTA-RECOVERY -->' not in path.read_text(encoding='utf-8')
    with path.open('a', encoding='utf-8') as handle: handle.write(text)

review = f'''# C2 quota 丢失恢复复审

输入 HEAD `{INPUT_HEAD}`；本轮平台 git 实读 main `{MAIN}`，仅新增清理证据后正常整合。已审 implementation-plan/product-design 与历史原件保持不变。

## 修复与负例

`apps/worker/src/wecom-notifications.ts` 在重设 epoch/ready 的同一 Lua 操作中执行 `redis.call('ZADD', quota, '+inf', '__sentinel')`，发生在冷却提前返回之前。一次丢失因此只开启一次 120 秒冷却；新发生的丢失仍失效旧许可，额度及串行 token 原语义保持。

`apps/api/integration/wecom-notifications.integration.test.ts` 新用例使用真实 Redis 执行产品 Lua，只替换 TIME 原语。在 1/30000/60000/119999ms 六路并发重试，逐次验证 ready/epoch 不变；120000ms 两目标各只发出一个许可，旧 validate/finish 不恢复发送、不释放新 token。受控时钟不推进真实 TTL，因此仅模拟 60 秒 serial TTL 到期；原生 Redis TIME 测试仍在完整集成中运行。

## 实际验证

首败旧实现见 [回执](../product/{FIRST_RUN}/results.json)。修复后的定向回归见 [回执](../product/{green[1]['run']}/results.json)：1 通过，17 项因精确过滤未运行，不计通过。两轮补测断言纠正和下载 HTTPS 中断亦保留原始结果及日志，不覆写历史。

五项必需命令 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e` 均退出 0，各自真实命令、UTC、PID、源码前后与脱敏日志见 [verification.json](verification.json)。受测源码为 {source['files']} 文件，指纹 `{source['sha256']}`，源码前后与五项之间一致。仅 fake provider，无真实外发。UI 源码未变，原图与视觉停点保持历史含义。

复现：`python docs/reviews/c2/product/run-checks.py quota-regression` 或 `full`；前者保留独有 Redis/数据库及实际 Lua，只运行本条负例。原六验收、九类、DoD 与旧五项绿色保持原记录，当前补充映射见 currentQuotaRecovery。

## 证据与门禁

独有容器逐 ID/label 核验并清理，共享镜像与当前/恢复 worktree 保留。临时目录先保全再逐路径清理见 [回执](../product/temporary-cleanup.json)；raw ZIP 的恢复、CRC、工作树/暂存 blob 和当前全部受测源码双哈希见 [核验](checks.json)。历史首败/未知时间/回执缺口未改写。

本轮成果停 review，仍需独立复审、Chief 视觉停点、最新 PR Required CI、actual main 和最终确认。没有合并或整卡完成声明。
'''
(OUT / 'review.md').write_text(review, encoding='utf-8')
path = ROOT / 'docs/reviews/c2/product-review.md'
old = path.read_text(encoding='utf-8')
assert '<!-- C2-QUOTA-RECOVERY -->' not in old
path.write_text(old.replace('## 验证与复现', '## 验证与复现（61736fa 历史受测源码）', 1).replace('当前 main 输入为', '上一轮 main 输入为', 1).rstrip() + '\n\n<!-- C2-QUOTA-RECOVERY -->\n\n## 当前频控恢复修订\n\n本轮 quota 丢失恢复及真实 Redis 负例见 [当前复审](quota-recovery/review.md)。上文旧绿色/源码指纹/首败保持历史含义，本轮五项检查及最新 main 输入另存独立回执；独审与最终门禁仍待。\n', encoding='utf-8')

subprocess.run(['git', 'add', '--all'], cwd=ROOT, check=True, stderr=subprocess.DEVNULL)
manifest_path = ROOT / 'docs/plan/c2-wecom/MANIFEST.json'
manifest = read(manifest_path)
manifest['currentQuotaRecovery'] = {'recordedAt': stamp(), 'inputHead': INPUT_HEAD, 'main': MAIN, 'verification': 'docs/reviews/c2/quota-recovery/verification.json', '说明': '仅当前可变文档重新登记字节；原生成时序、历史原件和输入不改写'}
for row in manifest['files']:
    body = (ROOT / row['path']).read_bytes()
    oid = git('rev-parse', ':' + row['path']).decode().strip()
    blob = git('cat-file', 'blob', oid)
    row['worktree'] = {'bytes': len(body), 'sha256': digest(body)}
    row['gitBlob'] = {'bytes': len(blob), 'sha256': digest(blob), 'oid': oid}
    row['identity'] = '字节一致' if body == blob else 'Git 换行转换；工作树/Git 各自哈希分别保留'
write(manifest_path, manifest)
subprocess.run(['git', 'add', '--all'], cwd=ROOT, check=True, stderr=subprocess.DEVNULL)

checks = {'startedAt': stamp(), 'inputHead': INPUT_HEAD, 'main': MAIN, 'commands': []}
for args in [
    ['node', 'docs/plan/c2-wecom/verify-archive.mjs'],
    ['git', 'diff', '--cached', '--check', MAIN],
    ['git', 'diff', '--cached', '--check', '5b9c76b5f79917697906520edcd6947bfbfa925f'],
    ['git', 'diff', '--cached', '--exit-code', INPUT_HEAD, '--', '.github', 'scripts/ci-policy.mjs', 'apps/web', 'packages', 'SCHEMA.sql', 'OPENAPI.yaml', 'docs/plan/c2-wecom/implementation-plan.md', 'docs/plan/c2-wecom/product-design.md'],
]:
    start = stamp(); result = subprocess.run(args, cwd=ROOT, capture_output=True)
    checks['commands'].append({'command': args, 'startedAt': start, 'finishedAt': stamp(), 'exitCode': result.returncode, 'stdout': result.stdout.decode('utf-8', errors='replace'), 'stderr': result.stderr.decode('utf-8', errors='replace')})
    write(OUT / 'checks.json', checks)
    assert result.returncode == 0, args

index = {line.split('\t', 1)[1]: line.split('\t', 1)[0].split()[1] for line in git('ls-files', '-s').decode().splitlines()}
objects = subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(row['filteredGitOid'] for row in proof) + '\n').encode(), cwd=ROOT)
position = 0; rows = []
for row in proof:
    end = objects.index(b'\n', position); oid, kind, size = objects[position:end].decode().split(); size = int(size)
    blob = objects[end + 1:end + 1 + size]; position = end + size + 2
    body = (ROOT / row['path']).read_bytes()
    assert kind == 'blob' and oid == index[row['path']] == row['filteredGitOid'] and digest(body) == row['worktreeSha256'], row['path']
    assert hashlib.sha1(f'blob {len(blob)}\0'.encode() + blob).hexdigest() == oid
    rows.append({'path': row['path'], 'worktree': {'bytes': len(body), 'sha256': digest(body)}, 'gitBlob': {'oid': oid, 'bytes': len(blob), 'sha256': digest(blob)}, 'identity': body == blob})
assert position == len(objects)
write(OUT / 'tested-source-git-bytes.json', rows)
checks['source'] = {'files': len(rows), 'sha256': source['sha256'], 'result': '逐文件工作树与实际暂存 Git blob 核对通过', 'index': 'tested-source-git-bytes.json'}

archives = []
for path, row in runs:
    for item in path.parent.glob('*.zip'):
        with zipfile.ZipFile(item) as archive:
            assert archive.testzip() is None, item
            members = [{'path': member.filename, 'crc32': member.CRC, 'bytes': member.file_size, 'sha256': digest(archive.read(member))} for member in archive.infolist()]
        assert git('show', ':' + relative(item)) == item.read_bytes(), item
        archives.append({'path': relative(item), 'bytes': item.stat().st_size, 'sha256': digest(item.read_bytes()), 'crc': '通过', 'gitBlobIdentity': True, 'members': members})
        if item.name == 'raw-logs.zip':
            by_name = {member['path']: member for member in members}
            for check in row['checks']:
                raw = by_name[check['label'] + '.log']
                assert raw['bytes'] == check['rawLogBytes'] and raw['sha256'] == check['rawLogSha256']
checks['archives'] = archives
cleanup = read(BASE / 'temporary-cleanup.json')
checks['cleanup'] = [row for row in cleanup if row['run'] >= FIRST_RUN]
assert all(row['removed'] and not Path(row['path']).exists() for row in checks['cleanup'])
old_cleanup = json.loads(git('show', INPUT_HEAD + ':docs/reviews/c2/product/temporary-cleanup.json'))
assert cleanup[:len(old_cleanup)] == old_cleanup, '历史逐路径回执不得改写'
old_paths = set(git('ls-tree', '-r', '--name-only', INPUT_HEAD, '--', 'docs/reviews/c2/product').decode().splitlines())
changed_paths = set(git('diff', '--cached', '--name-only', INPUT_HEAD, '--', 'docs/reviews/c2/product').decode().splitlines())
assert old_paths & changed_paths <= {'docs/reviews/c2/product/run-checks.py', 'docs/reviews/c2/product/temporary-cleanup.json', 'docs/reviews/c2/product/verification.json'}, '旧原件或首败被改写'
old_verification = json.loads(git('show', INPUT_HEAD + ':docs/reviews/c2/product/verification.json'))
current_verification = read(BASE / 'verification.json')
assert {key: value for key, value in current_verification.items() if key != 'currentQuotaRecovery'} == old_verification
checks['history'] = '旧产品证据、原始 ZIP、源码指纹及逐路径回执保持不变；仅 runner、追加清理记录和当前修订指针可变'
product_changes = {name for name in git('diff', '--cached', '--name-only', INPUT_HEAD, '--', 'apps', 'packages').decode().splitlines()}
assert product_changes == {'apps/worker/src/wecom-notifications.ts', 'apps/api/integration/wecom-notifications.integration.test.ts'}
checks['productScope'] = sorted(product_changes)
changed = git('diff', '--cached', '--name-only', MAIN).decode().splitlines()
for name in changed:
    path = ROOT / name
    if name.endswith('.json') and path.exists(): read(path)
checks['finishedAt'] = stamp(); checks['result'] = '通过；不替代独审/latest CI/actual main'
write(OUT / 'checks.json', checks)
print('本轮频控恢复回执、当前矩阵、实际 Git 字节和 ZIP CRC 已绑定；停 review')
