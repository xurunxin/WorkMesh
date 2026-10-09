"""只归档不可变Git全文；不启动服务、不修改产品源。"""
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = json.loads((OUT/'main-observation-current.json').read_text(encoding='utf-8'))['main']
FROZEN = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def names(head, prefix):
    return git('ls-tree', '-r', '--name-only', head, prefix).decode().splitlines()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def save(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

paths = {
    'AGENTS.md', 'CONTEXT.md', 'AGENT_PROTOCOL.md', 'OPENAPI.yaml', 'SCHEMA.sql',
    'package.json', 'pnpm-lock.yaml', '.node-version', '.gitattributes', '.github/workflows/ci.yml',
    'vitest.config.ts', 'apps/api/src/server.ts', 'apps/api/src/agent-connections.ts',
    'apps/api/src/connection-installation-token.ts', 'apps/api/src/live-read-authorization.ts',
    'apps/api/src/agent/routes.ts', 'apps/api/src/agent/commands.ts', 'apps/api/src/agent/guard.ts',
    'apps/api/src/agent/types.ts', 'apps/api/src/agent/approval-projection.ts',
    'apps/api/src/authz/authorize.ts', 'apps/api/src/authz/route-policy.ts',
    'apps/api/src/collaboration/routes.ts', 'apps/api/src/recovery/routes.ts',
    'apps/api/src/recovery/projection.ts', 'apps/api/src/client-profile.ts',
    'apps/api/src/workbench-runner.ts', 'apps/api/src/heartbeat-idempotency.ts',
    'apps/api/integration/stage1.integration.test.ts', 'apps/api/integration/stage2-collaboration.integration.test.ts',
    'apps/api/integration/workbench-runner.integration.test.ts',
    'packages/domain/src/index.ts', 'packages/domain/src/authorization.ts',
    'packages/contracts/src/index.ts', 'packages/contracts/src/route-policy.ts',
    'packages/contracts/src/route-policy-bindings.ts', 'packages/contracts/src/agent-discovery.ts',
    'packages/contracts/src/agent-discovery-rules.ts', 'packages/agent-sdk/src/index.ts',
    'packages/agent-sdk/src/index.test.ts', 'packages/agent-sdk/src/discovery.test.ts',
    'apps/mcp/src/index.ts', 'apps/mcp/src/http.ts', 'apps/mcp/src/discovery.ts',
    'apps/mcp/src/index.test.ts', 'apps/mcp/src/http.test.ts', 'apps/mcp/src/recovery.test.ts',
    'apps/agent-runner/src/run-session.ts', 'apps/agent-runner/src/workmesh-tools.ts',
    'apps/agent-runner/src/workmesh-tools.test.ts', 'apps/agent-runner/src/runner-api.test.ts',
    'apps/agent-runner/src/permission-matrix.test.ts', 'apps/agent-runner/src/workbench-skill-manifest.ts',
    'apps/agent-runner/skills/workmesh-workbench/SKILL.md',
    'packages/conformance/src/mcp-coverage.fixture.ts', 'packages/conformance/src/mcp-coverage.conformance.test.ts',
    'packages/conformance/vitest.integration.config.ts', 'packages/conformance/package.json',
    'scripts/generate-agent-discovery.py', 'scripts/generate-route-policy-artifacts.mts',
    'scripts/generate-runner-skill-manifest.mjs', 'scripts/ci-policy.mjs', 'scripts/ci-policy.test.mjs',
    'scripts/validate-ci.mjs', 'scripts/require-integration-env.mjs',
    'scripts/m0-run-services.py', 'scripts/m0-run-check.py',
    'docs/plan/agent-mcp-m0/README.md', 'docs/plan/agent-mcp-m0/savedplan.md',
    'docs/plan/agent-mcp-m0/implementation.md', 'docs/plan/agent-mcp-m0/compatibility.md',
    'docs/plan/agent-mcp-m0/discovery-contract-draft.md', 'docs/plan/agent-mcp-m0/domain-audit.md',
    'docs/plan/agent-mcp-m0/domain-rules.json', 'docs/plan/agent-mcp-m0/operation-decisions.json',
    'docs/plan/agent-mcp-m0/operation-index.md', 'docs/plan/agent-mcp-m0/verification.md',
    'docs/plan/agent-mcp-m0/ci-integration.md', 'docs/plan/agent-mcp-m0/product-report.md',
    'docs/plan/agent-mcp-m0/product-recovery-report.md', 'docs/plan/agent-mcp-m0/product-ci407-report.md',
    'docs/plan/agent-mcp-m0/product-evidence/review3-checks.json',
    'docs/plan/agent-mcp-m0/product-evidence/review3-historical-archive-bindings.json',
    'docs/plan/agent-mcp-m0/product-evidence/ci407-clean-receipt.json',
}
paths.update(names(MAIN, 'docs/adr'))
paths.update({
    'apps/api/src/commands.ts', 'apps/api/src/workbench-conversations.ts',
    'apps/worker/src/session-lifecycle.ts', 'apps/worker/integration/stage1-lifecycle.integration.test.ts',
    'packages/contracts/src/pi-workbench-contracts.ts', 'packages/db/src/schema.ts',
    'packages/db/src/index.ts', 'packages/db/src/migrations.ts', 'packages/db/src/migration-manifest.ts',
    'packages/db/src/agent-locks.ts', 'packages/db/src/agent-lock-order-manifest.ts',
    'packages/db/integration/migration-baseline.integration.test.ts',
    'packages/db/scripts/generate-v1-baseline.mts', 'packages/db/package.json',
})
paths.update(names(MAIN, 'packages/db/migrations/v1'))
paths.update(names(MAIN, 'docs/plan/backend-agent-mcp-priority'))
paths.update(p for p in names(MAIN, 'docs') if 'client' in p and p.endswith('.md'))
paths.update(p for p in names(MAIN, 'docs/plan/agent-mcp-m0/product-evidence')
             if p.endswith('.json') and any(k in p for k in ['review3-real', 'review3-integration-final', 'review3-unit-final', 'review3-e2e', 'review3-delivery-observation']))
commits = {}
for head in [MAIN, FROZEN, '69085317c88d84b702af727dc0ac7152589626d8', '883d279d3b5978680672a6c1d7364d421d0afd10']:
    raw = git('cat-file', 'commit', head)
    lines = raw.decode().splitlines()
    commits[head] = dict(tree=next(x[5:] for x in lines if x.startswith('tree ')),
                         parents=[x[7:] for x in lines if x.startswith('parent ')],
                         commitObjectSha256=digest(raw))
assert commits[MAIN]['parents'] == ['69085317c88d84b702af727dc0ac7152589626d8', '883d279d3b5978680672a6c1d7364d421d0afd10']
assert commits[MAIN]['tree'] == commits['883d279d3b5978680672a6c1d7364d421d0afd10']['tree']
rows = []
with zipfile.ZipFile(OUT / 'source-snapshot.zip', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    selections = [(MAIN, p) for p in sorted(paths)]
    selections += [(FROZEN, p) for p in names(FROZEN, 'docs/plan/backend-agent-mcp-priority')]
    for head, path in selections:
        data = git('show', f'{head}:{path}')
        oid = git('rev-parse', f'{head}:{path}').decode().strip()
        member = f'{head}/{path}'
        info = zipfile.ZipInfo(member, (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data)
        row = dict(head=head, path=path, gitBlobOid=oid, bytes=len(data), sha256=digest(data), member=member)
        if head == MAIN and (ROOT / path).is_file():
            working = (ROOT / path).read_bytes()
            row['workingTree'] = dict(bytes=len(working), sha256=digest(working),
                                      relation='identical' if working == data else 'CRLF' if working.replace(b'\r\n', b'\n') == data else 'different')
        rows.append(row)
frozen = git('show', f'{FROZEN}:docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md').decode('utf-8')
m1_raw = frozen[frozen.index('## M1：'):frozen.index('## M2：')]
m1 = m1_raw.rstrip() + '\n'
(OUT / 'frozen-M1.md').write_text(m1, encoding='utf-8', newline='\n')
save('source-manifest.json', dict(main=MAIN, frozen=FROZEN, commits=commits, entries=rows,
                                archive=dict(path='source-snapshot.zip', bytes=(OUT/'source-snapshot.zip').stat().st_size,
                                             sha256=digest((OUT/'source-snapshot.zip').read_bytes())),
                                originalM1=dict(path='frozen-M1.md', bytes=len(m1.encode()), sha256=digest(m1.encode()), normalization='正文不改，移除节分隔末尾空行并补一个LF', extractedOriginalBytes=len(m1_raw.encode()), extractedOriginalSha256=digest(m1_raw.encode()))))
print(json.dumps(dict(sourceFiles=len(rows), archiveBytes=(OUT/'source-snapshot.zip').stat().st_size, main=MAIN), ensure_ascii=False))
