"""记录本轮实际命令、受测源码指纹与脱敏输出；不推算未报告的测试数量。"""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,time,zipfile
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent/'product-evidence'
OUT.mkdir(exist_ok=True)
def hash_bytes(b):return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def fingerprint():
    paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT).decode().splitlines()
    return {p:hash_bytes((ROOT/p).read_bytes()) for p in paths if not p.startswith(('docs/plan/','ci-logs/')) and (ROOT/p).is_file()}
def redact(b):
    # Logs remain UTF-8 reading copies; never preserve live credential plaintext.
    s=b.decode('utf-8',errors='replace')
    s=re.sub(r'\b(?:wmi|wmp|wms)_[A-Za-z0-9_-]+','[REDACTED_CREDENTIAL]',s)
    for key in ['POSTGRES_PASSWORD','MINIO_ROOT_PASSWORD','WORKMESH_MASTER_KEY','SESSION_SECRET','WORKMESH_BOOTSTRAP_TOKEN','WORKMESH_RUNNER_SERVICE_TOKEN','S3_SECRET_ACCESS_KEY']:
        if os.environ.get(key):s=s.replace(os.environ[key],'[REDACTED_TASK_SECRET]')
    return s.encode('utf-8')
def run():
    sequence=1+max([int(p.stem.split('-')[-1]) for p in OUT.glob('run-*.json')],default=0)
    argv=sys.argv[1:];assert argv
    while True:
        try:
            with (OUT/f'run-{sequence:03}.json').open('x',encoding='utf-8') as file:
                json.dump({'status':'running','argv':argv,'testCounts':None},file)
            break
        except FileExistsError:sequence+=1
    before=fingerprint();started=time.time()
    env={**os.environ,'PYTHONIOENCODING':'utf-8'}
    # On Windows .cmd uses native cmd processing; arguments are fixed caller-owned commands.
    result=subprocess.run(argv,cwd=ROOT,env=env,capture_output=True)
    ended=time.time();after=fingerprint()
    archive=OUT/f'run-{sequence:03}-output.zip'
    outputs={name:redact(b) for name,b in [('stdout',result.stdout),('stderr',result.stderr)]}
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,b in outputs.items():z.writestr(name,b)
        for directory in ['mcp-coverage','execution-recovery','planning-collaboration']:
            evidence=ROOT/'ci-logs'/directory
            if evidence.exists():
                for path in evidence.rglob('*'):
                    if path.is_file():z.writestr(path.relative_to(ROOT).as_posix(),redact(path.read_bytes()))
    data={'argv':argv,'cwd':str(ROOT),'startedUnix':started,'endedUnix':ended,'runtimeSeconds':ended-started,
        'nativeExit':result.returncode,'sourceBefore':before,'sourceAfter':after,'sourceUnchanged':before==after,
        'archive':{'path':archive.name,**hash_bytes(archive.read_bytes())},
        'outputs':{n:hash_bytes(b) for n,b in outputs.items()},'redaction':'凭据模式替换；未保未脱敏秘密原件',
        'testCounts':None,'skip':None,'note':'仅记录实跑；stdout中实际测试汇总另消费，不用exit推算数量'}
    (OUT/f'run-{sequence:03}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    for b in outputs.values():sys.stdout.buffer.write(b[-12000:])
    print(json.dumps({'receipt':f'run-{sequence:03}.json','nativeExit':result.returncode,'runtimeSeconds':ended-started}))
    sys.exit(result.returncode)
if __name__=='__main__':run()
