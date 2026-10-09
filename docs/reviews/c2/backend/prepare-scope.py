"""先保全旧完整成果及来源，再登记后端验收范围；不摘取产品、不改历史证据。"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
OLD = '5c870d9fe3c30736b8ce87292e1d0bf35838ae83'
MAIN = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'
UI = [
    'apps/web/app/attention-center.tsx', 'apps/web/app/lib/canonical-route.test.ts',
    'apps/web/app/lib/canonical-route.ts', 'apps/web/app/lib/use-authenticated-actor.test.ts',
    'apps/web/app/lib/use-authenticated-actor.ts', 'apps/web/app/login/page.tsx',
    'apps/web/e2e/attention-center.spec.ts', 'apps/web/e2e/wecom-notifications.spec.ts',
]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.DEVNULL)

def sha(body):
    return hashlib.sha256(body).hexdigest()

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

assert git('rev-parse', 'HEAD').decode().strip() == OLD
assert not git('status', '--porcelain').decode().strip().replace('?? docs/reviews/c2/backend/', '').strip()
sources = {'recordedAt': datetime.now(timezone.utc).isoformat(), 'oldHead': OLD, 'main': MAIN,
    'mainSource': {'tool': 'git', 'projectId': 'DzkLDn6UW-IbfoTJzN9Ro', 'args': ['ls-remote', 'origin', 'refs/heads/main'], 'result': MAIN},
    'sourceMessage': {'todoId': 'kjOs4t_DtMyrkHTBFmpQ5', 'messageTime': '2026-10-09T04:06:19Z', 'documentVersion': None, 'documentGeneratedAt': None,
        '说明': 'Chief 本轮 message 交付完整旧正文，已逐段对照旧 product-spec；工具 conversation 旧正文截断，仅作消息顺序/时间佐证，未冒作工具完整取得'},
    'entries': [], 'ui': UI, 'rawArchive': 'preserved-source.zip',
    'history': '保留旧 head 及全部祖先可达，不 force-push；原 UI 源码、失败/trace ZIP、视觉和频控复审均在旧 Git 与本候选原历史 docs 可恢复，不将旧绿色借给新候选'}
members = {}
def preserve(path, role, body):
    digest = sha(body); member = digest + '.bin'; members[member] = body
    sources['entries'].append({'path': path, 'role': role, 'bytes': len(body), 'sha256': digest, 'member': member})

# 与本次 Chief 注入正文逐段一致。原正文边界止于最后句，不包含反馈闭标签或分隔空行。
old_spec = git('show', OLD + ':docs/reviews/c2/product-spec.md').decode('utf-8').removesuffix('\n').encode('utf-8')
preserve('historical-spec-chief.md', 'Chief 完整旧正文；UTF-8/LF，不含正文后分隔 LF', old_spec)
(OUT / 'historical-spec-chief.md').write_bytes(old_spec + b'\n')
sources['oldSpecCopy'] = {'path': 'historical-spec-chief.md', 'bytes': len(old_spec)+1, 'sha256': sha(old_spec+b'\n'), 'copyBoundary': '原正文后仅补一个 LF，raw ZIP 单独保留正文边界原字节', 'historicalOriginSha256': 'd10a822ffae21cb94fcce3f9c7c198845bb3f3380358c5915ad5dea9673968fd'}
for name in UI:
    preserve(name, '旧 HEAD Git blob', git('show', OLD + ':' + name))
    preserve(name, '旧工作树字节', (ROOT / name).read_bytes())
    exists = subprocess.run(['git', 'cat-file', '-e', MAIN + ':' + name], cwd=ROOT, capture_output=True).returncode == 0
    if exists: preserve(name, 'main 消费者 Git blob', git('show', MAIN + ':' + name))
for name in ['apps/worker/src/wecom-notifications.ts', 'apps/api/integration/wecom-notifications.integration.test.ts', 'docs/plan/c2-wecom/implementation-plan.md', 'docs/plan/c2-wecom/product-design.md', 'docs/plan/c2-wecom/test-coverage.json']:
    preserve(name, '旧 HEAD 精确源；包含 head 自身 quota 修复', git('show', OLD + ':' + name))
preserve('current-spec.md', '本轮平台注入完整当前 spec；可读文件 UTF-8/LF，末尾一个 LF', (OUT / 'current-spec.md').read_bytes())
preserve('docs/plan/backend-agent-mcp-priority/branch-separation.md', '已合 main 分离方案', git('show', MAIN + ':docs/plan/backend-agent-mcp-priority/branch-separation.md'))
first_parent = git('rev-parse', OLD + '^1').decode().strip()
head_patch = git('diff', '--binary', first_parent, OLD, '--', 'apps/worker/src/wecom-notifications.ts', 'apps/api/integration/wecom-notifications.integration.test.ts')
preserve('quota-head-first-parent.patch', 'merge head 自身增量；不能用 no-merges 漏掉', head_patch)
backend_patch = git('diff', '--binary', MAIN, OLD, '--', '.env.example', '.env.lite.example', 'apps/api', 'apps/worker', 'packages/db/src/channel-notifications.ts', 'docker-compose.yml', 'docker-compose.lite.yml', 'docker-compose.production.yml', 'pnpm-lock.yaml')
preserve('backend-functional-input.patch', '逐功能核验后的后端源差异；不含 UI', backend_patch)
sources['retainedEvidence'] = []
for row in git('ls-tree', '-r', '-l', OLD, '--', 'docs/reviews/c2', 'docs/plan/c2-wecom').decode().splitlines():
    fields, name = row.split('\t', 1); _, kind, oid, size = fields.split()
    if kind != 'blob': continue
    body = git('cat-file', 'blob', oid)
    sources['retainedEvidence'].append({'path': name, 'head': OLD, 'oid': oid, 'bytes': int(size), 'sha256': sha(body), 'reason': '旧方案/规格/首次失败/频控修复/视觉未验收与清理缺口原件继续保留'})
with zipfile.ZipFile(OUT / 'preserved-source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, body in members.items(): archive.writestr(name, body)
with zipfile.ZipFile(OUT / 'preserved-source.zip') as archive:
    assert archive.testzip() is None
    for entry in sources['entries']: assert sha(archive.read(entry['member'])) == entry['sha256']
sources['rawArchiveBytes'] = (OUT / 'preserved-source.zip').stat().st_size
sources['rawArchiveSha256'] = sha((OUT / 'preserved-source.zip').read_bytes())
sources['rawArchiveMembers'] = len(members)
write(OUT / 'preservation.json', sources)

six = [
    {'original': 1, 'status': '本轮保留', 'cases': ['apps/worker/src/wecom-notifications.test.ts', 'apps/api/integration/wecom-notifications.integration.test.ts'], 'assertions': '协议、4096 UTF-8、错误、频控、timeout、epoch/quota 恢复/未知截止'},
    {'original': 2, 'status': '后端 URL/当前 main 兼容保留；新 UI 延后未验收', 'cases': ['apps/worker/src/wecom-notifications.test.ts', 'apps/web/e2e/wecom-backend-compatibility.spec.ts'], 'assertions': '生成 HTTPS canonical URL 与 main canonicalObjectHref 一致；当前 Human 重鉴权。returnTo/焦点/BackForward 新 UI 完整保全，不计通过'},
    {'original': 3, 'status': '后端保留；main 现有转发拒绝边界兼容', 'cases': ['apps/api/integration/wecom-notifications.integration.test.ts', 'apps/web/e2e/wecom-backend-compatibility.spec.ts'], 'assertions': '撤权/停用/离队/Stop/checkpoint 前零外发；不同当前 Human 同一 URL 的详情 GET 拒绝，有权正对照'},
    {'original': 4, 'status': '本轮保留', 'cases': ['apps/api/integration/wecom-notifications.integration.test.ts', 'apps/web/e2e/wecom-backend-compatibility.spec.ts'], 'assertions': 'decision events/outbox 不增加；渠道只提醒'},
    {'original': 5, 'status': '后端及 main 现有读接口保留；新视觉延后', 'cases': ['apps/api/integration/notification-channels.integration.test.ts', 'apps/api/integration/wecom-notifications.integration.test.ts', 'apps/web/e2e/wecom-backend-compatibility.spec.ts'], 'assertions': 'C1 本人目标管理与对账复用；无提供方时 main 网页/接口仍可读，不将 configured 投影当 ready'},
    {'original': 6, 'status': '明确不适用', 'cases': [], 'assertions': '本协议只有 Worker 出站 HTTPS POST，没有入站回调、签名、时窗、身份绑定或解绑系统；无假通过'},
]
old_matrix = read(ROOT / 'docs/plan/c2-wecom/test-coverage.json')['currentProductExecution']['matrix']
matrix = []
for row in old_matrix:
    backend_cases = [case for case in row['cases'] if not case['file'].startswith('apps/web/')]
    matrix.append({'id': row['id'], 'category': row['category'], 'applicable': row.get('applicable', True), 'cases': backend_cases, 'ui': '旧 UI 用例延后，原始源码/失败/未接受保全；当前 main consumer 兼容另验', 'status': '新候选未运行'})
coverage = {'scope': '企业微信低敏出站后端独立候选', 'sixOriginalTests': six, 'nineCategories': matrix, 'compatibility': 'main 页面消费者识别生成 URL，已有会话可读/转发拒绝；未登录后丢失定位记录为限制，不修 UI', 'requiredChecks': ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm test:integration', 'pnpm test:e2e'], 'gates': ['新候选独审', '适用必需检查', '最新 PR Required CI', 'actual main', 'Chief 确认'], 'scopeResult': '旧 UI 视觉不是本轮 DoD；未计通过', 'result': '未运行'}
write(OUT / 'coverage.json', coverage)
pointer = {'scope': '后端独立候选；原 UI 延后未验收', 'currentSpec': 'docs/reviews/c2/backend/current-spec.md', 'specSha256': sha((OUT / 'current-spec.md').read_bytes()), 'preservation': 'docs/reviews/c2/backend/preservation.json', 'coverage': 'docs/reviews/c2/backend/coverage.json', 'oldHead': OLD, 'main': MAIN, 'result': '新候选尚未运行，旧复审不冒新组合已验收'}
for name in ['docs/plan/c2-wecom/test-coverage.json']:
    path = ROOT / name; data = read(path); data['currentBackendExecution'] = pointer; write(path, data)
for name, collection in [('docs/plan/activation-task-specs/index.json', 'tasks'), ('docs/reviews/r1/test-coverage.json', 'features')]:
    path = ROOT / name; data = read(path); next(row for row in data[collection] if row['seqNum'] == 16)['currentBackendExecution'] = pointer; write(path, data)
for name, note in [
    ('docs/plan/activation-task-specs/16.md', '用户正式收窄本轮 DoD 至后端独立交付；原 UI 未接受并延后重设计，完整当前规格、旧完整正文/配额修复/失败保全及六测试/九类去向见 ../../reviews/c2/backend/。旧视觉门禁不再阻止本轮后端收尾；新候选仍需独审、适用必需检查、最新 CI、actual main 和 Chief。'),
    ('docs/reviews/r1/test-coverage.md', 'C2 本轮仅后端及 main 既有消费者兼容；六原测试/九类拆分去向与 UI 延后未验收见 ../c2/backend/coverage.json。旧绿色/首败和原验收保持历史含义。'),
    ('docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md', '用户当前验收收窄为企业微信后端单向提醒、canonical HTTPS URL 合同与 main 现有消费者重鉴权兼容。新增登录 returnTo/401 缓存隔离/焦点/BackForward UI 未接受，原成果/失败保全后延至重设计，不作为本轮视觉 DoD。C1 授权锁/intent/attempt/fence/unknown、发送 checkpoint、频控 D+60/完成+60 与 sentinel 冷却恢复协议保持。完整范围、六原测试及九类去向见 ../reviews/c2/backend/。'),
]:
    path = ROOT / name
    with path.open('a', encoding='utf-8') as handle: handle.write('\n\n<!-- C2-BACKEND-SCOPE -->\n\n' + note + '\n')
print('完整旧来源与 UI/配额原字节保全完成；新后端 scope/六测试/九类已登记，未冒作候选验证')
