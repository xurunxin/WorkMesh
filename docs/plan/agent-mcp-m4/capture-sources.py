"""只读消费不可变 Git 来源；写本卡规划来源清单，不启动服务或删除资源。"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = 'c2b3d363c037157df13beb82799d99d07a9b7db8'
FROZEN = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'

def git(*args):
    result = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, check=True)
    return result.stdout

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write_json(path, value):
    (OUT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

paths = [
    'AGENTS.md', 'CONTEXT.md', 'AGENT_PROTOCOL.md', 'OPENAPI.yaml', 'SCHEMA.sql',
    'package.json', '.node-version', '.env.example', 'docker-compose.yml', 'docker-compose.lite.yml',
    'apps/api/package.json', 'vitest.integration.config.ts', 'scripts/require-integration-env.mjs',
    'apps/api/src/operations/routes.ts', 'apps/api/src/server.ts', 'apps/api/src/commands.ts',
    'apps/api/src/live-read-authorization.ts', 'apps/api/src/authz/authorize.ts',
    'apps/api/src/agent/guard.ts',
    'apps/api/src/delivery/routes.ts', 'apps/api/src/workbench-runner.ts',
    'apps/api/src/client-profile.ts', 'apps/api/src/pagination.ts',
    'apps/api/integration/stage4-operations.integration.test.ts',
    'packages/db/src/stage4.ts', 'packages/db/src/principal-team-authority.ts',
    'packages/db/src/agent-lock-order-manifest.ts', 'packages/domain/src/stage4.ts',
    'packages/contracts/src/index.ts', 'packages/contracts/src/route-policy.ts',
    'packages/contracts/src/route-policy-bindings.ts', 'packages/contracts/src/agent-discovery.ts',
    'packages/contracts/src/agent-discovery-rules.ts',
    'packages/agent-sdk/src/index.ts', 'packages/a2a-adapter/src/index.ts',
    'apps/mcp/src/index.ts', 'apps/mcp/src/discovery.ts', 'apps/mcp/src/http.ts',
    'apps/agent-runner/src/workmesh-tools.ts', 'apps/agent-runner/src/run-session.ts',
    'apps/agent-runner/src/permission-matrix.test.ts', 'apps/agent-runner/skills/workmesh-workbench/SKILL.md',
    'packages/conformance/src/mcp-coverage.fixture.ts',
    'packages/conformance/src/planning-collaboration.fixture.ts',
    'packages/conformance/src/joint-clients.external.ts',
    'packages/conformance/src/joint-clients.drivers.ts',
    'packages/conformance/package.json', 'packages/conformance/vitest.integration.config.ts',
    'packages/conformance/tsconfig.build.json', 'vitest.config.ts',
    'scripts/ci-policy.mjs', 'scripts/ci-policy.test.mjs', '.github/workflows/ci.yml',
    'scripts/generate-runner-skill-manifest.mjs', 'scripts/generate-route-policy-artifacts.mts',
    'apps/web/app/operations-content.tsx', 'apps/web/app/operations/usage-metrics.tsx',
    'docs/plan/agent-mcp-m0/operation-decisions.json', 'docs/plan/agent-mcp-m0/domain-rules.json',
    'docs/plan/agent-mcp-m0/domain-audit.md',
    'docs/plan/agent-mcp-m5/product-current-report.md',
    'docs/plan/agent-mcp-m5/product-current-matrix.md',
    'docs/plan/agent-mcp-m5/product-pr-ci-report.md',
    'docs/plan/agent-mcp-m5/product-resources-current.md',
    'docs/reviews/cleanup/2026-10-11-worktrees/report.md',
    'docs/reviews/cleanup/2026-10-11-worktrees/followup/report.md',
    'docs/reviews/cleanup/2026-10-11-worktrees/continuation/report.md',
    'docs/reviews/cleanup/2026-10-11-worktrees/mechanism.md',
    'docs/reviews/cleanup/2026-10-11-worktrees/cleanup-rules.json',
    'docs/reviews/cleanup/2026-10-11-worktrees/protected-paths.json',
    'docs/reviews/cleanup/2026-10-11-worktrees/usage-inventory.py',
    'docs/reviews/cleanup/2026-10-11-worktrees/followup/blocked-cleanup-old.json',
    'docs/reviews/cleanup/2026-10-11-worktrees/followup/readonly-boundary.json',
]
priority = [f'docs/plan/backend-agent-mcp-priority/{p}.md' for p in (
    'README', 'batches-and-acceptance', 'coverage-matrix', 'operation-index',
    'branch-separation', 'sources', 'review')]
adr_paths = git('ls-tree', '-r', '--name-only', MAIN, 'docs/adr').decode().splitlines()
paths = sorted(set(paths + priority + adr_paths))
records, missing, contents = [], [], {}
for commit, selected in [(MAIN, paths), (FROZEN, priority)]:
    for path in selected:
        try:
            blob = git('rev-parse', f'{commit}:{path}').decode().strip()
            raw = git('cat-file', 'blob', blob)
        except subprocess.CalledProcessError as error:
            missing.append({'commit': commit, 'path': path, 'exitCode': error.returncode,
                            'stderr': error.stderr.decode('utf-8', errors='replace')})
            continue
        text = raw.decode('utf-8')
        contents[(commit, path)] = text
        item = {'commit': commit, 'path': path, 'gitBlob': blob, 'gitBytes': len(raw),
                'gitSha256': digest(raw), 'completeBlobRead': True, 'lines': len(text.splitlines())}
        if commit == MAIN and (ROOT / path).is_file():
            working = (ROOT / path).read_bytes()
            mapping = 'identity' if working == raw else 'LF_to_CRLF' if working == raw.replace(b'\n', b'\r\n') else 'different'
            item.update(worktreeBytes=len(working), worktreeSha256=digest(working), byteMapping=mapping)
        records.append(item)

frozen_path = 'docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md'
for commit in [MAIN, FROZEN]:
    lines = contents[(commit, frozen_path)].splitlines(keepends=True)
    extracted = ''.join(lines[150:175])
    assert extracted.startswith('## M4：') and '**任务DoD**' in extracted
    (OUT / 'input' / ('frozen-m4.md' if commit == FROZEN else 'current-main-m4.md')).write_text(extracted, encoding='utf-8', newline='\n')
assert (OUT / 'input/frozen-m4.md').read_bytes() == (OUT / 'input/current-main-m4.md').read_bytes()

symbols = {
    'apps/api/src/operations/routes.ts': ["'/api/v1/initiatives'", "'/api/v1/initiatives/:id/rollup'", "'/api/v1/automation-runs/:runId'", "'/api/v1/usage-summary'", "'/api/v1/a2a-bindings/:id/tasks/:taskId/events'", "'/api/v1/templates'", "'/api/v1/advanced-views'", "'/api/v1/loops/:id/run'", "'/api/v1/usage-records'"],
    'apps/api/src/server.ts': ['async function createView', 'app.get("/api/v1/views"'],
    'packages/contracts/src/agent-discovery.ts': ['const queryDifferences', 'deriveOperationEligibility', 'projectAdapterDiscovery'],
    'packages/db/src/stage4.ts': ['async function assertAdmissionAuthorization', 'export async function admitLoopRun', 'async function revalidateAutomationSession', 'export async function executeAutomationAction'],
    'apps/api/src/authz/authorize.ts': ['async function loadAgentFacts', 'function resourceInScope', 'export function sessionActiveForOperation'],
    'apps/agent-runner/src/workmesh-tools.ts': ['function boundedResult', 'async function recordToolActivity', 'function makeTool', 'export async function createWorkMeshTools', 'const completeDocumentRead'],
}
locations = []
for path, names in symbols.items():
    lines = contents[(MAIN, path)].splitlines()
    for name in names:
        found = [i + 1 for i, line in enumerate(lines) if name in line]
        locations.append({'path': path, 'symbol': name, 'lines': found})
        assert found, (path, name)
write_json('input/source-manifest.json', {'main': MAIN, 'frozen': FROZEN, 'records': records,
    'missingPaths': missing, 'symbolLocations': locations,
    'readLimit': '完整 Git blob 与 UTF-8 已读取校验；本卡语义审计仅所选操作，非全仓重新验收。'})

statuses = []
for path in adr_paths:
    text = contents[(MAIN, path)]
    lines = text.splitlines()
    statuses.append({'path': path, 'heading': lines[0] if lines else '',
                     'statusExcerpt': '\n'.join(lines[1:12])})
write_json('input/adr-status-index.json', statuses)
write_json('input/priority-difference.json', [{'path': path,
    'sameBytes': contents[(MAIN,path)] == contents[(FROZEN,path)]} for path in priority])

# 不跟随 reparse/junction；stat 的 device/inode 仅用于去重逻辑长度。
logical = 0
identities = {}
links = []
errors = []
count = 0
for parent, directories, files in os.walk(ROOT, followlinks=False):
    kept = []
    for name in directories:
        path = Path(parent) / name
        try:
            stat = path.lstat()
            if getattr(stat, 'st_file_attributes', 0) & 0x400:
                links.append({'path': str(path.relative_to(ROOT)), 'kind': 'reparse_directory'})
            else:
                kept.append(name)
        except OSError as error:
            errors.append({'path': str(path), 'error': str(error)})
    directories[:] = kept
    for name in files:
        path = Path(parent) / name
        try:
            stat = path.lstat()
            if getattr(stat, 'st_file_attributes', 0) & 0x400:
                links.append({'path': str(path.relative_to(ROOT)), 'kind': 'reparse_file'})
                continue
            logical += stat.st_size
            count += 1
            key = f'{stat.st_dev}:{stat.st_ino}'
            identities.setdefault(key, stat.st_size)
        except OSError as error:
            errors.append({'path': str(path), 'error': str(error)})
write_json('input/workspace-inventory.json', {'sampleUtc': datetime.now(timezone.utc).isoformat(),
    'root': str(ROOT), 'followReparse': False, 'ordinaryFileCount': count,
    'logicalBytes': logical, 'identityCount': len(identities),
    'identityDeduplicatedLogicalBytes': sum(identities.values()), 'identityMethod': 'Python Windows os.lstat st_dev/st_ino',
    'physicalAllocatedBytes': None, 'physicalNetReleasedBytes': None, 'links': links, 'errors': errors,
    'limits': '活动采样，不是全机一致快照；文件身份去重长度不代表物理占用；本轮无删除。'})
print(json.dumps({'完整来源数': len(records), '缺失候选路径': missing,
    '冻结M4与当前全文相同': True, '文件数': count, '逻辑字节': logical,
    '身份去重逻辑字节': sum(identities.values()), '扫描错误数': len(errors)}, ensure_ascii=False))
