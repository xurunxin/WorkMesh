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


def command(args, *, expected=0, data=None, timeout=1800, expected_code=None):
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
    if expected_code is not None:
        assert expected_code in result.stderr.decode().splitlines(), 'missing expected rejection code'
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


def role_image(manifest, role):
    definition = manifest['images'][role]
    accepted = dict.fromkeys([definition['id'], definition['archiveId']])
    for image in accepted:
        result = subprocess.run(['docker', 'image', 'inspect', image], capture_output=True)
        if result.returncode == 0:
            value = json.loads(result.stdout)[0]
            assert value['Id'] in accepted and value['Architecture'] == manifest['arch']
            assert value['Config']['Labels']['org.opencontainers.image.revision'] == definition['revision']
            return value['Id']
    raise RuntimeError('trusted role image was not loaded')


def helper_image(manifest):
    return role_image(manifest, 'installer')


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


def install(dist, digest, prefix, config, action, *, expected=0, extra=(), expected_code=None):
    out = command(['sh', str(dist / 'install.sh'), str(dist), digest, str(prefix), str(config), action, *extra], expected=expected, expected_code=expected_code)
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
    def request(self, url, body=None, *, method=None, headers=None, expected=200, raw=False, metadata=False):
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
        data = response.read()
        accepted = (expected,) if isinstance(expected, int) else expected
        if response.status not in accepted:
            allowed_codes = {'VALIDATION_ERROR', 'FORBIDDEN', 'RESOURCE_SCOPE_DENIED', 'INVALID_STATE_TRANSITION',
                             'AUTH_RATE_LIMITED', 'AUTH_RATE_LIMIT_UNAVAILABLE', 'FEATURE_DISABLED'}
            try:
                code = json.loads(data).get('error', {}).get('code')
            except (ValueError, AttributeError):
                code = None
            diagnostics.update(httpStatus=response.status, expectedHttpStatus=expected,
                               responseSha256=hashlib.sha256(data).hexdigest(),
                               apiErrorCode=code if code in allowed_codes else 'unknown')
        assert response.status in accepted, (url.split('?')[0], response.status, expected)
        value = data if raw else json.loads(data)
        return (value, response.status, response.headers.get('Retry-After')) if metadata else value


def journey(prefix, config, certificates):
    document = json.loads(config.read_text())
    env = document['environment']
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
    states = client.request(origin + '/api/v1/teams/' + team['id'] + '/states')['items']
    assert states and states[0]['id']
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
    body = {'teamId': team['id'], 'projectId': project['id'], 'statusId': states[0]['id'],
            'responsibleHumanActorId': me['id'], 'title': 'TA01 first task'}
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
    cursor_before = sql(prefix, 'SELECT COALESCE(max(cursor),0) FROM domain_events')
    second = client.request(origin + '/api/v1/work-items', {**body, 'title': 'durable while worker stopped'})
    assert int(sql(prefix, "SELECT count(*) FROM outbox_events WHERE status<>'delivered'")) > 0
    # This profile owns its Redis. Erase only its derived event wake stream;
    # credential limiter keys and PostgreSQL facts remain untouched.
    compose(prefix, 'exec', '-T', 'redis', 'redis-cli', 'DEL', 'workmesh:domain-events')
    assert compose(prefix, 'exec', '-T', 'redis', 'redis-cli', 'EXISTS', 'workmesh:domain-events').strip() == '0'
    events = client.request(origin + '/api/v1/events?cursor=' + cursor_before)
    assert any(event['aggregate_id'] == second['id'] and int(event['cursor']) > int(cursor_before) for event in events)
    checks.append('lostWakeupStillReadsCommittedCursor')
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
    # Use a distinct absent subject with the deployed, unchanged Redis clock and
    # budgets. Its backoff must actually reject; never flush limiter state.
    limiter_client = Client(certificates)
    subject = 'rate-limit-' + str(uuid.uuid4()) + '@example.test'
    statuses = []
    for _ in range(16):
        reply, status_code, retry_after = limiter_client.request(origin + '/api/v1/auth/login',
            {'email': subject, 'password': 'unrelated-password'}, expected=(401, 429), metadata=True)
        statuses.append(status_code)
        if status_code == 429:
            assert reply['error']['code'] == 'AUTH_RATE_LIMITED'
            assert isinstance(retry_after, str) and retry_after.isascii() and retry_after.isdigit()
            assert int(retry_after) > 0
            break
        assert reply['error']['code'] == 'INVALID_CREDENTIALS'
    assert 401 in statuses and statuses[-1] == 429, 'installed credential limiter did not reject'
    samples.append({'phase': 'credential-rate-limit', 'profile': document['profile'],
                    'statuses': statuses, 'retryAfterSeconds': int(retry_after)})
    checks.append('realCredentialRateLimit429')
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
    if current['profile'] == 'personal':
        original_config = json.loads(config.read_text())
        original_journal_bytes = (prefix / 'journal.json').read_bytes()
        rejected = prefix / 'data-binding-negative.json'
        for updated, code in [
            ({**original_config, 'profile': 'team'}, 'INSTALL_PROFILE_CHANGE_REQUIRES_MIGRATION'),
            ({**original_config, 'environment': {**original_config['environment'], 'S3_BUCKET': 'ta01-other-bucket'}}, 'INSTALL_DATA_BINDINGS_CHANGED'),
            ({**original_config, 'environment': {**original_config['environment'], 'WORKMESH_MASTER_KEY': os.urandom(32).hex()}}, 'INSTALL_DATA_BINDINGS_CHANGED'),
        ]:
            private(rejected, updated)
            install(upgrade, new_digest, prefix, rejected, 'upgrade', expected=1,
                    expected_code=code, extra=['--maintenance-confirmed'])
            assert (prefix / 'current.json').read_bytes() == current_bytes
            assert (prefix / 'journal.json').read_bytes() == original_journal_bytes
            assert volumes() == original_volumes
        checks.append('dataBindingChangesRejectedBeforeMutation')
    # Deliberately mismatched digest tests the real deployed pre-migration boundary.
    install(upgrade, '0' * 64, prefix, config, 'upgrade', expected=1, extra=['--maintenance-confirmed'])
    assert (prefix / 'current.json').read_bytes() == current_bytes and volumes() == original_volumes
    checks.append('preMigrationFailureKeepsCurrent')
    assert install(upgrade, new_digest, prefix, config, 'upgrade', extra=['--maintenance-confirmed'])['status'] == 'awaiting-validation'
    # Model an interruption after health started but before pending was written.
    # Mutate only this test's private installer files, never application data.
    journal_file = prefix / 'journal.json'
    original_journal = journal_file.read_bytes()
    pending_file = prefix / 'pending.json'
    pending_held = prefix / 'pending-interruption-fixture.json'
    assert not pending_held.exists()
    pending_file.rename(pending_held)
    try:
        interrupted = json.loads(original_journal)
        interrupted['stage'] = 'migrated'
        missing = {k: v for k, v in interrupted.items() if k != 'candidateManifestJson'}
        private(journal_file, missing)
        install(dist, digest, prefix, config, 'recover-old', expected=1, expected_code='INSTALL_RECOVERY_CANDIDATE_REQUIRED')
        corrupt = {**interrupted, 'candidateManifestJson': interrupted['candidateManifestJson'] + ' '}
        private(journal_file, corrupt)
        install(dist, digest, prefix, config, 'recover-old', expected=1, expected_code='INSTALL_RECOVERY_CANDIDATE_INVALID')
        assert (prefix / 'current.json').read_bytes() == current_bytes and volumes() == original_volumes
    finally:
        journal_file.write_bytes(original_journal)
        pending_held.rename(pending_file)
    checks.append('interruptedHealthWithoutPendingRejectsUnknownCandidate')
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
    helper = role_image(manifest, 'api')
    code = "import{createRequire}from'node:module';import{realpathSync}from'node:fs';const r=createRequire(realpathSync('/app/node_modules/@workmesh/recovery/package.json'));const{S3Client,CreateBucketCommand}=r('@aws-sdk/client-s3');const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});await c.send(new CreateBucketCommand({Bucket:'ta01-restored',ObjectLockEnabledForBucket:true}));c.destroy();"
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
    debugger = None
    native_diagnostic = json.loads(Path('/opt/server-install/expected.json').read_text()).get('nativeDiagnostic') is True
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
        for index, profile in enumerate(['team'] if native_diagnostic else ['personal', 'team', 'enterprise']):
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
                if index == 0:
                    # Candidate staging and deployment have independent original
                    # command budgets; neither starts until its own preflight passes.
                    staged = install(dist, digest, prefix, config, 'stage')
                    assert staged['status'] == 'staged-candidate'
                    assert not (prefix / 'current.json').exists()
                    assert not command(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=ta01-personal']).strip()
                    checks.append('candidateStagedBeforeDeployment')
                assert install(dist, digest, prefix, config, 'install')['status'] == 'awaiting-validation'
                assert not (prefix / 'current.json').exists()
                assert install(dist, digest, prefix, config, 'install')['status'] == 'awaiting-validation'
                measurement(prefix, 'idle')
                start = len(checks)
                if native_diagnostic:
                    from native_diagnostic import NativeDebugger
                    release = json.loads((prefix / 'pending.json').read_text())
                    ids = command(['docker', 'ps', '-q', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + release['project']]).split()
                    containers = json.loads(command(['docker', 'inspect', *ids]))
                    mcp = [entry for entry in containers if entry['Config']['Labels'].get('com.docker.compose.service') == 'mcp'
                           and entry['Config']['Labels'].get('io.workmesh.installation') == release['installationId']
                           and entry['Config']['Labels'].get('io.workmesh.installation-root') == hashlib.sha256(str(prefix).encode()).hexdigest()]
                    assert len(mcp) == 1 and mcp[0]['Image'] in [manifest['images']['mcp']['id'], manifest['images']['mcp']['archiveId']]
                    debugger = NativeDebugger(mcp[0]['State']['Pid'])
                identity = journey(prefix, config, certificates)
                if native_diagnostic:
                    trace = debugger.finish()
                    debugger = None
                    diagnostics['nativeTrace'] = trace
                    report({'phase': 'native-diagnostic', 'nativeTrace': trace, 'completedChecks': checks})
                    compose(prefix, 'stop', 'api', 'worker', 'mcp', 'postgres', 'redis', 'minio')
                    return
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
        if native_diagnostic and hasattr(error, 'native_trace'):
            diagnostics['nativeTrace'] = error.native_trace
        if debugger:
            try:
                diagnostics['nativeTrace'] = debugger.finish()
            except Exception as trace_error:
                diagnostics['nativeTraceUnavailable'] = type(trace_error).__name__
        if prefix and (prefix / 'journal.json').exists():
            try:
                journal = json.loads((prefix / 'journal.json').read_text())
                diagnostics['journal'] = {'stage': journal['stage'], 'candidate': journal['candidate'],
                    'actions': [{key: entry[key] for key in ['name', 'status', 'startedAt', 'finishedAt'] if key in entry} for entry in journal['actions']]}
                # Installer diagnostics contain only fixed classifications,
                # owned-container states and output hashes, never raw messages.
                diagnostics['installer'] = [entry['diagnostics'] for entry in journal['actions'] if 'diagnostics' in entry]
                failure_file = prefix / 'backups' / journal['id'] / 'failure.json'
                if failure_file.is_file() and not failure_file.is_symlink():
                    failure = json.loads(failure_file.read_text())
                    known = {'RECOVERY_DATABASE_LOCKED', 'RECOVERY_DATABASE_CLIENTS_ACTIVE', 'RECOVERY_MAINTENANCE_CONFIRMATION_REQUIRED',
                             'RECOVERY_ARTIFACT_OBJECT_MISSING', 'RECOVERY_ARTIFACT_CHECKSUM_MISMATCH',
                             'RECOVERY_UPLOAD_OBJECT_MISSING', 'RECOVERY_UPLOAD_CHECKSUM_MISMATCH',
                             'RECOVERY_ARCHIVE_OBJECT_VERSION_MISSING', 'RECOVERY_POSTGRES_TOOL_FAILED',
                             'WORKMESH_MASTER_KEY_INVALID', 'WORKMESH_BUILD_SHA_INVALID', 'EACCES', 'ENOENT', 'EEXIST', 'ENOSPC'}
                    code = failure.get('error', {}).get('code')
                    diagnostics['backupFailure'] = {'code': code if code in known else 'unknown',
                        'reportSha256': hashlib.sha256(failure_file.read_bytes()).hexdigest(),
                        'messageSha256': hashlib.sha256(failure.get('error', {}).get('message', '').encode()).hexdigest()}
                # The outer Docker client may time out before the installer can
                # finish its journal. Inspect only this installation's objects.
                ids = subprocess.run(['docker', 'ps', '-aq', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + journal['project']], capture_output=True, timeout=30)
                ids.check_returncode()
                if ids.stdout.split():
                    inspected = subprocess.run(['docker', 'inspect', *ids.stdout.decode().split()], capture_output=True, timeout=30)
                    inspected.check_returncode()
                    allowed = {'api', 'worker', 'mcp', 'postgres', 'redis', 'minio', 'minio-init', 'migrate'}
                    projected = []
                    for info in json.loads(inspected.stdout):
                        labels = info['Config']['Labels']
                        if labels.get('io.workmesh.installation') != journal['installationId'] or labels.get('io.workmesh.installation-root') != hashlib.sha256(str(prefix).encode()).hexdigest():
                            continue
                        service = labels.get('com.docker.compose.service')
                        if service not in allowed:
                            continue
                        state = info['State']
                        health = state.get('Health', {})
                        # Capture only this installation's logs. The trusted
                        # classifier receives bytes over stdin and emits fixed
                        # categories, bounded module locations and hashes.
                        logs = subprocess.run(['docker', 'logs', '--tail', '60', info['Id']], capture_output=True, timeout=30)
                        code = "import{readFileSync}from'node:fs';import{commandFailure}from'/opt/workmesh/server-distribution/diagnostics.mjs';const p=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(commandFailure({status:p.status,stdout:Buffer.from(p.stdout,'base64'),stderr:Buffer.from(p.stderr,'base64')})));"
                        import base64
                        classified = subprocess.run(['docker', 'run', '--rm', '-i', '--pull', 'never', '--network', 'none',
                            '--read-only', '--label', 'io.workmesh.diagnostic.installation=' + journal['installationId'],
                            '--entrypoint', 'node', helper_image(manifest), '--input-type=module', '-e', code],
                            input=json.dumps({'status': logs.returncode, 'stdout': base64.b64encode(logs.stdout).decode(),
                                              'stderr': base64.b64encode(logs.stderr).decode()}).encode(), capture_output=True, timeout=60)
                        classified.check_returncode()
                        log_projection = json.loads(classified.stdout)

                        projected.append({'id': info['Id'], 'service': service, 'running': state['Running'],
                            'exitCode': state['ExitCode'], 'oom': state['OOMKilled'], 'restarts': info['RestartCount'],
                            'health': health.get('Status') if health.get('Status') in {'starting', 'healthy', 'unhealthy'} else None,
                            'log': log_projection,
                            'probes': [{'exitCode': probe['ExitCode'], 'outputSha256': hashlib.sha256(probe.get('Output', '').encode()).hexdigest()} for probe in health.get('Log', [])[-3:]]})
                    diagnostics['containers'] = projected
            except (OSError, KeyError, ValueError):
                diagnostics['journalUnavailable'] = True
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                diagnostics['containerStatusUnavailable'] = True
        report({'phase': 'failure', 'errorType': type(error).__name__, 'diagnostics': diagnostics, 'completedChecks': checks, 'samples': samples})
        raise
    finally:
        for server in servers:
            server.shutdown()


if __name__ == '__main__':
    main()
