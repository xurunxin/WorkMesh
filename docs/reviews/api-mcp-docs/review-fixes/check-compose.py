"""只解析现有 Compose，使用测试配置，不启动容器或拉取镜像。"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[4]
OUTPUT = Path(__file__).resolve().parent
RUNTIME = ROOT / '.tmp/api-docs-review-runtime'
assert RUNTIME.is_dir()
values = dict(re.findall(r'^([A-Z][A-Z0-9_]*)=(.*)$',
                         (ROOT / '.env.example').read_text(encoding='utf-8'), re.M))
values = {key: re.sub(r'CHANGE_ME\w*', 'docs-test-only', value)
          for key, value in values.items()}
values.update(WORKMESH_BUILD_SHA='0' * 40, WEB_ORIGIN='https://api.workmesh.invalid',
              PUBLIC_MCP_ORIGIN='https://mcp.workmesh.invalid',
              WORKMESH_SESSION_TOKEN='', WORKMESH_MCP_ACCESS_TOKEN='')
for service in ('API', 'WORKER', 'MCP'):
    values[f'WORKMESH_{service}_IMAGE'] = (
        f'ghcr.io/workmesh-docs-test/workmesh-{service.lower()}@sha256:' + '0' * 64)
environment = {key: value for key, value in os.environ.items()
               if key not in values and not key.startswith(('WORKMESH_', 'COMPOSE_'))}
environment['COMPOSE_DISABLE_ENV_FILE'] = '1'
env_file = RUNTIME / 'compose-test.env'
checks = []
try:
    for enabled in ('false', 'true'):
        values['WORKMESH_BETA_COORDINATION_MCP'] = enabled
        env_file.write_text(''.join(f'{key}={value}\n' for key, value in values.items()),
                            encoding='utf-8')
        for filename in ('docker-compose.production.yml', 'docker-compose.yml'):
            command = ['docker', 'compose', '--env-file', str(env_file), '-f', filename,
                       '--profile', 'agent', 'config']
            subprocess.run(command + ['--quiet'], cwd=ROOT, env=environment, check=True,
                           capture_output=True)
            result = subprocess.run(command + ['--format', 'json'], cwd=ROOT,
                                    env=environment, check=True, capture_output=True)
            config = json.loads(result.stdout)
            flags = {service: config['services'][service]['environment'].get(
                'WORKMESH_BETA_COORDINATION_MCP') for service in ('api', 'worker', 'mcp')}
            expected = enabled if filename == 'docker-compose.production.yml' else None
            assert all(flag == expected for flag in flags.values()), flags
            mcp_env = config['services']['mcp']['environment']
            assert mcp_env['WORKMESH_SESSION_TOKEN'] == ''
            assert mcp_env['WORKMESH_MCP_ACCESS_TOKEN'] == ''
            checks.append({'file': filename, 'inputFlag': enabled, 'resolvedFlags': flags,
                           'staticCredentialsEmpty': True, 'exitCode': result.returncode,
                           'commands': [subprocess.list2cmdline(command + ['--quiet']),
                                        subprocess.list2cmdline(command + ['--format', 'json'])]})
finally:
    if env_file.exists():
        env_file.unlink()
receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'sourceHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT,
                                                text=True).strip(),
           'dockerCompose': subprocess.check_output(['docker', 'compose', 'version'],
                                                    text=True).strip(),
           'sourceSha256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                            for name in ('docker-compose.production.yml', 'docker-compose.yml')},
           'checks': checks, 'temporaryEnvRemoved': not env_file.exists(),
           'scope': '只验配置解析与开关传入；未拉取 GHCR、部署生产栈或测试公网代理'}
(OUTPUT / 'compose-results.json').write_text(json.dumps(receipt, indent=2, ensure_ascii=False)
                                             + '\n', encoding='utf-8')
print('Compose 两种配置、true/false 四组解析通过；测试环境文件已移除。')
