"""从完整暂存 Git blob 核受控原件字节，确认跨 checkout 不会破坏指纹。"""
from pathlib import Path
from io import BytesIO
import hashlib,json,subprocess,time
root=Path(__file__).resolve().parents[4]
folder=root/'docs/plan/agent-mcp-m4/execution'
prefix=folder.relative_to(root).as_posix()+'/'
excluded=prefix+'staged-byte-preservation.json'
started=time.perf_counter()
index=subprocess.run(['git','ls-files','--stage','-z','--',prefix],cwd=root,capture_output=True,check=True).stdout.decode().split('\0')
rows=[]
for entry in index:
    if not entry:continue
    fields,name=entry.split('\t',1)
    assert fields.split()[2]=='0'
    if name==excluded:continue
    rows.append((name,fields.split()[1]))
assert rows
result=subprocess.run(['git','cat-file','--batch'],cwd=root,input=('\n'.join(blob for _,blob in rows)+'\n').encode(),capture_output=True,check=True)
stream=BytesIO(result.stdout);witness=[]
for name,blob in rows:
    header=stream.readline().decode().strip().split();assert header[:2]==[blob,'blob']
    raw=stream.read(int(header[2]));assert stream.read(1)==b'\n'
    assert raw==(root/name).read_bytes(),name
    witness.append({'path':name,'gitBlob':blob,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
report={'command':['python','-B',prefix+'verify-staged-bytes.py'],'exitCode':0,'runtimeSeconds':time.perf_counter()-started,'stagedFilesVerifiedFull':len(witness),'allStagedExecutionBytesEqualWorkingBytes':True,'orderedWitnessSha256':hashlib.sha256(json.dumps(witness,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),'excludedOwnResult':excluded,'source':'暂存blob全文，非工具输出前缀；这里只核受控execution原件，其他产品源码Git规范化字节与运行原件仍分列。'}
(folder/'staged-byte-preservation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(report,ensure_ascii=True))
