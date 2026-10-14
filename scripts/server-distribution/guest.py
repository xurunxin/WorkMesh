"""Accept the installed distribution in an isolated full guest, without host Node."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client
import http.cookiejar
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path('/root/server-install')
ROOT.mkdir(mode=0o700, exist_ok=True)
STATE = ROOT / 'state.json'
checks, samples, diagnostics = [], [], {}


def command(args, *, expected=0, data=None, timeout=1800):
    try:
        result = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        diagnostics.update(command=args[0].rsplit('/', 1)[-1], timedOut=True, timeoutSeconds=timeout,
                           stdoutSha256=hashlib.sha256(error.stdout or b'').hexdigest(),
                           stderrSha256=hashlib.sha256(error.stderr or b'').hexdigest())
        raise
    if result.returncode != expected:
        stderr = result.stderr.decode(errors='replace')
        # Never export command arguments or raw stderr: either may contain keys.
        categories = {
            'imageMissing': ['No such image', 'Unable to find image'],
            'daemonUnavailable': ['Cannot connect to the Docker daemon'],
            'apiVersionMismatch': ['client version', 'minimum supported API version'],
            'mountRejected': ['invalid mount config', 'bind source path does not exist'],
            'entrypointRejected': ['exec format error', 'executable file not found', 'permission denied'],
            'archiveRejected': ['docker-import-', 'archive/tar', 'invalid tar header'],
            'networkUnavailable': ['network is unreachable'],
        }
        diagnostics.update(exitCode=result.returncode,
                           command=args[0].rsplit('/', 1)[-1],
                           stderrSha256=hashlib.sha256(result.stderr).hexdigest(),
                           categories=[name for name, needles in categories.items() if any(needle in stderr for needle in needles)],
                           codes=sorted(set(re.findall(r'\b(?:INSTALL|DEPLOYMENT|RECOVERY)_[A-Z_]+', stderr))))
        raise RuntimeError('installed command failed')
    return result.stdout.decode()


def private(file, value):
    with file.open('w') as out:
        os.chmod(file, 0o600)
        json.dump(value, out)


def report(value):
    raw = json.dumps(value).encode()
    if re.search(rb'wm[ips]_[A-Za-z0-9_-]{43}', raw):
        raise RuntimeError('unsafe receipt')
    req = urllib.request.Request('http://10.0.2.2:18080/receipt', raw, {'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        assert response.status == 200


def download():
    dist = ROOT / 'distribution'
    dist.mkdir(mode=0o700)
    expected = json.loads(Path('/opt/server-install/expected.json').read_text())
    with urllib.request.urlopen('http://10.0.2.2:18080/distribution/manifest.json', timeout=30) as response:
        data = response.read()
    assert hashlib.sha256(data).hexdigest() == expected['manifestSha256']
    (dist / 'manifest.json').write_bytes(data)
    manifest = json.loads(data)
    assert manifest['source']['commit'] == expected['sourceHead'] and manifest['arch'] == expected['arch']
    for entry in {entry['path']: entry for entry in manifest['files'] + manifest['chunks'] + manifest['bootstrapChunks']}.values():
        file = dist / entry['path']
        file.parent.mkdir(mode=0o700, exist_ok=True)
        with urllib.request.urlopen('http://10.0.2.2:18080/distribution/' + entry['path'], timeout=1800) as response, file.open('wb') as out:
            while block := response.read(1024 * 1024):
                out.write(block)
        assert file.stat().st_size == entry['bytes'] and hashlib.sha256(file.read_bytes()).hexdigest() == entry['sha256']
    return dist, manifest, expected['manifestSha256']


def helper_image(manifest):
    for image in dict.fromkeys([manifest['installerImage'], manifest['installerArchiveImage']]):
        result = subprocess.run(['docker', 'image', 'inspect', image], capture_output=True)
        if result.returncode == 0:
            value = json.loads(result.stdout)[0]
            assert value['Id'] == image and value['Architecture'] == manifest['arch']
            assert value['Config']['Labels']['org.opencontainers.image.revision'] == manifest['source']['commit']
            return image
    raise RuntimeError('trusted helper was not loaded')


def proxy(port, upstream, certificates):
    class Handler(BaseHTTPRequestHandler):
        def forward(self):
            body = self.rfile.read(int(self.headers.get('content-length', '0')))
            headers = {k: v for k, v in self.headers.items() if k.lower() not in {'connection', 'transfer-encoding'}}
            headers['X-Forwarded-Proto'] = 'https'
            headers['X-Forwarded-For'] = self.client_address[0]
            if upstream == 0:
                if self.command == 'GET' and self.path == '/api/v1/repos/ta01/fixture/contents/AGENTS.md?ref=ta01-base' and self.headers.get('Authorization') == 'token ta01-isolated-provider':
                    import base64
                    content = '# 固定私有 CA 测试指导\n'.encode()
                    value = {'encoding': 'base64', 'sha': hashlib.sha1(content).hexdigest(), 'content': base64.b64encode(content).decode()}
                    payload = json.dumps(value).encode()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                else:
                    self.send_error(404)
                return
            backend = http.client.HTTPConnection('127.0.0.1', upstream, timeout=90)
            try:
                backend.request(self.command, self.path, body, headers)
                response = backend.getresponse()
                payload = response.read()
                self.send_response(response.status)
                for k, v in response.getheaders():
                    if k.lower() not in {'connection', 'transfer-encoding', 'content-length'}:
                        self.send_header(k, v)
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            finally:
                backend.close()
        do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = forward
        def log_message(self, *_):
            pass
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certificates / 'ca.pem', certificates / 'key.pem')
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def install(dist, digest, prefix, config, action, *, expected=0, extra=()):
    out = command(['sh', str(dist / 'install.sh'), str(dist), digest, str(prefix), str(config), action, *extra], expected=expected)
    return json.loads(out) if expected == 0 else None


def compose(prefix, *args):
    file = prefix / 'current.json'
    current = json.loads((file if file.exists() else prefix / 'pending.json').read_text())
    return command(['docker', 'compose', '-p', current['project'], '-f', current['composeFile'], *args])


def sql(prefix, query):
    return compose(prefix, 'exec', '-T', 'postgres', 'psql', '-U', 'workmesh', '-d', 'workmesh', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query).strip()


def measurement(prefix, phase):
    file = prefix / 'current.json'
    current = json.loads((file if file.exists() else prefix / 'pending.json').read_text())
    ids = command(['docker', 'ps', '-q', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + current['project']]).split()
    infos = json.loads(command(['docker', 'inspect', *ids]))
    assert all(v['Config']['Labels'].get('io.workmesh.installation') == current['installationId'] for v in infos)
    sample = {'phase': phase, 'profile': current['profile'], 'monotonic': time.monotonic(),
              'stats': [json.loads(line) for line in command(['docker', 'stats', '--no-stream', '--format', '{{json .}}', *ids]).splitlines()],
              'state': [{'id': v['Id'], 'image': v['Image'], 'oom': v['State']['OOMKilled'], 'restarts': v['RestartCount'],
                         'memoryLimit': v['HostConfig']['Memory'], 'nanoCpus': v['HostConfig']['NanoCpus']} for v in infos],
              'disk': command(['df', '-B1', '--output=size,used,avail', str(prefix)]).splitlines()}
    samples.append(sample)
    assert not any(v['oom'] for v in sample['state'])


class Client:
    def __init__(self, certificates):
        context = ssl.create_default_context(cafile=str(certificates / 'ca.pem'))
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(self.cookies))
        self.csrf = None
    def request(self, url, body=None, *, method=None, headers=None, expected=200, raw=False):
        hdr = {'content-type': 'application/json', **(headers or {})}
        if body is not None:
            hdr.setdefault('Idempotency-Key', str(uuid.uuid4()))
            if self.csrf:
                hdr['X-CSRF-Token'] = self.csrf
        payload = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, payload, hdr, method=method)
        try:
            response = self.opener.open(request, timeout=90)
        except urllib.error.HTTPError as error:
            response = error
        assert response.status == expected, (url.split('?')[0], response.status, expected)
        data = response.read()
        return data if raw else json.loads(data)


def journey(prefix, config, certificates):
    env = json.loads(config.read_text())['environment']
    origin = env['WEB_ORIGIN']
    client = Client(certificates)
    keys = json.loads((prefix / 'operator-keys.json').read_text())
    password = 'guest-' + uuid.uuid4().hex
    result = client.request(origin + '/api/v1/auth/install', {
        'name': 'TA01 isolated guest', 'slug': 'ta01-' + uuid.uuid4().hex[:8], 'adminName': 'Probe',
        'email': 'probe@example.test', 'password': password}, headers={'X-WorkMesh-Bootstrap-Token': keys['WORKMESH_BOOTSTRAP_TOKEN']})
    client.csrf = result['csrfToken']
    me = client.request(origin + '/api/v1/auth/me')['actor']
    team = client.request(origin + '/api/v1/teams')['items'][0]
    project = client.request(origin + '/api/v1/projects', {'name': 'TA01 guest project', 'teamId': team['id']})
    provider = client.request(origin + '/api/v1/provider-connections', {'provider': 'gitea', 'externalAccountId': 'ta01-fixture',
        'displayName': 'TA01 isolated TLS fixture', 'baseUrl': 'https://10.0.2.15:9446',
        'accessToken': 'ta01-isolated-provider', 'webhookSecret': 'ta01-isolated-webhook'})
    repository = client.request(origin + '/api/v1/repositories', {'connectionId': provider['id'], 'teamId': team['id'],
        'externalId': 'ta01/fixture', 'fullName': 'ta01/fixture', 'defaultBranch': 'main', 'requiredChecks': []})
    action = client.request(origin + '/api/v1/repositories/' + repository['id'] + '/context', {
        'projectId': project['id'], 'baseBranch': 'main', 'baseSha': 'ta01-base', 'branchPattern': 'workmesh/{workItemKey}-{slug}',
        'allowedPaths': ['**'], 'permissions': ['read']})
    for _ in range(90):
        contexts = client.request(origin + '/api/v1/repositories/' + repository['id'] + '/context')
        context = next((value for value in contexts if value['provider_action_id'] == action['id']), None)
        if context:
            break
        time.sleep(1)
    assert context and context['base_sha'] == 'ta01-base' and context['project_id'] == project['id']
    assert context['guidance'][0]['content'] == '# 固定私有 CA 测试指导\n'
    checks.append('workerPrivateCaActualHttpsProviderRead')
    body = {'teamId': team['id'], 'projectId': project['id'], 'title': 'TA01 first task'}
    key = str(uuid.uuid4())
    item = client.request(origin + '/api/v1/work-items', body, headers={'Idempotency-Key': key})
    replay = client.request(origin + '/api/v1/work-items', body, headers={'Idempotency-Key': key})
    assert item['id'] == replay['id']
    assert client.request(origin + '/api/v1/work-items/' + item['id'])['id'] == item['id']
    checks.extend(['authenticatedApi', 'duplicateIdempotency', 'firstTaskReadback'])
    measurement(prefix, 'first-task')
    created = client.request(origin + '/api/v1/agent-connections', {'name': 'TA01 guest', 'agentSlug': 'ta01-probe',
        'clientType': 'codex', 'teamId': team['id'], 'principalHumanActorId': me['id'],
        'requestedCapabilities': ['work:read'], 'grantAgentDelegate': False}, expected=201)
    code = created['connect_url'].split('#', 1)[1]
    redeemed = client.request(origin + '/api/v1/agent-connections/redeem', {'pairingCode': code, 'agentSlug': 'ta01-probe',
        'client': {'type': 'codex', 'version': '1.1.0'}})
    mcp_headers = {'X-WorkMesh-Installation-Token': redeemed['installation_token'], 'accept': 'application/json, text/event-stream'}
    for i, (method, params) in enumerate([('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
        'clientInfo': {'name': 'ta01-guest', 'version': '1.0.0'}}), ('tools/call', {'name': 'verify_connection', 'arguments': {}}),
        ('tools/call', {'name': 'get_workmesh_context', 'arguments': {}})]):
        raw = client.request(redeemed['mcp']['url'], {'jsonrpc': '2.0', 'id': i + 1, 'method': method, 'params': params}, headers=mcp_headers, raw=True).decode()
        reply = json.loads(next(line[5:] for line in raw.splitlines() if line.startswith('data:'))) if raw.startswith(('data:', 'event:')) else json.loads(raw)
        assert 'error' not in reply and not reply['result'].get('isError')
    checks.append('realMcpInstallationIdentity')
    content = b'TA01 installed artifact\n'
    upload = client.request(origin + '/api/v1/artifact-upload-intents', {'workItemId': item['id'], 'filename': 'proof.txt',
        'mimeType': 'text/plain', 'sizeBytes': len(content), 'checksum': 'sha256:' + hashlib.sha256(content).hexdigest()})
    client.request(upload['uploadUrl'], content, method='PUT', headers=upload['requiredHeaders'], raw=True)
    client.request(origin + '/api/v1/artifact-upload-intents/' + upload['id'] + '/finalize', {})
    for _ in range(90):
        status = client.request(origin + '/api/v1/artifact-upload-intents/' + upload['id'])
        if status['status'] == 'verified':
            break
        time.sleep(1)
    assert status['status'] == 'verified'
    link = client.request(origin + '/api/v1/artifact-upload-intents/' + upload['id'] + '/download')
    assert client.request(link['downloadUrl'], raw=True) == content
    checks.append('realArtifactUploadDownload')
    # Prove outage on the deployed Redis, not a fake store.
    compose(prefix, 'stop', 'redis')
    client.request(origin + '/api/v1/auth/login', {'email': 'absent@example.test', 'password': 'unrelated-password'}, expected=503)
    compose(prefix, 'start', 'redis')
    for _ in range(30):
        if compose(prefix, 'exec', '-T', 'redis', 'redis-cli', 'ping').strip() == 'PONG':
            break
        time.sleep(1)
    checks.append('redisOutageFailsClosedCredentials')
    compose(prefix, 'stop', 'worker')
    second = client.request(origin + '/api/v1/work-items', {**body, 'title': 'durable while worker stopped'})
    assert int(sql(prefix, "SELECT count(*) FROM outbox_events WHERE status<>'delivered'")) > 0
    compose(prefix, 'start', 'worker')
    for _ in range(120):
        if sql(prefix, "SELECT count(*) FROM outbox_events WHERE status<>'delivered'") == '0':
            break
        time.sleep(1)
    assert sql(prefix, "SELECT count(*) FROM outbox_events WHERE status<>'delivered'") == '0'
    checks.append('workerRestartRecoversDurableOutbox')
    latencies = []
    def create_task(index):
        started = time.monotonic()
        result = client.request(origin + '/api/v1/work-items', {**body, 'title': 'concurrent-' + str(index)})['id']
        latencies.append(time.monotonic() - started)
        return result
    stopped = threading.Event()
    measurement_errors = []
    def measure_load():
        try:
            while not stopped.is_set():
                measurement(prefix, 'concurrent-load')
                stopped.wait(1)
        except Exception as error:
            measurement_errors.append(type(error).__name__)
            stopped.set()
    monitor = threading.Thread(target=measure_load)
    monitor.start()
    with ThreadPoolExecutor(max_workers=4) as pool:
        try:
            ids = list(pool.map(create_task, range(32)))
        finally:
            stopped.set()
            monitor.join()
    assert len(set(ids)) == 32
    if measurement_errors:
        raise RuntimeError('resource measurement failed')
    samples.append({'phase': 'concurrent-latency', 'count': 32, 'concurrency': 4, 'seconds': latencies})
    checks.append('concurrentRequests')
    return {'email': 'probe@example.test', 'password': password, 'itemId': item['id'], 'secondItemId': second['id'],
            'artifactId': status['artifactId'], 'uploadId': upload['id'], 'installationToken': redeemed['installation_token']}


def upgrade_recovery(dist, manifest, digest, prefix, config):
    # A second candidate identity for the same checked source/ledger tests the
    # supported compatible-program case. This is not a released older binary.
    upgrade = ROOT / 'compatible-upgrade'
    if not upgrade.exists():
        upgrade.mkdir(mode=0o700)
        for entry in {entry['path']: entry for entry in manifest['files'] + manifest['chunks'] + manifest['bootstrapChunks']}.values():
            target = upgrade / entry['path']
            target.parent.mkdir(mode=0o700, exist_ok=True)
            os.link(dist / entry['path'], target)
        upgraded = {**manifest, 'release': manifest['release'] + '.upgrade'}
        (upgrade / 'manifest.json').write_text(json.dumps(upgraded, indent=2) + '\n')
    new_digest = hashlib.sha256((upgrade / 'manifest.json').read_bytes()).hexdigest()
    current = json.loads((prefix / 'current.json').read_text())
    ids = compose(prefix, 'ps', '-q', 'postgres', 'redis', 'minio').split()
    def volumes():
        return sorted(mount['Name'] for info in json.loads(command(['docker', 'inspect', *ids])) for mount in info['Mounts'] if mount['Type'] == 'volume')
    original_volumes = volumes()
    original_rows = sql(prefix, 'SELECT count(*) FROM work_items')
    current_bytes = (prefix / 'current.json').read_bytes()
    # Deliberately mismatched digest tests the real deployed pre-migration boundary.
    install(upgrade, '0' * 64, prefix, config, 'upgrade', expected=1, extra=['--maintenance-confirmed'])
    assert (prefix / 'current.json').read_bytes() == current_bytes and volumes() == original_volumes
    checks.append('preMigrationFailureKeepsCurrent')
    assert install(upgrade, new_digest, prefix, config, 'upgrade', extra=['--maintenance-confirmed'])['status'] == 'awaiting-validation'
    assert install(upgrade, new_digest, prefix, config, 'commit', extra=['--validation', str(prefix / 'validation.json')])['status'] == 'installed'
    journal = json.loads((prefix / 'journal.json').read_text())
    assert journal['stage'] == 'committed' and journal['backup']['manifestSha256']
    backup = Path(journal['backup']['directory'])
    assert (backup / 'manifest.json').exists() and (backup / 'manifest.hmac-sha256').exists()
    assert volumes() == original_volumes and sql(prefix, 'SELECT count(*) FROM work_items') == original_rows
    assert install(dist, digest, prefix, config, 'rollback', extra=['--maintenance-confirmed'])['status'] == 'awaiting-validation'
    assert install(dist, digest, prefix, config, 'commit', extra=['--validation', str(prefix / 'validation.json')])['status'] == 'installed'
    assert volumes() == original_volumes
    checks.extend(['upgradeKeepsOriginalVolumes', 'compatibleProgramRollback', 'completeEncryptedBackup'])
    # Real durable incompatible ledger; do not rewrite an applied migration.
    sql(prefix, "INSERT INTO schema_migrations(version,checksum_sha256,execution_mode) VALUES('ta01_incompatible_fixture','" + 'b' * 64 + "','applied')")
    install(upgrade, new_digest, prefix, config, 'rollback', expected=1, extra=['--maintenance-confirmed'])
    assert json.loads((prefix / 'current.json').read_text())['candidate'] == digest
    checks.append('partialMigrationStopsIncompatibleRollback')
    # Source volumes stay untouched; recovery uses independent empty resources.
    compose(prefix, 'exec', '-T', 'postgres', 'createdb', '-U', 'workmesh', 'ta01_restore')
    document = json.loads(Path(current['composeFile']).read_text())
    env = document['services']['api']['environment']
    env_file = prefix / 'recovery-target.env'
    env_values = {**env, 'S3_ENDPOINT': 'http://minio:9000'}
    with env_file.open('w') as out:
        os.chmod(env_file, 0o600)
        out.write('\n'.join(k + '=' + v for k, v in env_values.items()) + '\n')
    helper = helper_image(manifest)
    code = "import{createRequire}from'node:module';const r=createRequire('/app/node_modules/@workmesh/recovery/package.json');const{S3Client,CreateBucketCommand}=r('@aws-sdk/client-s3');const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});await c.send(new CreateBucketCommand({Bucket:'ta01-restored',ObjectLockEnabledForBucket:true}));c.destroy();"
    command(['docker', 'run', '--rm', '--pull', 'never', '--network', current['project'] + '_default', '--env-file', str(env_file),
             '--entrypoint', 'node', helper, '--input-type=module', '-e', code])
    target = prefix / 'target.json'
    private(target, {'profile': current['profile'], 'project': current['project'] + '-restored', 'environment': {
        'RECOVERY_TARGET_DATABASE_URL': env['DATABASE_URL'].rsplit('/', 1)[0] + '/ta01_restore',
        'RECOVERY_TARGET_S3_ENDPOINT': 'http://minio:9000', 'RECOVERY_TARGET_S3_BUCKET': 'ta01-restored',
        'RECOVERY_TARGET_S3_ACCESS_KEY_ID': env['S3_ACCESS_KEY_ID'], 'RECOVERY_TARGET_S3_SECRET_ACCESS_KEY': env['S3_SECRET_ACCESS_KEY']}})
    report_value = install(dist, digest, prefix, config, 'restore-empty', extra=['--restore-bundle', str(backup), '--target', str(target)])
    assert report_value['status'] == 'restored-empty-target' and report_value['report']['status'] == 'passed'
    assert report_value['switched'] is False and volumes() == original_volumes
    restored = compose(prefix, 'exec', '-T', 'postgres', 'psql', '-U', 'workmesh', '-d', 'ta01_restore', '-At', '-c', 'SELECT count(*) FROM work_items').strip()
    assert restored == original_rows
    checks.append('restoreIntoEmptyTargetKeepsOriginal')
    # Remove only the exact fixture row we inserted; it never represented product SQL.
    sql(prefix, "DELETE FROM schema_migrations WHERE version='ta01_incompatible_fixture' AND checksum_sha256='" + 'b' * 64 + "'")
    assert install(dist, digest, prefix, config, 'recover-old')['status'] == 'previous-restored'


def main():
    servers = []
    prefix = None
    try:
        rebooted = STATE.exists()
        if rebooted:
            saved = json.loads(STATE.read_text())
            dist, manifest, digest = Path(saved['distribution']), saved['manifest'], saved['digest']
            command(['ip', 'route', 'del', 'default'])
        else:
            dist, manifest, digest = download()
            certificates = ROOT / 'tls'
            certificates.mkdir(mode=0o700)
            command(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(certificates / 'key.pem'),
                '-out', str(certificates / 'ca.pem'), '-days', '2', '-subj', '/CN=TA01 guest', '-addext', 'subjectAltName=IP:10.0.2.15'])
            # All candidates are on disk. Docker was installed by cloud-init;
            # removing default routes now denies registry access during acceptance.
            command(['ip', 'route', 'del', 'default'])
            checks.append('offlineNoDefaultRoute')
            saved = {'distribution': str(dist), 'manifest': manifest, 'digest': digest, 'profiles': []}
        assert 'default' not in command(['ip', 'route', 'show']).split()
        certificates = ROOT / 'tls'
        servers.append(proxy(9446, 0, certificates))
        for index, profile in enumerate(['personal', 'team', 'enterprise']):
            prefix = ROOT / profile
            config = ROOT / (profile + '-config.json')
            api_port, mcp_port, s3_port = 9443 + index * 10, 9444 + index * 10, 9445 + index * 10
            if not rebooted:
                prefix.mkdir(mode=0o700)
                (prefix / 'certificates').mkdir(mode=0o700)
                (prefix / 'certificates/ca.pem').write_bytes((certificates / 'ca.pem').read_bytes())
                private(config, {'profile': profile, 'project': 'ta01-' + profile, 'environment': {
                    'WEB_ORIGIN': 'https://10.0.2.15:' + str(api_port), 'PUBLIC_MCP_ORIGIN': 'https://10.0.2.15:' + str(mcp_port),
                    'S3_PUBLIC_ENDPOINT': 'https://10.0.2.15:' + str(s3_port),
                    'API_HOST_PORT': str(3001 + index * 10), 'MCP_HOST_PORT': str(3002 + index * 10), 'S3_HOST_PORT': str(9000 + index * 10),
                    'WORKMESH_BETA_COORDINATION_MCP': 'true', 'NODE_EXTRA_CA_CERTS': str(prefix / 'certificates/ca.pem'),
                    'WORKMESH_BETA_GITEA': 'true',
                    'AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS': '172.18.0.1/32,172.19.0.1/32,172.20.0.1/32'}})
            servers += [proxy(api_port, 3001 + index * 10, certificates), proxy(mcp_port, 3002 + index * 10, certificates), proxy(s3_port, 9000 + index * 10, certificates)]
            if rebooted:
                client = Client(certificates)
                identity = saved['profiles'][index]['identity']
                for attempt in range(120):
                    try:
                        client.request('https://10.0.2.15:' + str(api_port) + '/readyz')
                        break
                    except (AssertionError, OSError, ValueError):
                        if attempt == 119:
                            raise
                        time.sleep(1)
                result = client.request('https://10.0.2.15:' + str(api_port) + '/api/v1/auth/login', {'email': identity['email'], 'password': identity['password']})
                client.csrf = result['csrfToken']
                assert client.request('https://10.0.2.15:' + str(api_port) + '/api/v1/work-items/' + identity['itemId'])['id'] == identity['itemId']
            else:
                invalid = ROOT / (profile + '-unsupported.json')
                private(invalid, {**json.loads(config.read_text()), 'profile': 'unsupported'})
                install(dist, digest, prefix, invalid, 'check', expected=1)
                assert not (prefix / 'current.json').exists() and not (prefix / 'operator-keys.json').exists()
                for key, value in [('WORKMESH_QUEUE_BACKEND', 'none'), ('WORKMESH_ARTIFACT_BACKEND', 'filesystem')]:
                    original = json.loads(config.read_text())
                    private(invalid, {**original, 'environment': {**original['environment'], key: value}})
                    install(dist, digest, prefix, invalid, 'check', expected=1)
                    assert not (prefix / 'current.json').exists() and not (prefix / 'operator-keys.json').exists()
                checks.append('unsupportedCombinationsRejected')
                assert install(dist, digest, prefix, config, 'check')['status'] == 'checked'
                assert not (prefix / 'current.json').exists()
                lock_owner = uuid.uuid4().hex
                lock = command(['docker', 'create', '--name', 'workmesh-install-lock-ta01-' + profile,
                    '--network', 'none', '--label', 'ta01.fixture.owner=' + lock_owner, '--entrypoint', 'true', helper_image(manifest)]).strip()
                install(dist, digest, prefix, config, 'install', expected=1)
                assert not (prefix / 'current.json').exists() and not (prefix / 'operator-keys.json').exists()
                inspected_lock = json.loads(command(['docker', 'inspect', lock]))[0]
                assert inspected_lock['Config']['Labels']['ta01.fixture.owner'] == lock_owner and not inspected_lock['State']['Running']
                command(['docker', 'rm', lock])
                checks.append('projectLockRejectsBeforeDeploymentMutation')
                assert install(dist, digest, prefix, config, 'install')['status'] == 'awaiting-validation'
                assert not (prefix / 'current.json').exists()
                assert install(dist, digest, prefix, config, 'install')['status'] == 'awaiting-validation'
                measurement(prefix, 'idle')
                start = len(checks)
                identity = journey(prefix, config, certificates)
                private(prefix / 'validation.json', {'credential': identity['installationToken'], 'workItemId': identity['itemId']})
                private(prefix / 'invalid-validation.json', {'credential': 'wmi_' + 'x' * 43, 'workItemId': identity['itemId']})
                install(dist, digest, prefix, config, 'commit', expected=1, extra=['--validation', str(prefix / 'invalid-validation.json')])
                assert not (prefix / 'current.json').exists()
                checks.append('invalidCredentialCannotCommitCurrent')
                assert install(dist, digest, prefix, config, 'commit', extra=['--validation', str(prefix / 'validation.json')])['status'] == 'installed'
                assert install(dist, digest, prefix, config, 'install')['status'] == 'already-installed'
                upgrade_recovery(dist, manifest, digest, prefix, config)
                saved['profiles'].append({'profile': profile, 'status': 'passed', 'checks': checks[start:], 'identity': identity})
                # Keep peak resource competition bounded: each profile's real
                # journey is independent; all three are restarted for reboot.
                compose(prefix, 'stop', 'api', 'worker', 'mcp', 'postgres', 'redis', 'minio')
        boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        resources = {'cpu': command(['lscpu', '-J']), 'memory': Path('/proc/meminfo').read_text().splitlines()[:3],
                     'disk': command(['df', '-B1', '--output=size,used,avail', '/']).splitlines(),
                     'os': Path('/etc/os-release').read_text(),
                     'docker': command(['docker', '--version']).strip(), 'compose': command(['docker', 'compose', 'version']).strip(),
                     'hostNodeAvailable': subprocess.run(['sh', '-c', 'command -v node'], capture_output=True).returncode == 0,
                     'hostPnpmAvailable': subprocess.run(['sh', '-c', 'command -v pnpm'], capture_output=True).returncode == 0}
        assert not resources['hostNodeAvailable'] and not resources['hostPnpmAvailable']
        if rebooted:
            report({'phase': 'after-reboot', 'bootId': boot, 'kernel': command(['uname', '-a']),
                    'restartedProfiles': ['personal', 'team', 'enterprise'], 'resources': resources})
        else:
            for profile in ['personal', 'team', 'enterprise']:
                compose(ROOT / profile, 'start', 'postgres', 'redis', 'minio', 'api', 'worker', 'mcp')
            private(STATE, saved)
            (ROOT / 'reboot').touch()
            profiles = [{k: v for k, v in value.items() if k != 'identity'} for value in saved['profiles']]
            report({'phase': 'before-reboot', 'bootId': boot, 'kernel': command(['uname', '-a']),
                    'profiles': profiles, 'samples': samples, 'resources': resources, 'offline': 'no-default-route-and-pull-never'})
    except Exception as error:
        if prefix and (prefix / 'journal.json').exists():
            try:
                journal = json.loads((prefix / 'journal.json').read_text())
                diagnostics['journal'] = {'stage': journal['stage'], 'candidate': journal['candidate'],
                    'actions': [{'name': entry['name'], 'status': entry['status']} for entry in journal['actions']]}
                # Installer diagnostics contain only fixed classifications,
                # owned-container states and output hashes, never raw messages.
                diagnostics['installer'] = [entry['diagnostics'] for entry in journal['actions'] if 'diagnostics' in entry]
            except (OSError, KeyError, ValueError):
                diagnostics['journalUnavailable'] = True
        report({'phase': 'failure', 'errorType': type(error).__name__, 'diagnostics': diagnostics, 'completedChecks': checks, 'samples': samples})
        raise
    finally:
        for server in servers:
            server.shutdown()


if __name__ == '__main__':
    main()
