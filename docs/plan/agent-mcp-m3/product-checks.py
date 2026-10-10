"""执行真实命令，保全退出码、运行字节与原始输出；不代替验收。"""
import hashlib, json, os, re, subprocess, sys, time, uuid, zipfile, platform
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/plan/agent-mcp-m3/product-evidence'
OUT.mkdir(exist_ok=True)
discovery_inputs={f'docs/plan/agent-mcp-{batch}/{name}.json' for batch,name in [('m0','operation-decisions'),('m1','operation-decisions'),('m2','product-discovery-decisions'),('m3','product-discovery-decisions')]}

def fingerprint():
    names = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT).split(b'\0')
    return {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
            for n in names if n and (p := n.decode('utf-8'))
            and (ROOT/p).is_file() and (not p.startswith('docs/plan/') or p in discovery_inputs)}

def redact(data):
    data = re.sub(rb'\bwm[ips]_[A-Za-z0-9_-]+', b'[REDACTED_CREDENTIAL]', data)
    for key in ['POSTGRES_PASSWORD','MINIO_ROOT_PASSWORD','RUSTFS_SECRET_KEY','WORKMESH_MASTER_KEY','SESSION_SECRET','WORKMESH_BOOTSTRAP_TOKEN','WORKMESH_RUNNER_SERVICE_TOKEN','S3_SECRET_ACCESS_KEY']:
        if os.environ.get(key): data = data.replace(os.environ[key].encode(), b'[REDACTED_TASK_SECRET]')
    return data

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    run_id = 'm3-' + uuid.uuid4().hex[:12]
    env = os.environ.copy()
    node_dir = ROOT / '.tmp/m3-tools/node-v22.19.0-win-x64'
    if (node_dir/'node.exe').exists():
        env['PATH'] = str(node_dir) + os.pathsep + env['PATH']
        os.environ['PATH'] = env['PATH']
    env['PYTHONIOENCODING'] = 'utf-8'
    argv = sys.argv[1:]
    if not argv: raise SystemExit('需要准确命令参数')
    before = fingerprint()
    start = time.time()
    child = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (OUT/(run_id+'-process.json')).write_text(json.dumps(dict(id=run_id,ownerPid=os.getpid(),childPid=child.pid,argv=argv,startedUnix=start),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    stdout,stderr=child.communicate()
    result = subprocess.CompletedProcess(argv,child.returncode,stdout,stderr)
    runtime = subprocess.run(['node', '-p', 'JSON.stringify({version:process.version,execPath:process.execPath})'], env=env, capture_output=True)
    with zipfile.ZipFile(OUT/(run_id+'.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('stdout.bin', redact(result.stdout))
        z.writestr('stderr.bin', redact(result.stderr))
        for name in ['mcp-coverage','execution-recovery','planning-collaboration','delivery-recovery']:
            directory = ROOT/'ci-logs'/name
            if directory.exists():
                for path in directory.rglob('*'):
                    if path.is_file(): z.writestr(path.relative_to(ROOT).as_posix(),redact(path.read_bytes()))
    receipt = dict(id=run_id, argv=argv, cwd=str(ROOT), exit=result.returncode,
                   elapsedSeconds=time.time()-start, startedUnix=start, endedUnix=time.time(), ownerPid=os.getpid(), childPid=child.pid,
                   environment=dict(platform=platform.platform(),python=platform.python_version(),pnpm='9.15.4；以packageManager及实际pnpm版本回执为准'), runtime=runtime.stdout.decode('utf-8', errors='replace').strip(),
                   before=before, after=fingerprint(), output=run_id+'.zip')
    (OUT/(run_id+'.json')).write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(redact(result.stdout).decode('utf-8', errors='replace')[-14000:])
    print(redact(result.stderr).decode('utf-8', errors='replace')[-8000:], file=sys.stderr)
    print(json.dumps({k:receipt[k] for k in ('id','argv','exit','elapsedSeconds','runtime')}, ensure_ascii=False))
    raise SystemExit(result.returncode)
