"""Accept the installed distribution in an isolated full guest, without host Node."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
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
install_actions = 0


def progress(profile, stage):
    assert profile in {'personal', 'team', 'enterprise'}
    assert stage in {'health-ready', 'business-committed', 'profile-completed'}
    # The oneshot can be terminated before its final receipt. Keep only fixed
    # milestones in the bounded serial evidence, never identities or requests.
    print(json.dumps({'tag': 'ta01-progress', 'profile': profile, 'stage': stage}), flush=True)


def failure_progress(stage, error, context, journal=None, containers=None):
    assert stage in {'caught', 'journal', 'owned-states'}
    known_errors = {'RuntimeError', 'AssertionError', 'TimeoutExpired', 'TimeoutError', 'RemoteDisconnected',
                    'HTTPError', 'URLError', 'ConnectionResetError', 'CalledProcessError', 'JSONDecodeError', 'FileNotFoundError'}
    known_codes = {'INSTALL_BUSINESS_VALIDATION_FAILED', 'INSTALL_BUSINESS_VALIDATION_TIMEOUT', 'INSTALL_PREFLIGHT_OR_OPERATION_FAILED',
                   'INSTALL_DOCKER_COMMAND_FAILED', 'INSTALL_IMAGE_IMPORT_FAILED',
                   'INSTALL_INCOMPATIBLE_LEDGER_RESTORE_REQUIRED', 'INSTALL_RECOVERY_CANDIDATE_INVALID'}
    value = {'tag': 'ta01-failure', 'stage': stage,
             'errorType': type(error).__name__ if type(error).__name__ in known_errors else 'OtherError'}
    safe_name = lambda name, allowed: name if isinstance(name, str) and name in allowed else 'unknown'
    if safe_name(context.get('command'), {'sh', 'docker', 'ip', 'uname', 'lscpu', 'df'}) != 'unknown':
        value['command'] = context['command']
    if type(context.get('exitCode')) is int:
        value['exitCode'] = context['exitCode']
    if context.get('timedOut') is True:
        value['timedOut'] = True
    for key in ['stderrSha256', 'stdoutSha256']:
        digest = context.get(key)
        if isinstance(digest, str) and re.fullmatch('[a-f0-9]{64}', digest):
            value[key] = digest
    codes = context.get('codes', [])
    value['codes'] = sorted(known_codes.intersection(code for code in codes if isinstance(code, str))) if isinstance(codes, list) else []
    if journal is not None:
        journal = journal if isinstance(journal, dict) else {}
        allowed_stages = {'verified', 'staged', 'backed_up', 'migrated', 'healthy', 'committed'}
        value['journalStage'] = safe_name(journal.get('stage'), allowed_stages)
        actions = journal.get('actions', [])
        if isinstance(actions, list) and actions:
            last = actions[-1] if isinstance(actions[-1], dict) else {}
            allowed_actions = {'import-images', 'drain-admission', 'complete-backup', 'start-data-services',
                               'initialize-locked-bucket', 'apply-migration-ledger', 'verify-health-and-ledger',
                               'validate-business-read', 'switch-current', 'stop-unvalidated-runtime'}
            value['lastAction'] = safe_name(last.get('name'), allowed_actions)
            value['lastActionStatus'] = safe_name(last.get('status'), {'intent', 'completed', 'failed'})
    if containers is not None:
        value['containers'] = []
        for entry in containers[:8]:
            if not isinstance(entry, dict) or safe_name(entry.get('service'), {'api', 'worker', 'mcp', 'postgres', 'redis', 'minio', 'minio-init', 'migrate'}) == 'unknown':
                continue
            item = {'service': entry['service']}
            for key in ['running', 'oom']:
                if type(entry.get(key)) is bool:
                    item[key] = entry[key]
            for key in ['exitCode', 'restarts']:
                if type(entry.get(key)) is int:
                    item[key] = entry[key]
            if safe_name(entry.get('health'), {'starting', 'healthy', 'unhealthy'}) != 'unknown':
                item['health'] = entry['health']
            value['containers'].append(item)
    # Emit before slow Docker log classifiers. No messages, arguments, paths,
    # environment, identities or unknown classifications enter serial output.
    print(json.dumps(value), flush=True)


def project_container_events(raw, roles, since_nano, until_nano):
    known = {'api', 'worker', 'mcp', 'postgres', 'redis', 'minio', 'minio-init', 'migrate'}
    if (not isinstance(roles, dict) or len(roles) > 8 or not roles
            or any(not isinstance(key, str) or not re.fullmatch('[a-f0-9]{64}', key)
                   or role not in known for key, role in roles.items())
            or type(since_nano) is not int or type(until_nano) is not int
            or not 0 <= since_nano <= until_nano):
        raise ValueError('container event scope invalid')
    events, truncated = [], False
    for line in raw.decode('utf8', errors='replace').splitlines():
        try:
            value = json.loads(line)
        except ValueError:
            continue
        if (not isinstance(value, dict) or set(value) != {'timeNano', 'event', 'id', 'exitCode'}
                or not isinstance(value['id'], str) or value['id'] not in roles
                or not isinstance(value['event'], str) or value['event'] not in {'die', 'restart', 'oom'}
                or type(value['timeNano']) is not int or not since_nano <= value['timeNano'] <= until_nano
                or not isinstance(value['exitCode'], str)):
            continue
        entry = {key: value[key] for key in ['timeNano', 'event', 'id']}
        entry['service'] = roles[value['id']]
        if value['event'] == 'die':
            if not re.fullmatch('[0-9]{1,3}', value['exitCode']) or int(value['exitCode']) > 255:
                continue
            entry['exitCode'] = int(value['exitCode'])
        if len(events) == 64:
            truncated = True
            break
        events.append(entry)
    return {'events': events, 'truncated': truncated}


def collect_container_events(journal, owned):
    # IDs and ownership labels were checked by the caller. Historical events
    # contain only fixed fields; never request the full Actor attributes.
    starts = [datetime.fromisoformat(entry['startedAt'].replace('Z', '+00:00'))
              for entry in journal['actions'] if 'startedAt' in entry]
    if not starts or any(value.tzinfo is None for value in starts):
        raise ValueError('container event interval unavailable')
    since = min(starts)
    until = datetime.now(timezone.utc)
    roles = {entry['id']: entry['service'] for _, entry in owned}
    args = ['docker', 'events', '--since', since.isoformat(), '--until', until.isoformat(),
            '--filter', 'type=container', '--filter', 'event=die', '--filter', 'event=restart', '--filter', 'event=oom']
    for identifier in roles:
        args.extend(['--filter', 'container=' + identifier])
    args.extend(['--format', '{"timeNano":{{.TimeNano}},"event":"{{.Action}}","id":"{{.Actor.ID}}","exitCode":"{{index .Actor.Attributes "exitCode"}}"}'])
    result = subprocess.run(args, capture_output=True, timeout=10)
    result.check_returncode()
    return project_container_events(result.stdout, roles, int(since.timestamp() * 1e9), int(until.timestamp() * 1e9))


def project_database_budget(raw):
    match = re.fullmatch(rb'([0-9]{1,6})\|([0-9]{1,6})\|(on|off)\s*', raw)
    if match is None:
        raise ValueError('database budget response invalid')
    maximum, backends = map(int, match.group(1, 2))
    if not 1 <= backends <= maximum:
        raise ValueError('database budget bounds invalid')
    return {'maxConnections': maximum, 'backendsIncludingDiagnostic': backends,
            'trackActivitiesEnabled': match.group(3) == b'on'}


def database_budget(identifier):
    if not re.fullmatch('[a-f0-9]{64}', identifier):
        raise ValueError('database budget target invalid')
    # Only aggregates from this installation's verified PostgreSQL container.
    # The diagnostic connection itself is counted. No query text or identities.
    query = "SELECT current_setting('max_connections'), count(*), current_setting('track_activities') FROM pg_stat_activity WHERE backend_type='client backend'"
    result = subprocess.run(['docker', 'exec', '-e', 'PGCONNECT_TIMEOUT=5',
        '-e', 'PGOPTIONS=-c statement_timeout=5000', identifier, 'psql', '--no-psqlrc',
        '-U', 'workmesh', '-d', 'workmesh', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query],
        capture_output=True, timeout=10)
    if result.returncode:
        return {'available': False, 'exitCode': result.returncode,
                'stderrSha256': hashlib.sha256(result.stderr).hexdigest(),
                'stdoutSha256': hashlib.sha256(result.stdout).hexdigest(),
                'connectionLimitReported': any(text in result.stderr.lower() for text in
                    [b'too many clients already', b'remaining connection slots are reserved'])}
    return {'available': True, **project_database_budget(result.stdout)}


def installer_timings(raw, context):
    if (not isinstance(context, dict) or set(context) != {'tag', 'sequence', 'profile', 'action'} or context['tag'] != 'ta01-install-action'
            or type(context['sequence']) is not int or not 1 <= context['sequence'] <= 128
            or not isinstance(context['profile'], str) or not isinstance(context['action'], str)
            or context['profile'] not in {'personal', 'team', 'enterprise', 'fixture'}
            or context['action'] not in {'check', 'stage', 'install', 'upgrade', 'rollback', 'commit', 'recover-old', 'restore-empty'}):
        return
    phases = {'verify-bundle', 'load-config-validator', 'render-config', 'import-images', 'drain-admission',
              'complete-backup', 'start-data-services', 'initialize-locked-bucket', 'apply-migration-ledger',
              'verify-health-and-ledger', 'validate-business-read'}
    fields = {'phase', 'elapsedMilliseconds', 'userCpuMicroseconds', 'systemCpuMicroseconds'}
    emitted = 0
    for line in raw.decode('utf8', errors='replace').splitlines():
        if not line.startswith('INSTALL_TIMING '):
            continue
        try:
            value = json.loads(line.removeprefix('INSTALL_TIMING '))
        except ValueError:
            continue
        if (not isinstance(value, dict) or set(value) != fields or not isinstance(value['phase'], str) or value['phase'] not in phases
                or any(type(value[key]) is not int or not 0 <= value[key] <= 2**53 - 1 for key in fields - {'phase'})):
            continue
        print(json.dumps({**context, 'tag': 'ta01-installer-phase', **value}), flush=True)
        emitted += 1
        if emitted == 16:
            break


def command(args, *, expected=0, data=None, timeout=1800, expected_code=None, timing_context=None):
    try:
        result = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        if timing_context is not None:
            installer_timings(error.stderr or b'', timing_context)
        diagnostics.update(command=args[0].rsplit('/', 1)[-1], timedOut=True, timeoutSeconds=timeout,
                           stdoutSha256=hashlib.sha256(error.stdout or b'').hexdigest(),
                           stderrSha256=hashlib.sha256(error.stderr or b'').hexdigest())
        raise
    if timing_context is not None:
        installer_timings(result.stderr, timing_context)
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
    global install_actions
    assert action in {'check', 'stage', 'install', 'upgrade', 'rollback', 'commit', 'recover-old', 'restore-empty'}
    install_actions += 1
    profile = prefix.name if prefix.name in {'personal', 'team', 'enterprise'} else 'fixture'
    fields = {'tag': 'ta01-install-action', 'sequence': install_actions, 'profile': profile, 'action': action}
    started = time.monotonic()
    completed = False
    if install_actions <= 128:
        print(json.dumps({**fields, 'state': 'started'}), flush=True)
    try:
        out = command(['sh', str(dist / 'install.sh'), str(dist), digest, str(prefix), str(config), action, '--trace-timings', *extra],
                      expected=expected, expected_code=expected_code, timing_context=fields)
        result = json.loads(out) if expected == 0 else None
        completed = True
        return result
    finally:
        if fields['sequence'] <= 128:
            print(json.dumps({**fields, 'state': 'finished' if completed else 'failed',
                              'elapsedMilliseconds': round((time.monotonic() - started) * 1000)}), flush=True)


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


def mcp_read(client, url, credential, method, params, request_id):
    raw = client.request(url, {'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params},
        headers={'X-WorkMesh-Installation-Token': credential, 'accept': 'application/json, text/event-stream'}, raw=True).decode()
    messages = []
    if raw.lstrip().startswith(('data:', 'event:', ':')):
        for frame in raw.replace('\r\n', '\n').split('\n\n'):
            data = '\n'.join(line[5:].removeprefix(' ') for line in frame.split('\n') if line.startswith('data:'))
            if data:
                messages.append(json.loads(data))
    else:
        messages.append(json.loads(raw))
    matching = [reply for reply in messages if isinstance(reply, dict)
                and reply.get('jsonrpc') == '2.0' and reply.get('id') == request_id]
    assert len(matching) == 1
    reply = matching[0]
    assert 'error' not in reply and not reply['result'].get('isError')
    return reply['result']


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
    for i, (method, params) in enumerate([('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
        'clientInfo': {'name': 'ta01-guest', 'version': '1.0.0'}}), ('tools/call', {'name': 'verify_connection', 'arguments': {}}),
        ('tools/call', {'name': 'get_workmesh_context', 'arguments': {}})]):
        mcp_read(client, redeemed['mcp']['url'], redeemed['installation_token'], method, params, i + 1)
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
            'artifactId': status['artifactId'], 'uploadId': upload['id'], 'installationToken': redeemed['installation_token'],
            'mcpUrl': redeemed['mcp']['url'], 'workItemBody': body}


def observed_commit(dist, digest, prefix, config, manifest, target):
    from native_diagnostic import observe_native_action
    def business_started():
        entries = json.loads((prefix / 'journal.json').read_text())['actions']
        reads = [entry for entry in entries if entry['name'] == 'validate-business-read']
        assert len(reads) == 1
        return datetime.fromisoformat(reads[0]['startedAt'].replace('Z', '+00:00')).timestamp()
    return observe_native_action(
        lambda: install(dist, digest, prefix, config, 'commit', extra=['--validation', str(prefix / 'validation.json')]),
        lambda: prepare_native_watcher(prefix, manifest), business_started, target=target)


def upgrade_recovery(dist, manifest, digest, prefix, config, *, include_failed_health=True, native_diagnostic=False):
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
    if native_diagnostic and manifest['arch'] == 'arm64':
        outcome, trace = observed_commit(upgrade, new_digest, prefix, config, manifest, 'personal-upgrade-commit')
        assert outcome['status'] == 'installed'
        return trace
    assert install(upgrade, new_digest, prefix, config, 'commit', extra=['--validation', str(prefix / 'validation.json')])['status'] == 'installed'
    journal = json.loads((prefix / 'journal.json').read_text())
    assert journal['stage'] == 'committed' and journal['backup']['manifestSha256']
    backup = Path(journal['backup']['directory'])
    assert (backup / 'manifest.json').exists() and (backup / 'manifest.hmac-sha256').exists()
    assert volumes() == original_volumes and sql(prefix, 'SELECT count(*) FROM work_items') == original_rows
    assert install(dist, digest, prefix, config, 'rollback', extra=['--maintenance-confirmed'])['status'] == 'awaiting-validation'
    if native_diagnostic:
        # Register concurrently with the original commit preflight. Do not wait
        # before its request, repeat it, or turn a missed boundary into evidence.
        outcome, trace = observed_commit(dist, digest, prefix, config, manifest, 'team-rollback-commit')
        assert outcome['status'] == 'installed' and volumes() == original_volumes
        return trace
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
    if include_failed_health:
        failed_health_stops_runtime(dist, manifest, prefix, config, original_volumes, volumes)


def failed_health_stops_runtime(dist, manifest, prefix, config, original_volumes, volumes):
    # Same binaries, a deliberately unknown compatibility fingerprint, and a
    # failing health probe form an isolated failure fixture, not an older release.
    fixture = ROOT / 'incompatible-health-fixture'
    altered = {**manifest, 'release': manifest['release'] + '.unhealthy',
               'runtimeFingerprint': hashlib.sha256(b'ta01-unknown-runtime-fixture').hexdigest()}
    if not fixture.exists():
        fixture.mkdir(mode=0o700)
        for entry in {entry['path']: entry for entry in manifest['files'] + manifest['chunks'] + manifest['bootstrapChunks']}.values():
            target = fixture / entry['path']
            target.parent.mkdir(mode=0o700, exist_ok=True)
            os.link(dist / entry['path'], target)
        (fixture / 'manifest.json').write_text(json.dumps(altered, indent=2) + '\n')
    fixture_digest = hashlib.sha256((fixture / 'manifest.json').read_bytes()).hexdigest()
    journal_file = prefix / 'journal.json'
    original_journal = journal_file.read_bytes()
    original_current = (prefix / 'current.json').read_bytes()
    stopped, injected = threading.Event(), threading.Event()
    injection_errors = []
    release_dir = prefix / 'releases' / (altered['release'] + '-' + manifest['arch'])
    def inject_health_failure():
        try:
            while not stopped.wait(0.1):
                journal = json.loads(journal_file.read_text())
                if journal['candidate'] != fixture_digest or not any(
                    entry['name'] == 'apply-migration-ledger' and entry['status'] == 'intent' for entry in journal['actions']):
                    continue
                file = release_dir / 'compose.json'
                document = json.loads(file.read_text())
                labels = document['services']['mcp']['labels']
                assert labels['io.workmesh.installation'] == journal['installationId']
                assert labels['io.workmesh.installation-root'] == hashlib.sha256(str(prefix).encode()).hexdigest()
                document['services']['mcp']['healthcheck'] = {'test': ['CMD', 'false'],
                    'interval': '1s', 'timeout': '1s', 'retries': 1, 'start_period': '0s'}
                temporary = file.with_name(file.name + '.health-fixture.tmp')
                with temporary.open('x') as output:
                    os.chmod(temporary, 0o600)
                    json.dump(document, output)
                os.replace(temporary, file)
                injected.set()
                return
        except Exception as error:
            injection_errors.append(type(error).__name__)
    monitor = threading.Thread(target=inject_health_failure)
    monitor.start()
    try:
        install(fixture, fixture_digest, prefix, config, 'upgrade', expected=1, extra=['--maintenance-confirmed'])
    finally:
        stopped.set()
        monitor.join()
    assert injected.is_set() and not injection_errors
    journal = json.loads(journal_file.read_text())
    assert journal['recovery']['status'] == 'stopped-restore-required'
    stop_action = next(entry for entry in journal['actions'] if entry['name'] == 'stop-unvalidated-runtime')
    assert stop_action['status'] == 'completed'
    current = json.loads(original_current)
    infos = json.loads(command(['docker', 'inspect', *compose(prefix, 'ps', '-aq').split()]))
    runtime = [entry for entry in infos if entry['Config']['Labels'].get('com.docker.compose.service') in {'api', 'worker', 'mcp'}]
    expected_roles = set(json.loads((release_dir / 'compose.json').read_text())['services']) & {'api', 'worker', 'mcp'}
    assert {entry['Config']['Labels']['com.docker.compose.service'] for entry in runtime} == expected_roles
    assert all(entry['Config']['Labels']['io.workmesh.installation'] == journal['installationId']
               and entry['Config']['Labels']['io.workmesh.installation-root'] == current['rootHash']
               and not entry['State']['Running'] for entry in runtime)
    assert (prefix / 'current.json').read_bytes() == original_current and volumes() == original_volumes
    samples.append({'phase': 'incompatible-health-failure', 'profile': current['profile'],
                    'candidate': fixture_digest, 'journalSha256': hashlib.sha256(journal_file.read_bytes()).hexdigest(),
                    'recovery': journal['recovery']['status'], 'stoppedServices': sorted(expected_roles)})
    checks.append('failedHealthStopsIncompatibleRuntimeAndKeepsVolumes')
    # Only after all failure assertions passed, restore this known same-binary
    # fixture's private journal and original Compose. Unexpected failure is kept.
    private(prefix / 'failed-health-fixture-journal.json', journal)
    journal_file.write_bytes(original_journal)
    compose(prefix, 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '180', 'api', 'worker', 'mcp')


def prepare_native_watcher(prefix, manifest):
    from native_diagnostic import NativeCrashWatcher, node_process_pid
    release = json.loads((prefix / 'pending.json').read_text())
    ids = command(['docker', 'ps', '-q', '--no-trunc', '--filter',
                   'label=com.docker.compose.project=' + release['project']], timeout=30).split()
    containers = json.loads(command(['docker', 'inspect', *ids], timeout=30))
    mcp = [entry for entry in containers if entry['Config']['Labels'].get('com.docker.compose.service') == 'mcp'
           and entry['Config']['Labels'].get('io.workmesh.installation') == release['installationId']
           and entry['Config']['Labels'].get('io.workmesh.installation-root') == hashlib.sha256(str(prefix).encode()).hexdigest()]
    assert len(mcp) == 1 and mcp[0]['Image'] in [manifest['images']['mcp']['id'], manifest['images']['mcp']['archiveId']]
    assert mcp[0]['HostConfig']['ReadonlyRootfs'] is True
    init_pid = mcp[0]['State']['Pid']
    return NativeCrashWatcher(node_process_pid(init_pid), container_init_pid=init_pid)


def main():
    servers = []
    prefix = None
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
        reboot_checks = []
        native_profile = 'personal' if manifest['arch'] == 'arm64' else 'team'
        profiles = (['personal'] if native_profile == 'personal' else ['personal', 'team']) if native_diagnostic else ['personal', 'team', 'enterprise']
        for index, profile in enumerate(profiles):
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
                origin = 'https://10.0.2.15:' + str(api_port)
                mcp_read(client, identity['mcpUrl'], identity['installationToken'], 'initialize',
                    {'protocolVersion': '2024-11-05', 'capabilities': {},
                     'clientInfo': {'name': 'ta01-reboot', 'version': '1.0.0'}}, 1)
                mcp_result = mcp_read(client, identity['mcpUrl'], identity['installationToken'], 'tools/call',
                    {'name': 'get_work_item', 'arguments': {'workItemId': identity['itemId']}}, 2)
                resource = mcp_result.get('structuredContent', {}).get('data')
                if resource is None:
                    resource = json.loads(next(item['text'] for item in mcp_result['content'] if item['type'] == 'text'))
                assert resource['id'] == identity['itemId']
                link = client.request(origin + '/api/v1/artifact-upload-intents/' + identity['uploadId'] + '/download')
                assert client.request(link['downloadUrl'], raw=True) == b'TA01 installed artifact\n'
                item = client.request(origin + '/api/v1/work-items', {**identity['workItemBody'], 'title': 'TA01 after reboot'})
                item_id = str(uuid.UUID(item['id']))
                query = "SELECT count(*),count(*) FILTER(WHERE o.status<>'delivered') FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id WHERE e.aggregate_id='" + item_id + "'"
                for _ in range(120):
                    total, pending_count = map(int, sql(prefix, query).split('|'))
                    if total > 0 and pending_count == 0:
                        break
                    time.sleep(1)
                assert total > 0 and pending_count == 0
                reboot_checks.append({'profile': profile, 'checks': ['authenticatedApiAfterReboot',
                    'authenticatedMcpAfterReboot', 'artifactBytesAfterReboot', 'newOutboxDeliveredAfterReboot']})
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
                progress(profile, 'health-ready')
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
                progress(profile, 'business-committed')
                trace = upgrade_recovery(dist, manifest, digest, prefix, config,
                    native_diagnostic=native_diagnostic and profile == native_profile)
                if native_diagnostic and profile == native_profile:
                    diagnostics['nativeTrace'] = trace
                    report({'phase': 'native-diagnostic', 'nativeTrace': trace, 'completedChecks': checks,
                            'preludeProfiles': [{k: v for k, v in entry.items() if k != 'identity'} for entry in saved['profiles']]})
                    compose(prefix, 'stop', 'api', 'worker', 'mcp', 'postgres', 'redis', 'minio')
                    return
                saved['profiles'].append({'profile': profile, 'status': 'passed', 'checks': checks[start:], 'identity': identity})
                progress(profile, 'profile-completed')
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
                    'restartedProfiles': ['personal', 'team', 'enterprise'], 'checks': reboot_checks, 'resources': resources})
        else:
            for profile in ['personal', 'team', 'enterprise']:
                compose(ROOT / profile, 'start', 'postgres', 'redis', 'minio', 'api', 'worker', 'mcp')
            private(STATE, saved)
            (ROOT / 'reboot').touch()
            profiles = [{k: v for k, v in value.items() if k != 'identity'} for value in saved['profiles']]
            report({'phase': 'before-reboot', 'bootId': boot, 'kernel': command(['uname', '-a']),
                    'profiles': profiles, 'samples': samples, 'resources': resources, 'offline': 'no-default-route-and-pull-never'})
    except Exception as error:
        failure_progress('caught', error, diagnostics)
        # This guest is exclusive. Project only numeric kernel counters, never
        # process command lines, environment or arbitrary file contents.
        try:
            memory = {}
            for line in Path('/proc/meminfo').read_text().splitlines():
                key, value = line.split(':', 1)
                if key in {'MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'}:
                    memory[key + 'KiB'] = int(value.split()[0])
            load = Path('/proc/loadavg').read_text().split()
            running, total = map(int, load[3].split('/'))
            diagnostics['guestResources'] = {'memory': memory, 'loadAverage': list(map(float, load[:3])),
                                              'runnableTasks': running, 'totalTasks': total}
        except (OSError, ValueError, IndexError):
            diagnostics['guestResourcesUnavailable'] = True
        if native_diagnostic and hasattr(error, 'native_trace'):
            diagnostics['nativeTrace'] = error.native_trace
        if prefix and (prefix / 'journal.json').exists():
            try:
                journal = json.loads((prefix / 'journal.json').read_text())
                failure_progress('journal', error, diagnostics, journal=journal)
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
                    owned = []
                    for info in json.loads(inspected.stdout):
                        labels = info['Config']['Labels']
                        if labels.get('io.workmesh.installation') != journal['installationId'] or labels.get('io.workmesh.installation-root') != hashlib.sha256(str(prefix).encode()).hexdigest():
                            continue
                        service = labels.get('com.docker.compose.service')
                        if service not in allowed:
                            continue
                        state = info['State']
                        health = state.get('Health', {})
                        # Preserve already inspected identities and states even
                        # if a later log classifier cannot start in the guest.
                        entry = {'id': info['Id'], 'service': service, 'running': state['Running'],
                            'exitCode': state['ExitCode'], 'oom': state['OOMKilled'], 'restarts': info['RestartCount'],
                            'health': health.get('Status') if health.get('Status') in {'starting', 'healthy', 'unhealthy'} else None}
                        projected.append(entry)
                        owned.append((info, entry))
                        diagnostics['containers'] = projected
                        try:
                            process = Path('/proc') / str(int(state['Pid']))
                            fields = (process / 'stat').read_text().rsplit(')', 1)[1].split()
                            entry['process'] = {'userTicks': int(fields[11]), 'systemTicks': int(fields[12]),
                                'threads': int(fields[17]), 'startTicks': int(fields[19]),
                                'clockTicksPerSecond': os.sysconf('SC_CLK_TCK')}
                        except (OSError, ValueError, IndexError):
                            entry['processUnavailable'] = True
                    failure_progress('owned-states', error, diagnostics, journal=journal, containers=projected)
                    if owned:
                        try:
                            diagnostics['containerEvents'] = collect_container_events(journal, owned)
                        except (OSError, ValueError, KeyError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
                            diagnostics['containerEventsUnavailable'] = True
                    postgres = [entry for _, entry in owned if entry['service'] == 'postgres']
                    if len(postgres) == 1:
                        try:
                            diagnostics['databaseBudget'] = database_budget(postgres[0]['id'])
                        except (OSError, ValueError, subprocess.TimeoutExpired):
                            diagnostics['databaseBudgetUnavailable'] = True
                    for info, entry in owned:
                        health = info['State'].get('Health', {})
                        # Capture only this installation's logs. The trusted
                        # classifier receives bytes over stdin and emits fixed
                        # categories, bounded module locations and hashes.
                        try:
                            logs = subprocess.run(['docker', 'logs', '--tail', '60', info['Id']], capture_output=True, timeout=30)
                            code = "import{readFileSync}from'node:fs';import{commandFailure}from'/opt/workmesh/server-distribution/diagnostics.mjs';const p=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify({log:commandFailure({status:p.status,stdout:Buffer.from(p.stdout,'base64'),stderr:Buffer.from(p.stderr,'base64')}),probes:p.probes.map(v=>({exitCode:v.exitCode,failure:commandFailure({stderr:Buffer.from(v.output,'base64')})}))}));"
                            import base64
                            classified = subprocess.run(['docker', 'run', '--rm', '-i', '--pull', 'never', '--network', 'none',
                                '--read-only', '--label', 'io.workmesh.diagnostic.installation=' + journal['installationId'],
                                '--entrypoint', 'node', helper_image(manifest), '--input-type=module', '-e', code],
                                input=json.dumps({'status': logs.returncode, 'stdout': base64.b64encode(logs.stdout).decode(),
                                                  'stderr': base64.b64encode(logs.stderr).decode(),
                                                  'probes': [{'exitCode': probe['ExitCode'], 'output': base64.b64encode(probe.get('Output', '').encode()).decode()} for probe in health.get('Log', [])[-3:]]}).encode(), capture_output=True, timeout=60)
                            classified.check_returncode()
                            log_projection = json.loads(classified.stdout)
                            entry.update(log=log_projection['log'], probes=log_projection['probes'])
                        except (OSError, KeyError, ValueError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as classification_error:
                            entry['logClassificationUnavailable'] = type(classification_error).__name__
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
