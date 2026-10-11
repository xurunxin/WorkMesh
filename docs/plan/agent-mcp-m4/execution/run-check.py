"""本卡实际命令与源码前后指纹；仅明确命令，失败原件不覆盖。"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, subprocess, sys, time, zipfile, re, threading

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[3]
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
def fingerprint():
    index = subprocess.run(['git','ls-files','--stage'],cwd=ROOT,capture_output=True,check=True).stdout.decode().splitlines()
    blobs = {line.split('\t',1)[1]:line.split()[1] for line in index if '\t' in line}
    names=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT,capture_output=True,check=True).stdout.decode().splitlines()
    records=[]
    for name in sorted(set(names)):
        path=ROOT/name
        if not path.is_file() or not (name.startswith(('apps/','packages/','scripts/')) or '/' not in name): continue
        if path.suffix not in {'.ts','.tsx','.mjs','.mts','.cjs','.json','.yaml','.yml','.sql','.md','.py'}: continue
        raw=path.read_bytes()
        digest=hashlib.sha256(raw).hexdigest()
        blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        record={'path':name,'bytes':len(raw),'sha256':digest}
        if blobs.get(name)==blob:
            record['exactBytesSource']={'gitBlob':blob}
        else:
            obj=OUT/'source-objects'/digest
            obj.parent.mkdir(exist_ok=True)
            if not obj.exists(): obj.write_bytes(raw)
            elif obj.read_bytes()!=raw: raise RuntimeError('内容寻址原件冲突')
            record['exactBytesSource']={'path':obj.relative_to(ROOT).as_posix()}
        records.append(record)
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
        text=re.sub(r'wm[ips]_[A-Za-z0-9_-]+','[credential]',text)
        return text.encode('utf-8')
    t=time.perf_counter()
    process=subprocess.Popen(args,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    def preserve(pipe,path):
        with path.open('wb') as output:
            for line in iter(pipe.readline,b''):
                output.write(redact(line));output.flush()
        pipe.close()
    readers=[threading.Thread(target=preserve,args=(process.stdout,dest/'stdout.txt')),
             threading.Thread(target=preserve,args=(process.stderr,dest/'stderr.txt'))]
    for reader in readers:reader.start()
    exit_code=process.wait()
    for reader in readers:reader.join()
    after=fingerprint()
    stdout=(dest/'stdout.txt').read_bytes();stderr=(dest/'stderr.txt').read_bytes()
    data={'command':args,'cwd':str(ROOT),'startUtc':started,'endUtc':datetime.now(timezone.utc).isoformat(),
          'runtimeSeconds':time.perf_counter()-t,'exitCode':exit_code,
          'headBefore':subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,check=True).stdout.decode().strip(),
          'before':before,'after':after,'sourceChangedDuringCommand':before!=after,
          'stdout':{'bytes':len(stdout),'sha256':hashlib.sha256(stdout).hexdigest()},
          'stderr':{'bytes':len(stderr),'sha256':hashlib.sha256(stderr).hexdigest()},
          'redactedEnvironmentNames':sorted(key for key in env if any(part in key.upper() for part in ['TOKEN','PASSWORD','SECRET','MASTER_KEY','DATABASE_URL'])),
          'rawOutputEncoding':'UTF-8受控子进程；非UTF-8显示字节按replacement保留限制',
          'testCounts':'原stdout为准；未自动把task/cache/skip当测试数量'}
    (dest/'receipt.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'label':label,'exitCode':exit_code,'runtimeSeconds':data['runtimeSeconds'],'sourceFiles':len(before)},ensure_ascii=True))
    print(stdout.decode('utf-8')[-5500:])
    print(stderr.decode('utf-8')[-2000:])
    return exit_code
if __name__=='__main__': sys.exit(main())
