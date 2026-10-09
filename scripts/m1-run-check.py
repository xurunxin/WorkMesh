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
runtime = root / 'node_modules/.m1-runtime'
evidence = root / 'docs/plan/agent-mcp-m1/product-evidence'
evidence.mkdir(exist_ok=True)
name, *command = sys.argv[1:]
if not name.replace('-', '').replace('_', '').isalnum() or not command:
    raise SystemExit('invalid check name/command')
env = dict(os.environ)
env['PATH'] = str(runtime) + os.pathsep + env['PATH']
os.environ['PATH'] = env['PATH']
env['npm_execpath'] = 'C:/nvm4w/nodejs/node_modules/pnpm/pnpm.exe'
if command[0] == 'pnpm':
    command[0:1] = [str(runtime / 'node.exe'), 'C:/nvm4w/nodejs/node_modules/pnpm/bin/pnpm.mjs']
if command[0] == 'node':
    command[0] = str(runtime / 'node.exe')
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
changed = subprocess.check_output(['git', 'diff', '--name-only', 'e49eda142d61bdd248ddc42ec16f5563abd4bbc6', '--'], cwd=root, stderr=subprocess.DEVNULL).decode().splitlines()
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
rows = []
archive = evidence / f'{name}-inputs.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as saved:
    for path in sorted(set(changed + untracked)):
        if (path.startswith('docs/plan/agent-mcp-m1/product-evidence/')
            or path.startswith('docs/plan/agent-mcp-m1/history/')
            or path.endswith('.zip')
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
running = dict(command=command, startedAt=started, head=head, status='running', exitCode=None,
               inputArchive=archive.name, recorderPid=os.getpid(),
               inputArchiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest())
(evidence / f'{name}.json').write_text(json.dumps(running, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
process = subprocess.Popen(command, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
running['processId'] = process.pid
(evidence / f'{name}.json').write_text(json.dumps(running, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
# Stream each redacted line to disk before the tool can be interrupted. Missing
# final receipt remains an interrupted run, never an inferred successful exit.
with (evidence / f'{name}.log').open('wb') as output_file:
    assert process.stdout is not None
    for line in iter(process.stdout.readline, b''):
        for key, value in env.items():
            if len(value) >= 24 and any(word in key.upper() for word in ('TOKEN', 'SECRET', 'PASSWORD', 'MASTER_KEY', 'DATABASE_URL')):
                line = line.replace(value.encode(), b'[REDACTED]')
        output_file.write(line)
        output_file.flush()
process.wait()
post = {row['path']: hashlib.sha256((root / row['path']).read_bytes()).hexdigest() for row in rows if (root / row['path']).is_file()}
output = (evidence / f'{name}.log').read_bytes()
# 输出与命令不能携带配置秘密；测试输出意外泄露时只保存脱敏副本。
for key, value in env.items():
    if len(value) >= 24 and any(word in key.upper() for word in ('TOKEN', 'SECRET', 'PASSWORD', 'MASTER_KEY')):
        output = output.replace(value.encode(), b'[REDACTED]')
(evidence / f'{name}.log').write_bytes(output)
receipt = dict(command=command, startedAt=started, head=head, runtimeSeconds=time.monotonic() - start,
               exitCode=process.returncode, status='finished', processId=process.pid, postFingerprints=post, inputArchive=archive.name,
               inputArchiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
               node=subprocess.check_output([str(runtime / 'node.exe'), '-p', 'JSON.stringify({version:process.version,execPath:process.execPath})']).decode().strip(),
               redaction='team secret environment values replaced when present; no environment dump')
(evidence / f'{name}.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
sys.stdout.buffer.write(output[-12000:])
print(json.dumps({key:value for key,value in receipt.items() if key!='postFingerprints'}, ensure_ascii=False))
raise SystemExit(process.returncode)
