"""本卡实际命令与源码前后指纹；仅明确命令，失败原件不覆盖。"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, subprocess, sys, time, zipfile

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[3]
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
def fingerprint():
    names=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT,capture_output=True,check=True).stdout.decode().splitlines()
    records=[]
    for name in sorted(set(names)):
        path=ROOT/name
        if not path.is_file() or not (name.startswith(('apps/','packages/','scripts/')) or '/' not in name): continue
        if path.suffix not in {'.ts','.tsx','.mjs','.mts','.cjs','.json','.yaml','.yml','.sql','.md','.py'}: continue
        raw=path.read_bytes()
        records.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    return records

def main():
    label=sys.argv[1]
    args=sys.argv[2:]
    if not label.replace('-','').replace('_','').isalnum() or not args: raise ValueError('要求唯一label及准确命令')
    dest=OUT/'checks'/label
    if dest.exists(): raise ValueError('原件已存在；使用新label，禁止覆盖')
    dest.mkdir(parents=True)
    before=fingerprint()
    started=datetime.now(timezone.utc).isoformat()
    private_env=ROOT/'.tmp/m4-4adc5e39/environment.json'
    env=dict(os.environ,**(json.loads(private_env.read_text(encoding='utf-8')) if private_env.exists() else {}))
    env['PYTHONIOENCODING']='utf-8'
    secrets=[value for key,value in env.items() if len(value)>8 and any(part in key.upper() for part in ['TOKEN','PASSWORD','SECRET','MASTER_KEY','DATABASE_URL'])]
    def redact(raw):
        text=raw.decode('utf-8',errors='replace')
        for value in secrets: text=text.replace(value,'[REDACTED]')
        return text.encode('utf-8')
    t=time.perf_counter()
    result=subprocess.run(args,cwd=ROOT,env=env,capture_output=True)
    after=fingerprint()
    stdout=redact(result.stdout); stderr=redact(result.stderr)
    (dest/'stdout.txt').write_bytes(stdout)
    (dest/'stderr.txt').write_bytes(stderr)
    data={'command':args,'cwd':str(ROOT),'startUtc':started,'endUtc':datetime.now(timezone.utc).isoformat(),
          'runtimeSeconds':time.perf_counter()-t,'exitCode':result.returncode,
          'headBefore':subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,check=True).stdout.decode().strip(),
          'before':before,'after':after,'sourceChangedDuringCommand':before!=after,
          'stdout':{'bytes':len(stdout),'sha256':hashlib.sha256(stdout).hexdigest()},
          'stderr':{'bytes':len(stderr),'sha256':hashlib.sha256(stderr).hexdigest()},
          'redactedEnvironmentNames':sorted(key for key in env if any(part in key.upper() for part in ['TOKEN','PASSWORD','SECRET','MASTER_KEY','DATABASE_URL'])),
          'rawOutputEncoding':'UTF-8受控子进程；非UTF-8显示字节按replacement保留限制',
          'testCounts':'原stdout为准；未自动把task/cache/skip当测试数量'}
    (dest/'receipt.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'label':label,'exitCode':result.returncode,'runtimeSeconds':data['runtimeSeconds'],'sourceFiles':len(before)},ensure_ascii=True))
    print(stdout.decode('utf-8')[-5500:])
    print(stderr.decode('utf-8')[-2000:])
    return result.returncode
if __name__=='__main__': sys.exit(main())
