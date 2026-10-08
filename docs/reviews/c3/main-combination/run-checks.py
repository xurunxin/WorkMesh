"""顺序验证当前组合；秘密仅注入子进程，服务在 finally 中按归属清理。"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[4]
REVIEW = Path(__file__).resolve().parent
TEMP = ROOT / '.tmp' / 'c3-main-combination-01a11890'
PNPM = shutil.which('pnpm.cmd')
OWNER = 'c3-main-combination-01a11890'
E2E_ONLY = '--resume-e2e' in sys.argv
RESUME_SERVICES = '--resume-services' in sys.argv or E2E_ONLY
if RESUME_SERVICES:
    label = 'browser' if E2E_ONLY else ('accepted' if '--accepted-fixtures' in sys.argv else 'retry')
    REVIEW = REVIEW / label
    REVIEW.mkdir(exist_ok=True)
    TEMP = TEMP.with_name(TEMP.name + '-' + label)
    OWNER += '-' + label


def now():
    return datetime.now(timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def snapshot():
    rows = {}
    paths = [p for p in git('ls-files', '-z').decode().split('\0') if p and not p.startswith('docs/')]
    blobs = subprocess.check_output(['git', 'hash-object', '--stdin-paths'], cwd=ROOT,
                                    input=('\n'.join(paths) + '\n').encode()).decode().splitlines()
    assert len(paths) == len(blobs)
    for path, blob in zip(paths, blobs):
        data = (ROOT / path).read_bytes()
        rows[path] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'gitBlob': blob}
    digest = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'capturedAt': now(), 'digest': digest, 'files': rows}


def main():
    assert PNPM and not TEMP.exists(), '临时目录须为本轮新建，不复用未知资源'
    TEMP.mkdir(parents=True)
    env = os.environ.copy()
    env.update({'NODE_ENV': 'test', 'RUN_INTEGRATION': '1',
                'RUN_WORKBENCH_LIVE': '0', 'C3_RESOURCE_FILE': str(REVIEW / 'resources.json'),
                'DATABASE_URL': 'postgres://postgres:fixture-password@127.0.0.1:25489/c3_combination_test',
                'REDIS_URL': 'redis://127.0.0.1:26489', 'SESSION_SECRET': secrets.token_urlsafe(48),
                'WORKMESH_MASTER_KEY': secrets.token_hex(32), 'WORKMESH_BOOTSTRAP_TOKEN': secrets.token_urlsafe(32),
                'WORKMESH_RUNNER_SERVICE_TOKEN': secrets.token_urlsafe(32),
                # 与 CI API/E2E 夹具保持一致，仅用于独有测试服务，不改产品默认值。
                'AUTH_RATE_LIMIT_ENDPOINT_BURST': '10000', 'AUTH_RATE_LIMIT_SOCKET_BURST': '10000',
                'AUTH_RATE_LIMIT_CLIENT_IP_BURST': '10000', 'AUTH_RATE_LIMIT_SUBJECT_BURST': '1000',
                'AUTH_RATE_LIMIT_INSTALL_BURST': '100',
                'S3_ENDPOINT': 'http://127.0.0.1:27489', 'S3_BUCKET': 'workmesh-artifacts',
                'S3_ACCESS_KEY_ID': 'c3-combination-fixture', 'S3_SECRET_ACCESS_KEY': secrets.token_urlsafe(32),
                'S3_REGION': 'us-east-1', 'S3_FORCE_PATH_STYLE': 'true',
                'WORKMESH_PLAYWRIGHT_RUN_DIR': str(TEMP / 'playwright')})
    for key in ['WORKMESH_MODEL_PRESETS_FILE', 'WORKMESH_E2E_EXTERNAL_WEB']:
        env.pop(key, None)
    redactions = [env[k].encode() for k in ['SESSION_SECRET', 'WORKMESH_MASTER_KEY',
                  'WORKMESH_BOOTSTRAP_TOKEN', 'WORKMESH_RUNNER_SERVICE_TOKEN', 'S3_SECRET_ACCESS_KEY']]
    resource = {'createdAt': now(), 'owner': OWNER, 'temporaryPaths': [str(TEMP)], 'containers': [],
                'dedicatedImages': [], 'dedicatedNetworks': [], 'environmentPersistence': '仅子进程；父进程及系统配置未改',
                'preserved': ['当前工作区、旧 worktree、共享镜像、共享网络及其他任务资源']}
    save(REVIEW / 'resources.json', resource)
    runtime_config = ROOT / 'playwright.c3-combination.config.ts'
    if E2E_ONLY:
        assert not runtime_config.exists()
        test_copy = TEMP / 'test-copy'
        test_copy.mkdir()
        copies = []
        for name in ['stage0.spec.ts', 'workbench-llm-settings.spec.ts', 'playwright-run-directory.ts']:
            source_path = ROOT / 'apps/web/e2e' / name
            original = source_path.read_bytes()
            patched = original
            if name == 'stage0.spec.ts':
                assert original.count(b'http://127.0.0.1:3101') == original.count(b'http://127.0.0.1:3100') == 1
                patched = original.replace(b'http://127.0.0.1:3101', b'http://127.0.0.1:34101').replace(b'http://127.0.0.1:3100', b'http://127.0.0.1:34100')
            destination = test_copy / name
            destination.write_bytes(patched)
            copies.append({'sourcePath': str(source_path.relative_to(ROOT)), 'runtimePath': str(destination),
                           'sourceSha256': hashlib.sha256(original).hexdigest(), 'runtimeSha256': hashlib.sha256(patched).hexdigest(),
                           'patch': '仅两个服务端口' if patched != original else '原字节不变'})
        original = (ROOT / 'playwright.config.ts').read_bytes()
        patched = original.replace(b'const apiPort = "3101";', b'const apiPort = "34101";').replace(b'const webPort = "3100";', b'const webPort = "34100";')
        assert patched != original and original.count(b'testDir: "./apps/web/e2e"') == 1
        patched = patched.replace(b'testDir: "./apps/web/e2e"', b'testDir: ' + json.dumps(str(test_copy)).encode())
        runtime_config.write_bytes(patched)
        copies.append({'sourcePath': 'playwright.config.ts', 'runtimePath': str(runtime_config),
                       'sourceSha256': hashlib.sha256(original).hexdigest(), 'runtimeSha256': hashlib.sha256(patched).hexdigest(),
                       'patch': '仅两个服务端口与独有测试副本绝对路径'})
        save(REVIEW / 'runtime-copies.json', {'copies': copies, 'assertionChanges': False, 'timeoutChanges': False})
        resource['temporaryPaths'].append(str(runtime_config))
        save(REVIEW / 'resources.json', resource)
    before = snapshot()
    save(TEMP / 'source-before.json', before)
    checks = []
    save(REVIEW / 'input.json', {'headBefore': git('rev-parse', 'HEAD').decode().strip(),
         'mainSource': '96e724858e692d262107c34db50b40c3ae7c122c',
         'mainReadMethod': 'tds git fetch origin main 后 ls-remote origin refs/heads/main 实读',
         'candidateIndexTree': git('write-tree').decode().strip(), 'sourceDigest': before['digest'],
         'historicalBaseline': '8aee051c23eca1fc7653f688d6570c5808c0011d',
         'historicalProduct': 'c0bb931bf5dbf5c297835ee321b4de69f47e7695',
         'environment': {k: env[k] for k in ['NODE_ENV', 'RUN_INTEGRATION', 'REDIS_URL', 'S3_ENDPOINT', 'S3_BUCKET', 'WORKMESH_PLAYWRIGHT_RUN_DIR']},
         'database': '127.0.0.1:25489/c3_combination_test，独有临时数据库',
         'secrets': '随机测试夹具，仅内存和子进程环境；未落盘',
         'fixturePolicy': {'masterKey': '32 个随机字节，编码为 64 个 hex 字符；符合 auth-idempotency.ts',
                           'authBurstSource': '.github/workflows/ci.yml API/E2E jobs；仅测试子进程覆盖',
                           'liveProviderCalls': 'RUN_WORKBENCH_LIVE=0'},
         'runtime': {'node': subprocess.check_output(['node', '--version']).decode().strip(),
                     'pnpm': subprocess.check_output([PNPM, '--version']).decode().strip()},
         'latestRequiredCI': '待平台提交及 Chief 建立 PR 后实读；未运行、不填通过'})

    def run(label, args, *, development=False):
        print('开始：' + label, flush=True)
        source_before = snapshot()
        started = now()
        child_env = {**env, **({'NODE_ENV': 'development'} if development else {})}
        p = subprocess.Popen(args, cwd=ROOT, env=child_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        # 先登记父进程；Playwright/Next 的实际子进程另由进程盘点保存。
        save(TEMP / (label + '-process.json'), {'pid': p.pid, 'startedAt': started, 'command': args})
        output = p.communicate()[0]
        replacements = 0
        for secret in redactions:
            replacements += output.count(secret)
            output = output.replace(secret, b'[REDACTED_TEST_SECRET]')
        (TEMP / (label + '.log')).write_bytes(output)
        source_after = snapshot()
        receipt = {'command': args, 'cwd': str(ROOT), 'startedAt': started, 'finishedAt': now(),
                   'exitCode': p.returncode, 'sourceBefore': source_before['digest'],
                   'sourceAfter': source_after['digest'], 'sourceUnchanged': source_before['digest'] == source_after['digest'] == before['digest'],
                   'secretReplacements': replacements, 'logSha256': hashlib.sha256(output).hexdigest(),
                   'environmentOverride': {'NODE_ENV': child_env['NODE_ENV']}}
        checks.append({'name': label, **receipt})
        save(TEMP / (label + '-result.json'), receipt)
        save(REVIEW / 'checks.json', checks)
        print(f"结束：{label}，exit={p.returncode}，源码不变={receipt['sourceUnchanged']}", flush=True)
        if not receipt['sourceUnchanged']:
            raise RuntimeError('检查运行期间源码变化，不接受该运行')
        return p.returncode

    def docker(*args, **kwargs):
        return subprocess.check_output(['docker', *args], **kwargs)

    try:
        for label, args in ([] if RESUME_SERVICES else [
            ('route', ['check:route-policy']), ('lint', ['lint']), ('typecheck', ['typecheck']),
            ('unit', ['run', 'test', '--', '--maxWorkers=2']),
            ('api-build', ['--filter', '@workmesh/api', 'build']), ('ci-validate', ['ci:validate']),
        ]):
            if run(label, [PNPM, *args]) != 0:
                raise RuntimeError(label + ' 失败，首败保全，未继续依赖检查')

        definitions = [
            ('pg', 'postgres:16-alpine', '25489:5432', '/var/lib/postgresql/data',
             ['--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB'], ['postgres', '-c', 'fsync=off']),
            ('redis', 'redis:7-alpine', '26489:6379', '/data', [], []),
            ('s3', 'rustfs/rustfs:1.0.0', '27489:9000', '/data:mode=0777',
             ['--env', 'RUSTFS_ACCESS_KEY', '--env', 'RUSTFS_SECRET_KEY'], []),
        ]
        docker_env = {**env, 'POSTGRES_PASSWORD': 'fixture-password', 'POSTGRES_DB': 'c3_combination_test',
                      'RUSTFS_ACCESS_KEY': env['S3_ACCESS_KEY_ID'], 'RUSTFS_SECRET_KEY': env['S3_SECRET_ACCESS_KEY']}
        for label, image, port, mount, options, tail in definitions:
            name = OWNER + '-' + label
            cid = docker('run', '-d', '--name', name, '--label', 'workmesh.test-owner=' + OWNER,
                         '-p', '127.0.0.1:' + port, '--tmpfs', mount, *options, image, *tail, env=docker_env).decode().strip()
            inspected = json.loads(docker('inspect', cid))[0]
            resource['containers'].append({'id': cid, 'name': name, 'image': image, 'imageId': inspected['Image'],
                                          'created': inspected['Created'], 'mounts': inspected['Mounts'],
                                          'ports': inspected['HostConfig']['PortBindings'], 'labels': inspected['Config']['Labels']})
            save(REVIEW / 'resources.json', resource)
        for attempt in range(60):
            probe = subprocess.run(['docker', 'exec', resource['containers'][0]['id'], 'pg_isready', '-U', 'postgres'], capture_output=True)
            if probe.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('本轮 PostgreSQL 未就绪')
        helper = Path(__file__).resolve().with_name('prepare-s3.mjs')
        if run('s3-prepare', ['node', str(helper)]) != 0:
            raise RuntimeError('S3 夹具准备失败，不执行依赖该服务的集成')
        if not E2E_ONLY and run('reset-api', [PNPM, '--filter', '@workmesh/db', 'test:reset']) != 0:
            raise RuntimeError('专用数据库 reset 失败')
        if not E2E_ONLY and run('api-integration', [PNPM, '--filter', '@workmesh/api', 'test:integration']) != 0:
            raise RuntimeError('API 集成失败，首败保全')
        listing = [PNPM, '--filter', '@workmesh/web', 'run', 'test:e2e', 'workbench-llm-settings.spec.ts', '--list']
        if E2E_ONLY:
            listing[listing.index('--list'):listing.index('--list')] = ['--config', '../../' + runtime_config.name]
        if run('e2e-list', listing, development=True) != 0:
            raise RuntimeError('E2E 列表失败')
        run('e2e-llm', listing[:-1], development=True)
    finally:
        save(TEMP / 'source-after.json', snapshot())
        for item in resource['containers']:
            cid = item['id']
            try:
                current = json.loads(docker('inspect', cid))[0]
                assert current['Config']['Labels'].get('workmesh.test-owner') == OWNER
                assert current['Name'] == '/' + item['name']
                subprocess.run(['docker', 'stop', cid], capture_output=True, check=True)
                log = subprocess.run(['docker', 'logs', cid], capture_output=True)
                output = log.stdout + log.stderr
                for secret in redactions:
                    output = output.replace(secret, b'[REDACTED_TEST_SECRET]')
                (TEMP / (item['name'] + '.log')).write_bytes(output)
                subprocess.run(['docker', 'rm', '-v', cid], capture_output=True, check=True)
                absent = subprocess.run(['docker', 'inspect', cid], capture_output=True).returncode != 0
                item['cleanup'] = {'stoppedAndRemoved': True, 'verifiedAbsent': absent, 'at': now()}
            except Exception as error:
                item['cleanup'] = {'error': str(error), 'at': now()}
            save(REVIEW / 'resources.json', resource)
        resource['serviceCleanupFinishedAt'] = now()
        resource['temporaryCleanup'] = '日志及失败现场待保全后按绝对路径清理；当前未冒完成'
        save(REVIEW / 'resources.json', resource)


if __name__ == '__main__':
    main()
