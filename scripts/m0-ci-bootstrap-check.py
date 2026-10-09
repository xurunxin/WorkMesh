"""M0 CI增量回归：真实空依赖夹具、原失败与负例；仅清理本轮精确临时目录。"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import zipfile

root = Path(__file__).resolve().parent.parent
runtime = root / '.tmp/m0-node22/node-v22.19.0-win-x64'
node = runtime / 'node.exe'
npm = runtime / 'node_modules/npm/bin/npm-cli.js'
evidence = root / 'docs/plan/agent-mcp-m0/product-evidence'
fixture = Path(tempfile.mkdtemp(prefix='workmesh-m0-ci407-')).resolve()
report = dict(startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              parentHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip(),
              fixture=str(fixture), commands=[], inputs=[], cleanup=None)
env = dict(os.environ)
env.pop('NODE_PATH', None)
env['PATH'] = str(runtime) + os.pathsep + env['PATH']
paths = ['.node-version', '.github/workflows/ci.yml', 'package.json', 'pnpm-lock.yaml', 'turbo.json', 'vitest.config.ts',
         'packages/conformance/vitest.integration.config.ts', 'scripts/ci-policy.mjs', 'scripts/ci-policy.test.mjs',
         'scripts/ci-test-inputs.mjs', 'scripts/validate-ci.mjs', 'scripts/run-ci-source.mjs',
         'scripts/set-ci-bootstrap-token.mjs', 'scripts/ci-bootstrap/yaml.mjs',
         'scripts/ci-bootstrap/package.json', 'scripts/ci-bootstrap/package-lock.json']
paths += [path.relative_to(root).as_posix() for parent in ['apps', 'packages'] for path in (root / parent).glob('*/package.json')]

def run(name, args, expected=0, contains=None):
    started = time.monotonic()
    result = subprocess.run(args, cwd=fixture, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    output = result.stdout
    for key, value in env.items():
        if len(value) >= 24 and any(word in key.upper() for word in ['TOKEN', 'SECRET', 'PASSWORD', 'MASTER_KEY']):
            output = output.replace(value.encode(), b'[REDACTED]')
    log = evidence / f'ci407-clean-{name}.log'
    log.write_bytes(output)
    report['commands'].append(dict(name=name, command=[str(arg) for arg in args], exitCode=result.returncode,
                                   runtimeSeconds=round(time.monotonic() - started, 6), log=log.name,
                                   logSha256=hashlib.sha256(output).hexdigest(), expectedExitCode=expected))
    assert result.returncode == expected, (name, result.returncode, output[-1000:])
    if contains:
        assert contains in output.decode(errors='replace'), (name, output[-1000:])

try:
    with zipfile.ZipFile(evidence / 'ci407-clean-inputs.zip', 'x', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(set(paths)):
            data = (root / path).read_bytes()
            destination = fixture / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            archive.writestr(path, data)
            report['inputs'].append(dict(path=path, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
        old = subprocess.check_output(['git', 'show', '67c924b3d8837d81e6b3314e9c3cec7693f3ff34:scripts/ci-policy.test.mjs'], cwd=root)
        archive.writestr('historical/ci-policy.test.mjs', old)
    assert not list(fixture.rglob('node_modules'))
    run('node', [node, '-p', 'JSON.stringify({version:process.version,execPath:process.execPath})'])
    current = (fixture / 'scripts/ci-policy.test.mjs').read_bytes()
    (fixture / 'scripts/ci-policy.test.mjs').write_bytes(old)
    run('old-no-install', [node, '--test', 'scripts/ci-policy.test.mjs'], 1, 'ERR_MODULE_NOT_FOUND')
    (fixture / 'scripts/ci-policy.test.mjs').write_bytes(current)
    run('new-no-install', [node, '--test', 'scripts/ci-policy.test.mjs'], 1, "Cannot find module 'yaml'")
    run('install', [node, npm, 'ci', '--prefix', 'scripts/ci-bootstrap', '--ignore-scripts', '--no-audit', '--no-fund'], contains='added 1 package')
    assert not (fixture / 'node_modules').exists()
    assert sorted(path.name for path in (fixture / 'scripts/ci-bootstrap/node_modules').iterdir() if not path.name.startswith('.')) == ['yaml']
    run('policy', [node, '--test', 'scripts/ci-policy.test.mjs'], contains='# pass 16')
    run('validator', [node, 'scripts/validate-ci.mjs'], contains='[ci:validate] OK')
    workflow_path = fixture / '.github/workflows/ci.yml'
    workflow = workflow_path.read_text(encoding='utf-8')
    assert workflow.count('          npm ci --prefix scripts/ci-bootstrap') == 1
    for name, transform, reason in [
        ('missing-install', lambda text: '\n'.join(line for line in text.split('\n') if 'npm ci --prefix scripts/ci-bootstrap' not in line), 'Classification must install locked YAML'),
        ('missing-real-entry', lambda text: text.replace('pnpm test:conformance:integration 2>&1', 'echo omitted 2>&1'), 'Required API job must execute real MCP conformance'),
    ]:
        workflow_path.write_text(transform(workflow), encoding='utf-8', newline='\n')
        run(name, [node, 'scripts/validate-ci.mjs'], 1, reason)
        run(name + '-policy', [node, '--test', 'scripts/ci-policy.test.mjs'], 1, '# fail 1')
    workflow_path.write_text(workflow, encoding='utf-8', newline='\n')
    run('policy-restored', [node, '--test', 'scripts/ci-policy.test.mjs'], contains='# pass 16')
    report['result'] = 'passed'
finally:
    # 所有同步子进程已结束；拒绝越界或含link的递归清理，失败保留目录并如实记录。
    target = fixture.resolve()
    assert target == fixture and target.parent == Path(tempfile.gettempdir()).resolve() and target.name.startswith('workmesh-m0-ci407-')
    assert not fixture.is_symlink() and not any(path.is_symlink() or path.is_junction() for path in fixture.rglob('*'))
    cleanup_env = dict(env, M0_CI_CLEANUP_TARGET=str(target))
    cleanup = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                              'Remove-Item -LiteralPath $env:M0_CI_CLEANUP_TARGET -Recurse -ErrorAction Stop'],
                             env=cleanup_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    report['cleanup'] = dict(target=str(target), precheckedRealPath=str(target), noLinks=True,
                             activeChildren=0, exitCode=cleanup.returncode, absent=not target.exists(),
                             output=cleanup.stdout.decode(errors='replace'))
    (evidence / 'ci407-clean-receipt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    assert cleanup.returncode == 0 and not target.exists(), report['cleanup']
print(json.dumps(dict(result=report.get('result'), fixture=str(fixture), commands=len(report['commands']), cleanup=report['cleanup']), ensure_ascii=False))
