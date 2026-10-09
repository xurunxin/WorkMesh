"""本批检查记录器：保存真实输入、输出与退出；不改变系统Node或打印秘密环境。"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import zipfile

root = Path(__file__).resolve().parent.parent
runtime = root / '.tmp/m0-node22/node-v22.19.0-win-x64'
evidence = root / 'docs/plan/agent-mcp-m0/product-evidence'
evidence.mkdir(exist_ok=True)
name, *command = sys.argv[1:]
if not name.replace('-', '').replace('_', '').isalnum() or not command:
    raise SystemExit('invalid check name/command')
env = dict(os.environ)
env['PATH'] = str(runtime) + os.pathsep + env['PATH']
if command[0] == 'pnpm':
    command[0:1] = [str(runtime / 'node.exe'), 'C:/nvm4w/nodejs/node_modules/pnpm/bin/pnpm.mjs']
if command[0] == 'node':
    command[0] = str(runtime / 'node.exe')
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
changed = subprocess.check_output(['git', 'diff', '--name-only', '69085317c88d84b702af727dc0ac7152589626d8', '--'], cwd=root, stderr=subprocess.DEVNULL).decode().splitlines()
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
rows = []
archive = evidence / f'{name}-inputs.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as saved:
    for path in sorted(set(changed + untracked)):
        if (path.startswith('docs/plan/agent-mcp-m0/product-evidence/')
            or path.startswith('docs/plan/agent-mcp-m0/history/')
            or not (root / path).is_file()):
            continue
        data = (root / path).read_bytes()
        try:
            blob = subprocess.check_output(['git', 'show', f'{head}:{path}'], cwd=root, stderr=subprocess.DEVNULL)
            oid = subprocess.check_output(['git', 'rev-parse', f'{head}:{path}'], cwd=root).decode().strip()
        except subprocess.CalledProcessError:
            blob = None
            oid = None
        digest = hashlib.sha256(data).hexdigest()
        saved.writestr(f'worktree/{path}', data)
        if blob is not None:
            saved.writestr(f'git/{path}', blob)
        rows.append(dict(path=path, worktreeBytes=len(data), worktreeSha256=digest,
                         gitObjectId=oid, gitSha256=hashlib.sha256(blob).hexdigest() if blob is not None else None,
                         newlineMapping='identity' if blob == data else 'distinct bytes; both preserved'))
    saved.writestr('inputs.json', json.dumps(rows, ensure_ascii=False, indent=2))
start = time.monotonic()
result = subprocess.run(command, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
output = result.stdout
# 输出与命令不能携带配置秘密；测试输出意外泄露时只保存脱敏副本。
for key, value in env.items():
    if len(value) >= 24 and any(word in key.upper() for word in ('TOKEN', 'SECRET', 'PASSWORD', 'MASTER_KEY')):
        output = output.replace(value.encode(), b'[REDACTED]')
(evidence / f'{name}.log').write_bytes(output)
receipt = dict(command=command, startedAt=started, head=head, runtimeSeconds=time.monotonic() - start,
               exitCode=result.returncode, inputArchive=archive.name,
               inputArchiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
               node=subprocess.check_output([str(runtime / 'node.exe'), '-p', 'JSON.stringify({version:process.version,execPath:process.execPath})']).decode().strip(),
               redaction='team secret environment values replaced when present; no environment dump')
(evidence / f'{name}.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
sys.stdout.buffer.write(output[-12000:])
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(result.returncode)
