"""仅本任务的独有服务；原始脱敏日志、真实退出码及逐资源清理回执。"""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import uuid
import urllib.request
import zipfile
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[4]
RUN = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
OUT = ROOT / 'docs/reviews/c2/product' / RUN
OUT.mkdir()
TEMP = ROOT / '.tmp' / ('c2-product-' + RUN)
TEMP.mkdir(parents=True)
ENV = dict(os.environ)
PNPM_EXE = Path(shutil.which('pnpm.cmd')).parent / 'node_modules/pnpm/pnpm.exe'
if not PNPM_EXE.is_file():
    raise RuntimeError('exact pnpm executable not found')
ENV['npm_execpath'] = str(PNPM_EXE)
PG_SECRET, S3_SECRET = secrets.token_hex(24), secrets.token_hex(24)
ENV.update({
    'POSTGRES_PASSWORD': PG_SECRET, 'RUSTFS_ACCESS_KEY': 'c2-test', 'RUSTFS_SECRET_KEY': S3_SECRET,
    'DATABASE_URL': f'postgres://workmesh:{PG_SECRET}@127.0.0.1:25516/c2_product_test',
    'REDIS_URL': 'redis://127.0.0.1:26516', 'RUN_INTEGRATION': '1', 'NODE_ENV': 'test',
    'WORKMESH_MASTER_KEY': secrets.token_hex(32), 'SESSION_SECRET': secrets.token_hex(32),
    'WORKMESH_BOOTSTRAP_TOKEN': base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('='),
    'WORKMESH_RUNNER_SERVICE_TOKEN': secrets.token_hex(32),
    'S3_ENDPOINT': 'http://127.0.0.1:27516', 'S3_REGION': 'us-east-1', 'S3_BUCKET': 'workmesh-artifacts',
    'S3_ACCESS_KEY_ID': 'c2-test', 'S3_SECRET_ACCESS_KEY': S3_SECRET, 'S3_FORCE_PATH_STYLE': 'true',
    'WEB_ORIGIN': 'http://127.0.0.1:3100', 'NEXT_PUBLIC_API_URL': 'http://127.0.0.1:3101',
    'AUTH_RATE_LIMIT_ENDPOINT_BURST': '10000', 'AUTH_RATE_LIMIT_SOCKET_BURST': '10000',
    'AUTH_RATE_LIMIT_CLIENT_IP_BURST': '10000', 'AUTH_RATE_LIMIT_SUBJECT_BURST': '1000',
    'AUTH_RATE_LIMIT_INSTALL_BURST': '100', 'WORKMESH_PLAYWRIGHT_RUN_DIR': str(TEMP / 'playwright'),
    'RUN_WORKBENCH_LIVE': '0', 'NO_COLOR': '1',
    'DEBUG': 'pw:webserver',
    'VITEST_MAX_FORKS': '1', 'VITEST_MIN_FORKS': '1',
})
SENSITIVE = [PG_SECRET, S3_SECRET, ENV['DATABASE_URL'], ENV['WORKMESH_MASTER_KEY'], ENV['SESSION_SECRET'], ENV['WORKMESH_BOOTSTRAP_TOKEN'], ENV['WORKMESH_RUNNER_SERVICE_TOKEN']]
REPORT = {'run': RUN, 'mode': sys.argv[1], 'temporaryPath': str(TEMP), 'testPool': {'VITEST_MAX_FORKS': 1, 'VITEST_MIN_FORKS': 1, 'assertionsAndTimeoutsUnchanged': True}, 'checks': [], 'resources': [], 'cleanup': [], 'limitations': []}
RAW = {}

def stamp():
    return datetime.now(timezone.utc).isoformat()

def persist():
    (OUT / 'results.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def fingerprints():
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT).decode().splitlines()
    names = sorted(name for name in names if (name.startswith(('apps/', 'packages/')) or name in ['pnpm-lock.yaml', 'package.json']) and (ROOT / name).is_file())
    filtered = subprocess.check_output(['git', 'hash-object', '--stdin-paths'], input=('\n'.join(names) + '\n').encode(), cwd=ROOT, stderr=subprocess.DEVNULL).decode().splitlines()
    result = []
    for name, oid in zip(names, filtered, strict=True):
        path = ROOT / name
        body = path.read_bytes()
        blob = hashlib.sha1(f'blob {len(body)}\0'.encode() + body).hexdigest()
        result.append({'path': name, 'worktreeBytes': len(body), 'worktreeSha256': hashlib.sha256(body).hexdigest(), 'filteredGitOid': oid, 'rawGitOid': blob})
    encoded = (json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode()
    digest = hashlib.sha256(encoded).hexdigest()
    name = 'source-' + digest + '.json'
    (OUT / name).write_bytes(encoded)
    return {'path': name, 'bytes': len(encoded), 'sha256': digest, 'files': len(result)}

def command(label, args, env=None, check=True, source=False):
    pre = fingerprints() if source else None
    begin = stamp()
    process = subprocess.Popen(args, cwd=ROOT, env=env or ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    REPORT['activeCheck'] = {'label': label, 'command': args, 'pid': process.pid, 'startedAt': begin, 'sourceBefore': pre}
    persist()
    body = process.communicate()[0]
    for secret in sorted(SENSITIVE, key=len, reverse=True):
        body = body.replace(secret.encode(), b'[TEST_SECRET_REDACTED]')
    RAW[label + '.log'] = body
    text = body.decode('utf-8', errors='replace')
    (OUT / (label + '.log')).write_text('\n'.join(line.rstrip() for line in text.splitlines()).rstrip() + '\n', encoding='utf-8')
    item = {'label': label, 'command': args, 'pid': process.pid, 'startedAt': begin, 'finishedAt': stamp(), 'exitCode': process.returncode,
            'rawLogBytes': len(body), 'rawLogSha256': hashlib.sha256(body).hexdigest(), 'sourceBefore': pre, 'sourceAfter': fingerprints() if source else None}
    REPORT['checks'].append(item)
    REPORT['activeCheck'] = None
    persist()
    print(label, 'exit', process.returncode, flush=True)
    if process.returncode:
        print(text[-18000:], flush=True)
        if check:
            raise RuntimeError(label + ' failed')
    return text

def main():
    version = (ROOT / '.node-version').read_text().strip()
    filename = f'node-v{version}-win-x64.zip'
    base = f'https://nodejs.org/dist/v{version}/'
    sums = urllib.request.urlopen(base + 'SHASUMS256.txt', timeout=60).read()
    expected = next(line.split()[0].decode() for line in sums.splitlines() if line.split()[-1].decode() == filename)
    raw_node = urllib.request.urlopen(base + filename, timeout=90).read()
    if hashlib.sha256(raw_node).hexdigest() != expected:
        raise RuntimeError('official Node archive digest mismatch')
    node = TEMP / 'node.exe'
    with zipfile.ZipFile(__import__('io').BytesIO(raw_node)) as archive:
        node.write_bytes(archive.read(f'node-v{version}-win-x64/node.exe'))
    ENV['PATH'] = str(TEMP) + os.pathsep + ENV['PATH']
    os.environ['PATH'] = ENV['PATH']
    REPORT['runtime'] = {'url': base + filename, 'checksumUrl': base + 'SHASUMS256.txt', 'archiveSha256': expected, 'executableSha256': hashlib.sha256(node.read_bytes()).hexdigest(), 'path': str(node), 'readAt': stamp(), 'version': version}
    RAW['official-node-SHASUMS256.txt'] = sums
    command('node-version', ['node', '--version'])
    command('pnpm-version', ['pnpm.cmd', '--version'])
    command('pnpm-child-runtime', ['pnpm.cmd', 'exec', 'node', '-p', 'JSON.stringify({version:process.version,execPath:process.execPath})'])
    for kind, image, port, options in [
        ('pg', 'postgres:16-alpine', '25516:5432', ['--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=workmesh', '--env', 'POSTGRES_DB=c2_product_test', '--tmpfs', '/var/lib/postgresql/data']),
        ('redis', 'redis:7-alpine', '26516:6379', ['--tmpfs', '/data']),
        ('s3', 'rustfs/rustfs:1.0.0', '27516:9000', ['--env', 'RUSTFS_ACCESS_KEY', '--env', 'RUSTFS_SECRET_KEY', '--tmpfs', '/data:mode=0777']),
    ]:
        name = 'c2-product-' + RUN.lower() + '-' + kind
        resource = {'kind': kind, 'name': name, 'id': None, 'image': image, 'createdAt': stamp(), 'ownershipLabel': 'workmesh.c2.run=' + RUN, 'sharedImageRetained': True}
        REPORT['resources'].append(resource); persist()
        resource['id'] = command('start-' + kind, ['docker', 'run', '-d', '--name', name, '--label', resource['ownershipLabel'], '-p', '127.0.0.1:' + port, *options, image]).strip()
        persist()
    for attempt in range(40):
        try:
            subprocess.run(['docker', 'exec', REPORT['resources'][0]['id'], 'pg_isready', '-U', 'workmesh', '-d', 'c2_product_test'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['docker', 'exec', REPORT['resources'][1]['id'], 'redis-cli', 'ping'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            break
        except subprocess.CalledProcessError:
            time.sleep(1)
    else:
        raise RuntimeError('isolated infrastructure not ready')
    helper = TEMP / 'prepare-s3.mjs'
    helper.write_text("import {createRequire} from 'node:module'; const req=createRequire(new URL('../../packages/artifact-storage/package.json',import.meta.url)); const {S3Client,CreateBucketCommand,HeadBucketCommand}=req('@aws-sdk/client-s3'); const client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}}); let ok=false; for(let i=0;i<40;i++){try{await client.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET})); await client.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET}));ok=true;break}catch{await new Promise(r=>setTimeout(r,1000))}}client.destroy();if(!ok)throw new Error('S3 preparation failed');console.log('isolated bucket created and HeadBucket verified');\n", encoding='utf-8')
    # helper 在 .tmp/<run>/；依赖定位固定到受控仓库，不把凭据写入文件。
    command('prepare-s3', ['node', str(helper)])
    if REPORT['mode'] == 'visual':
        visual_baseline()
        return
    if REPORT['mode'] == 'targeted':
        checks = [
            ('unit', ['pnpm.cmd', '--filter', '@workmesh/worker', 'exec', 'vitest', 'run', 'src/wecom-notifications.test.ts', 'src/agent-webhook.test.ts']),
            ('web-unit', ['pnpm.cmd', '--filter', '@workmesh/web', 'exec', 'vitest', 'run', 'app/lib/canonical-route.test.ts']),
            ('reset', ['pnpm.cmd', '--filter', '@workmesh/db', 'test:reset']),
            ('c1-c2-integration', ['pnpm.cmd', '--filter', '@workmesh/worker', 'exec', 'vitest', 'run', '--config', '../../vitest.integration.config.ts', 'integration/stage4-automation.integration.test.ts', '--maxWorkers=1']),
            ('c2-redis-integration', ['pnpm.cmd', '--filter', '@workmesh/api', 'exec', 'vitest', 'run', '--config', '../../vitest.integration.config.ts', 'integration/wecom-notifications.integration.test.ts', '--maxWorkers=1']),
            ('api-config', ['pnpm.cmd', '--filter', '@workmesh/api', 'exec', 'vitest', 'run', '--config', '../../vitest.integration.config.ts', 'integration/notification-channels.integration.test.ts', '--maxWorkers=1']),
        ]
    elif REPORT['mode'] == 'root-e2e':
        checks = [('test-e2e', ['pnpm.cmd', 'test:e2e'])]
    elif REPORT['mode'] == 'e2e':
        checks = [('e2e-list', ['pnpm.cmd', '--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'e2e/wecom-notifications.spec.ts', '--list']),
                  ('c2-e2e', ['pnpm.cmd', '--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'e2e/wecom-notifications.spec.ts', 'e2e/attention-center.spec.ts'])]
    else:
        checks = [(script, ['pnpm.cmd', script]) for script in ['lint', 'typecheck']]
        # 同轮、同源码、同 env 顺序完成重包；正式 pnpm test 仍检查全部包。
        # 不改 hook/test timeout，绿色缓存只能来自本轮已记录的真实运行。
        checks += [(f'{name}-unit-sequential', ['pnpm.cmd', 'exec', 'turbo', 'run', 'test', '--filter=@workmesh/' + name, '--concurrency=1']) for name in ['api', 'web']]
        checks += [(script.replace(':', '-'), ['pnpm.cmd', script]) for script in ['test', 'test:integration', 'test:e2e']]
    for label, args in checks:
        check_env = {**ENV, 'NODE_ENV': 'development'} if 'e2e' in label else dict(ENV)
        if 'e2e' not in label:
            check_env.pop('NEXT_PUBLIC_API_URL', None)
            check_env.pop('NEXT_PUBLIC_API_URL_TEST', None)
        command(label, args, env=check_env, source=True)

def visual_baseline():
    # 仅切换四份 UI 输入字节来实测实施前行为；不切换分支、不重建旧工作区。
    base = 'f7c2265b4abd1f06ca97be5c2a16a1568fc2b767'
    paths = ['apps/web/app/lib/canonical-route.ts', 'apps/web/app/lib/use-authenticated-actor.ts', 'apps/web/app/login/page.tsx', 'apps/web/app/attention-center.tsx']
    sources = []
    for index, name in enumerate(paths):
        path = ROOT / name
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise RuntimeError('visual source path outside owned workspace')
        original = path.read_bytes()
        backup = TEMP / f'current-ui-{index}.source'
        backup.write_bytes(original)
        baseline = subprocess.check_output(['git', 'show', base + ':' + name], cwd=ROOT)
        sources.append({'path': name, 'backup': str(backup), 'currentSha256': hashlib.sha256(original).hexdigest(), 'baselineGitSha256': hashlib.sha256(baseline).hexdigest()})
    REPORT['visualBaseline'] = {'inputHead': base, 'files': sources, 'scope': '实施前 UI 行为/截图，不能充作当前产品验收'}
    persist()
    specs = TEMP / 'visual-specs'; specs.mkdir()
    (TEMP / 'package.json').write_text('{"type":"module"}\n', encoding='utf-8')
    for name in ['stage0.spec.ts', 'playwright-run-directory.ts']:
        (specs / name).write_bytes((ROOT / 'apps/web/e2e' / name).read_bytes())
    (specs / 'c2-baseline.spec.ts').write_text('''import {test,expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {createDb} from '../../../packages/db/src/index'
test('C2 实施前：登录丢失目的地，手动 canonical 网页仍可见',async({page,context},info)=>{
 const db=createDb(process.env.DATABASE_URL!),api='http://127.0.0.1:3101';let item='';
 try{
  await context.request.post(api+'/api/v1/auth/login',{headers:{origin:'http://127.0.0.1:3100','idempotency-key':randomUUID()},data:{email:'alice@example.test',password:'password-acceptance'}});
  const auth=await(await context.request.get(api+'/api/v1/auth/me')).json();const team=(await db.query('SELECT id FROM teams WHERE workspace_id=$1 LIMIT 1',[auth.actor.workspace_id])).rows[0];
  item=(await db.query(`INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,kind,source_type,source_id,payload) VALUES($1,$2,$3,'ask','activity',$4,'{"summary":"C2 仅授权 Human 可见"}') RETURNING id`,[auth.actor.workspace_id,auth.actor.id,team.id,randomUUID()])).rows[0].id;
  const href='/?view=inbox&attentionSelected='+encodeURIComponent('v1:inbox_item:'+item);
  await context.clearCookies();await page.goto(href);await expect(page).toHaveURL(url=>url.pathname==='/login'&&url.search==='');
  await page.screenshot({path:info.outputPath('c2-baseline-login.png'),fullPage:true,animations:'disabled'});
  const form=page.getByTestId('login-form');await form.locator('[name=email]').fill('alice@example.test');await form.locator('[name=password]').fill('password-acceptance');await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(url=>url.pathname==='/'&&url.search==='');await page.goto(href);const heading=page.locator('.attention-detail-heading h3');await expect(heading).toBeVisible();await expect(heading).not.toBeFocused();
  await page.screenshot({path:info.outputPath('c2-baseline-authorized.png'),fullPage:true,animations:'disabled'});
 }finally{if(item)await db.query('DELETE FROM inbox_items WHERE id=$1',[item]);await db.end()}
})
''', encoding='utf-8')
    config = TEMP / 'playwright.baseline.config.ts'
    config_body = (ROOT / 'playwright.config.ts').read_text(encoding='utf-8')
    config_body = config_body.replace('"./apps/web/e2e"', json.dumps(str(specs).replace('\\', '/')))
    config_body = config_body.replace('"./apps/web/e2e/global-setup.ts"', json.dumps(str(ROOT / 'apps/web/e2e/global-setup.ts').replace('\\', '/')))
    config_body = config_body.replace('command: ', 'cwd: ' + json.dumps(str(ROOT).replace('\\', '/')) + ', command: ')
    config.write_text(config_body, encoding='utf-8')
    try:
        for name in paths:
            (ROOT / name).write_bytes(subprocess.check_output(['git', 'show', base + ':' + name], cwd=ROOT))
        command('baseline-ui', ['pnpm.cmd', 'exec', 'playwright', 'test', '--config', str(config)], env={**ENV, 'NODE_ENV': 'development'}, source=True)
    finally:
        for source in sources:
            (ROOT / source['path']).write_bytes(Path(source['backup']).read_bytes())
            source['restoredSha256'] = hashlib.sha256((ROOT / source['path']).read_bytes()).hexdigest()
            source['restored'] = source['restoredSha256'] == source['currentSha256']
            if not source['restored']:
                raise RuntimeError('current UI restoration mismatch')
        persist()

try:
    main()
except Exception as error:
    REPORT['failure'] = str(error)
    print(str(error), flush=True)
finally:
    for resource in REPORT['resources']:
        identifier = resource['id']
        if not identifier:
            REPORT['cleanup'].append({'name': resource['name'], 'retainedReason': 'creation did not return an ID; no inferred deletion'})
            continue
        command('service-log-' + resource['kind'], ['docker', 'logs', identifier], check=False)
        inspect = command('inspect-' + resource['kind'], ['docker', 'inspect', '--format', '{{json .Id}}|{{json .Config.Labels}}|{{json .Mounts}}|{{json .NetworkSettings.Ports}}|{{json .Image}}', identifier], check=False)
        if resource['ownershipLabel'].split('=')[1] not in inspect or identifier not in inspect:
            REPORT['cleanup'].append({'id': identifier, 'retainedReason': 'exact ID/ownership not verified'})
            continue
        stop = len(REPORT['checks'])
        command('stop-' + resource['kind'], ['docker', 'stop', identifier], check=False)
        command('remove-' + resource['kind'], ['docker', 'rm', identifier], check=False)
        REPORT['cleanup'].append({'id': identifier, 'receipts': [REPORT['checks'][stop]['label'], REPORT['checks'][stop + 1]['label']], 'imageRetained': resource['image']})
    # 先保全原始脱敏字节；可读日志只去尾随空白，不能替代原件。
    with zipfile.ZipFile(OUT / 'raw-logs.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, body in RAW.items():
            archive.writestr(name, body)
    with zipfile.ZipFile(OUT / 'raw-logs.zip') as archive:
        if archive.testzip() is not None:
            raise RuntimeError('raw log ZIP CRC failed')
        for name, body in RAW.items():
            if archive.read(name) != body:
                raise RuntimeError('raw log recovery mismatch')
    REPORT['temporaryPathRetainedReason'] = 'Playwright 原始 trace/截图及服务准备输入待保全；不删除活动或尚未归档路径'
    REPORT['finishedAt'] = stamp()
    persist()
sys.exit(1 if 'failure' in REPORT else 0)
