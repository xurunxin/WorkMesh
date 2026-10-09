"""M1本机独有服务及检查；保全日志后仅收尾本次成功创建且标签相符的容器。"""
import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import uuid
import zipfile

root = Path(__file__).resolve().parent.parent
evidence = root / 'docs/plan/agent-mcp-m1/product-evidence'
evidence.mkdir(parents=True, exist_ok=True)
run_id = 'm1-' + uuid.uuid4().hex[:12]
resources = []
env = dict(os.environ)
env.update(RUN_INTEGRATION='1', WORKMESH_EXECUTION_WAITS_ENABLED='true', SESSION_SECRET=secrets.token_hex(32), WORKMESH_MASTER_KEY=secrets.token_hex(32),
           WORKMESH_BOOTSTRAP_TOKEN=secrets.token_urlsafe(32), WORKMESH_RUNNER_SERVICE_TOKEN=secrets.token_urlsafe(32),
           AUTH_RATE_LIMIT_ENDPOINT_BURST='10000', AUTH_RATE_LIMIT_SOCKET_BURST='10000',
           AUTH_RATE_LIMIT_CLIENT_IP_BURST='10000', AUTH_RATE_LIMIT_SUBJECT_BURST='1000', AUTH_RATE_LIMIT_INSTALL_BURST='100')

def docker(*args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, encoding='utf8')
    if result.returncode:
        raise RuntimeError('Docker operation failed: ' + result.stderr)
    return result.stdout.strip()

def save():
    (evidence / (run_id + '-resources.json')).write_text(json.dumps(dict(runId=run_id, resources=resources,
        imagesShared=True, volumesCreated=[], networksCreated=[], workspacePreserved=True), indent=2) + '\n', encoding='utf8')

def start(role, image, port, *args):
    name = run_id + '-' + role
    ident = docker('run', '-d', '--name', name, '--label', 'workmesh.m1.owner=' + run_id,
                   '-p', '127.0.0.1::' + str(port), *args, image)
    entry = dict(role=role, name=name, id=ident, image=image, createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), cleaned=False)
    resources.append(entry); save()
    host_port = docker('port', ident, str(port) + '/tcp').split(':')[-1]
    entry['hostPort'] = int(host_port); save()
    return ident, host_port

def ready(ident, *args):
    for _ in range(90):
        result = subprocess.run(['docker', 'exec', ident, *args], capture_output=True)
        if result.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('Owned service did not become ready: ' + ident)

exit_code = 1
try:
    password = secrets.token_urlsafe(24)
    postgres, postgres_port = start('postgres', 'postgres:16-alpine', 5432, '--tmpfs', '/var/lib/postgresql/data',
        '-e', 'POSTGRES_USER=workmesh', '-e', 'POSTGRES_PASSWORD=' + password, '-e', 'POSTGRES_DB=workmesh_m1_test')
    redis, redis_port = start('redis', 'redis:7-alpine', 6379, '--tmpfs', '/data')
    access, secret = 'm1fixture', secrets.token_urlsafe(32)
    storage, storage_port = start('rustfs', 'rustfs/rustfs:1.0.0', 9000, '--tmpfs', '/data:mode=0777',
        '-e', 'RUSTFS_ACCESS_KEY=' + access, '-e', 'RUSTFS_SECRET_KEY=' + secret)
    ready(postgres, 'pg_isready', '-U', 'workmesh', '-d', 'workmesh_m1_test')
    ready(redis, 'redis-cli', 'ping')
    ready(storage, '/usr/bin/curl', '--fail', '--silent', 'http://127.0.0.1:9000/health/ready')
    bucket = run_id + '-artifacts'
    docker('exec', storage, '/usr/bin/curl', '--fail', '--silent', '--show-error', '--aws-sigv4', 'aws:amz:us-east-1:s3',
           '--user', access + ':' + secret, '--request', 'PUT', 'http://127.0.0.1:9000/' + bucket)
    docker('exec', storage, '/usr/bin/curl', '--fail', '--silent', '--show-error', '--head', '--aws-sigv4', 'aws:amz:us-east-1:s3',
           '--user', access + ':' + secret, 'http://127.0.0.1:9000/' + bucket)
    env.update(DATABASE_URL=f'postgres://workmesh:{password}@127.0.0.1:{postgres_port}/workmesh_m1_test',
               REDIS_URL=f'redis://127.0.0.1:{redis_port}', S3_ENDPOINT=f'http://127.0.0.1:{storage_port}',
               S3_BUCKET=bucket, S3_REGION='us-east-1', S3_ACCESS_KEY_ID=access, S3_SECRET_ACCESS_KEY=secret, S3_FORCE_PATH_STYLE='true')
    if sys.argv[1].startswith('recovery-real'):
        # The generic root entry deliberately skips disaster recovery unless its
        # separate source/target fixtures are configured, exactly as Required CI.
        for database_name in ['workmesh_recovery_source_test', 'workmesh_recovery_target_test']:
            docker('exec', postgres, 'createdb', '-U', 'workmesh', database_name)
        env.update(RUN_RECOVERY_INTEGRATION='1', RECOVERY_TEST_SUFFIX=run_id,
                   RECOVERY_SOURCE_DATABASE_URL=f'postgres://workmesh:{password}@127.0.0.1:{postgres_port}/workmesh_recovery_source_test',
                   RECOVERY_TARGET_DATABASE_URL=f'postgres://workmesh:{password}@127.0.0.1:{postgres_port}/workmesh_recovery_target_test',
                   RECOVERY_TEST_S3_ENDPOINT=env['S3_ENDPOINT'], RECOVERY_TEST_S3_ACCESS_KEY_ID=access,
                   RECOVERY_TEST_S3_SECRET_ACCESS_KEY=secret,
                   RECOVERY_SOURCE_S3_BUCKET=run_id+'-source', RECOVERY_TARGET_S3_BUCKET=run_id+'-target',
                   WORKMESH_POSTGRES_TOOL_CONTAINER=postgres, WORKMESH_POSTGRES_TOOL_HOST='127.0.0.1',
                   WORKMESH_POSTGRES_TOOL_PORT='5432', RECOVERY_TEST_REPORT_PATH=str(evidence / (run_id+'-recovery-report.json')))
        resources[0]['databasesCreated'] = ['workmesh_recovery_source_test', 'workmesh_recovery_target_test']
        resources[-1]['testBuckets'] = [run_id+'-source', run_id+'-target']
    for item in resources:
        item['ready'] = True
    save()
    command = [sys.executable, '-X', 'utf8', '-B', str(root / 'scripts/m1-run-check.py'), *sys.argv[1:]]
    exit_code = subprocess.run(command, cwd=root, env=env).returncode
finally:
    artifact_roots = [root / 'ci-logs/mcp-coverage', root / 'ci-logs/execution-recovery']
    if any(path.exists() for path in artifact_roots):
        with zipfile.ZipFile(evidence / (run_id + '-client-evidence.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
          for artifacts in artifact_roots:
            for path in artifacts.rglob('*'):
                if path.is_file():
                    archive.writestr(artifacts.name + '/' + path.relative_to(artifacts).as_posix(), path.read_bytes())
    for entry in reversed(resources):
        try:
            log = subprocess.run(['docker', 'logs', entry['id']], capture_output=True, text=True, encoding='utf8')
            text = log.stdout + log.stderr
            for value in [password if 'password' in locals() else '', secret if 'secret' in locals() else '']:
                if value:
                    text = text.replace(value, '[fixture secret]')
            (evidence / (entry['name'] + '.log')).write_text(text, encoding='utf8')
            actual = json.loads(docker('inspect', entry['id']))[0]
            if actual['Name'] != '/' + entry['name'] or actual['Config']['Labels'].get('workmesh.m1.owner') != run_id:
                raise RuntimeError('Resource ownership mismatch; refuse cleanup')
            docker('stop', '--time', '10', entry['id'])
            docker('rm', entry['id'])
            entry['cleaned'] = True
            entry['cleanupAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        except Exception as error:
            entry['cleanupError'] = str(error)
            exit_code = 1
        save()
sys.exit(exit_code)
