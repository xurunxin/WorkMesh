"""保全脱敏服务原字节，提取实际锁观察；只整理证据，不改历史测试。"""
from pathlib import Path
import hashlib,json,re,sys,zipfile
HERE=Path(__file__).parent; OUT=HERE/'product-evidence'
sys.stdout.reconfigure(encoding='utf-8')
def sha(data):return hashlib.sha256(data).hexdigest()
def write(name,value):(HERE/name).write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
logs=[]
old={}
if (HERE/'product-service-logs.zip').exists():
    with zipfile.ZipFile(HERE/'product-service-logs.zip') as z:old={n:z.read(n) for n in z.namelist()}
with zipfile.ZipFile(HERE/'product-service-logs.zip','w',zipfile.ZIP_DEFLATED) as archive:
    # Repeated execution carries the original raw members forward, not normalized copies.
    for path in sorted(OUT.glob('*-service.log')):
        name=path.relative_to(HERE).as_posix();raw=old.get(name,path.read_bytes())
        archive.writestr(name,raw)
        readable='\n'.join(line.rstrip() for line in raw.decode('utf-8','replace').splitlines()).rstrip()+'\n'
        path.write_bytes(readable.encode())
        logs.append({'path':name,'rawSha256':sha(raw),'readableSha256':sha(path.read_bytes()),'rawSize':len(raw)})
write('product-service-logs-index.json',{'archive':'product-service-logs.zip','archiveSha256':sha((HERE/'product-service-logs.zip').read_bytes()),'files':logs,'boundary':'原始脱敏bytes在ZIP；可读副本只去尾随空白/末尾空行，不放宽Git whitespace门禁。'})
observations=[]
for path in sorted(OUT.glob('m3-*.json')):
    receipt=json.loads(path.read_text(encoding='utf-8'))
    if 'output' not in receipt:continue
    with zipfile.ZipFile(OUT/receipt['output']) as z:
        text=z.read('stdout.bin').decode('utf-8','replace')
    for line in text.splitlines():
        start=line.find('{"m3')
        if start<0:continue
        try:obj=json.JSONDecoder().raw_decode(line[start:])[0]
        except ValueError:continue
        if set(obj)&{'m3AuthorityWait','m3GenerationRecovery','m3UnknownRecovery','m3ContextExhaustion'}:
            observations.append({'receipt':path.name,'archive':receipt['output'],'exit':receipt['exit'],'observation':obj})
write('product-lock-observations.json',{'observations':observations,'count':len(observations),'boundary':'直接解析每次真实stdout原字节；含首败及恢复，不把旧日志冒新源码。PG锁pid/blocker/mode/granted及DB租期原值保持。'})
print(json.dumps({'serviceLogs':len(logs),'lockObservations':len(observations),'exit':0}))
