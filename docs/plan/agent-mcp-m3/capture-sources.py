"""仅捕获 M3 规划来源；不修改产品，Git 原字节与工作树字节分列。"""
from pathlib import Path
import hashlib, json, subprocess, zipfile
import yaml

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = 'ef4cb5e1458d911d98433c443dba46e6c224caa0'
FROZEN = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'

def git(*args, data=None):
    return subprocess.check_output(['git', *args], cwd=ROOT, input=data)

def fingerprint(data):
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def write(name, value):
    content = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    (OUT / name).write_text(content, encoding='utf-8', newline='\n')

def tree(commit):
    result = {}
    for entry in git('ls-tree', '-rz', commit).split(b'\0'):
        if not entry:
            continue
        meta, path = entry.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        if kind == 'blob':
            result[path.decode('utf-8')] = oid
    return result

def blobs(oids):
    output = git('cat-file', '--batch', data=('\n'.join(oids) + '\n').encode())
    result, at = {}, 0
    for oid in oids:
        end = output.index(b'\n', at)
        actual, kind, size = output[at:end].decode().split()
        assert actual == oid and kind == 'blob'
        at = end + 1
        result[oid] = output[at:at + int(size)]
        at += int(size) + 1
    assert at == len(output)
    return result

def main():
    trees = {commit: tree(commit) for commit in (FROZEN, MAIN)}
    frozen_paths = ['docs/plan/backend-agent-mcp-priority/' + name + '.md' for name in
                    ('README', 'coverage-matrix', 'operation-index', 'branch-separation',
                     'batches-and-acceptance', 'sources', 'review')]
    prefixes = ('docs/adr/', 'packages/contracts/src/', 'packages/domain/src/',
        'packages/db/src/', 'packages/db/migrations/v1/', 'packages/agent-sdk/src/',
        'packages/conformance/', 'packages/git-provider/src/', 'packages/artifact-storage/src/',
        'packages/config/src/', 'apps/mcp/src/', 'apps/agent-runner/src/',
        'apps/agent-runner/skills/', 'apps/api/src/agent/', 'apps/api/src/authz/',
        'apps/api/src/delivery/')
    exact = {'AGENTS.md', 'CONTEXT.md', 'AGENT_PROTOCOL.md', 'OPENAPI.yaml', 'SCHEMA.sql',
        'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'vitest.config.ts',
        '.gitattributes', '.github/workflows/ci.yml', 'docs/AGENT_COLLABORATION_CLIENT_PROFILE.md',
        'docs/agent-runner.md', 'docs/agent-integration.md', 'docs/agent-tool-permissions.md',
        'docs/route-policy-matrix.md', 'docs/agent-operation-manifest.md',
        'apps/api/src/server.ts', 'apps/api/src/live-read-authorization.ts',
        'apps/api/src/collaboration/routes.ts', 'apps/api/src/operations/routes.ts',
        'apps/api/src/pagination.ts', 'apps/api/src/client-profile.ts', 'apps/api/src/commands.ts',
        'apps/api/integration/stage3-delivery.integration.test.ts',
        'apps/api/integration/stage2-collaboration.integration.test.ts',
        'apps/api/integration/stage4-operations.integration.test.ts',
        'apps/api/integration/agent-lock-order.integration.test.ts',
        'apps/worker/src/provider-actions.ts', 'apps/worker/src/provider-actions.test.ts',
        'apps/worker/src/artifact-uploads.ts', 'apps/worker/src/artifact-uploads.test.ts',
        'apps/worker/src/agent-webhook.ts', 'apps/worker/src/outbox.ts', 'apps/worker/src/index.ts',
        'apps/worker/integration/stage3-provider.integration.test.ts',
        'scripts/generate-agent-discovery.py', 'scripts/generate-route-policy-artifacts.mts',
        'scripts/generate-runner-skill-manifest.mjs', 'scripts/generate-workmesh-skill-artifact.mjs',
        'scripts/ci-policy.mjs', 'scripts/ci-policy.test.mjs', 'scripts/validate-ci.mjs',
        'scripts/verify-raw-evidence-archive.mjs', 'scripts/require-integration-env.mjs',
        'scripts/ci-bootstrap/package.json', 'scripts/ci-bootstrap/package-lock.json'}
    for package in ('api', 'worker', 'mcp', 'agent-runner'):
        exact.add(f'apps/{package}/package.json')
    for package in ('agent-sdk', 'contracts', 'db', 'domain', 'git-provider', 'artifact-storage'):
        exact.add(f'packages/{package}/package.json')
    reports = {'README.md', 'security-contract.md', 'compatibility.md', 'lifecycle.md',
        'verification.md', 'operation-decisions.json', 'product-discovery-decisions.json',
        'product-operation-results.md', 'product-operation-results.json', 'product-closure-matrix.md',
        'product-check-results.json', 'product-source-manifest.json', 'product-report.md',
        'product-review-repair-report.md', 'product-queued-author-repair-report.md',
        'product-ci410-report.md', 'product-ci414-report.md', 'product-review-repair-commit-binding.json'}
    current_paths = [p for p in trees[MAIN] if p in exact or p.startswith(prefixes)
        or (p.startswith(('docs/plan/agent-mcp-m0/', 'docs/plan/agent-mcp-m1/', 'docs/plan/agent-mcp-m2/'))
            and len(p.split('/')) == 4 and p.split('/')[-1] in reports)]
    selected = [(FROZEN, p) for p in frozen_paths] + [(MAIN, p) for p in sorted(current_paths)]
    raw = blobs(list(dict.fromkeys(trees[c][p] for c, p in selected)))
    entries, members = [], {}
    for commit, path in selected:
        data = raw[trees[commit][path]]
        member = 'members/' + fingerprint(data)['sha256']
        members[member] = data
        wt = (ROOT / path).read_bytes()
        wt_member = 'members/' + fingerprint(wt)['sha256']
        members[wt_member] = wt
        entries.append({'commit': commit, 'path': path, 'blobId': trees[commit][path],
            'git': {'member': member, **fingerprint(data)},
            'worktree': {'member': wt_member, **fingerprint(wt)},
            'worktreeSource': '本轮当前工作树，不是冻结历史工作树',
            'frozenEqualsMain': data == raw[trees[MAIN][path]] if path in frozen_paths and trees[MAIN][path] in raw else None})
    batches = raw[trees[FROZEN][frozen_paths[4]]]
    section = batches[batches.index('## M3：'.encode()):batches.index('## M4：'.encode())]
    members['frozen/m3-section.md'] = section
    write('frozen-m3.md', section.decode('utf-8').rstrip('\r\n') + '\n')
    commit_entries = []
    for commit in (FROZEN, MAIN, 'fb770b62a926e7c27049c2795eafa6da4e0cb085'):
        data = git('cat-file', 'commit', commit)
        member = 'commits/' + commit
        members[member] = data
        lines = data.decode().splitlines()
        commit_entries.append({'commit': commit, 'tree': next(l[5:] for l in lines if l.startswith('tree ')),
            'parents': [l[7:] for l in lines if l.startswith('parent ')], 'raw': {'member': member, **fingerprint(data)}})
    archive = OUT / 'source-snapshot.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(members.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
    write('source-manifest.json', {'main': MAIN, 'frozen': FROZEN, 'entries': entries,
        'commits': commit_entries, 'frozenSection': {'member': 'frozen/m3-section.md', **fingerprint(section)},
        'archive': fingerprint(archive.read_bytes()), 'memberCount': len(members),
        'mainTreeEqualsM2Candidate': commit_entries[1]['tree'] == commit_entries[2]['tree'],
        'frozenToMainDiff': git('diff', '--name-status', FROZEN, MAIN).decode().splitlines(),
        'headToMainDiff': git('diff', '--name-status', MAIN, 'HEAD').decode().splitlines()})
    schema = yaml.safe_load(raw[trees[MAIN]['OPENAPI.yaml']])
    operations = {}
    for path, methods in schema['paths'].items():
        for method, operation in methods.items():
            if not isinstance(operation, dict) or 'operationId' not in operation:
                continue
            operations[operation['operationId']] = {'method': method.upper(), 'path': path,
                'actorKinds': operation.get('x-workmesh-actor-kinds', []),
                'feature': operation.get('x-workmesh-feature-key'), 'input': operation.get('requestBody'),
                'parameters': operation.get('parameters', []), 'responses': operation.get('responses')}
    write('current-openapi-operations.json', operations)
    print(json.dumps({'sourceEntries': len(entries), 'archiveMembers': len(members),
        'allOpenapiOperations': len(operations), 'mainTreeEqualsM2Candidate': commit_entries[1]['tree'] == commit_entries[2]['tree'],
        'exitCode': 0}))

if __name__ == '__main__':
    main()
