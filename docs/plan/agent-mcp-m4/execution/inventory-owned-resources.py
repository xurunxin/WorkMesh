"""只读登记本卡文件身份、逻辑长度与容器；物理释放不由文件长度推算。"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,subprocess,shutil
root=Path(__file__).resolve().parents[4]
folder=root/'docs/plan/agent-mcp-m4/execution'
private=root/'.tmp/m4-4adc5e39'
ledger=json.loads((folder/'resources.json').read_text(encoding='utf-8'))
previous=None
if (folder/'resource-inventory-current.json').exists():
    raw=(folder/'resource-inventory-current.json').read_bytes();sha=hashlib.sha256(raw).hexdigest()
    target=folder/'evidence-objects'/sha
    if not target.exists():target.write_bytes(raw)
    else:assert target.read_bytes()==raw
    previous={'path':target.relative_to(root).as_posix(),'bytes':len(raw),'sha256':sha}
records=[];deduplicated={};links=[]
for directory in [private,folder]:
    for parent,dirs,files in os.walk(directory,followlinks=False):
        base=Path(parent)
        for name in list(dirs):
            path=base/name
            if path.is_symlink() or path.is_junction():links.append(str(path));dirs.remove(name)
        for name in files:
            path=base/name
            if path.is_symlink():links.append(str(path));continue
            stat=path.stat();identity=f'{stat.st_dev}:{stat.st_ino}'
            deduplicated[identity]=stat.st_size
            records.append({'path':path.relative_to(root).as_posix(),'bytes':stat.st_size,'fileIdentity':identity,'links':stat.st_nlink})
containers=[]
for item in ledger['containers']:
    args=['docker','inspect',item['containerId'],'--format','{{json .State}}']
    result=subprocess.run(args,capture_output=True)
    containers.append({'name':item['name'],'id':item['containerId'],'command':args,'exitCode':result.returncode,'state':json.loads(result.stdout) if result.returncode==0 else None})
report={'observedUtc':datetime.now(timezone.utc).isoformat(),'scope':'仅本卡私有路径与受控证据','files':records,'linksNotTraversed':links,'logicalBytes':sum(item['bytes'] for item in records),'uniqueIdentityBytes':sum(deduplicated.values()),'uniqueIdentities':len(deduplicated),'physicalNetReleasedBytes':None,'physicalMeasurement':'两口径均非物理占用；无逐文件物理分配基线，不猜净释放','diskNow':dict(zip(['total','used','free'],shutil.disk_usage(root))),'containers':containers,'protected':'当前恢复目录、M5恢复、旧9对象、G1D0C3及其父目录、共享store/镜像及其他服务不清理'}
report['previousManifest']=previous
(folder/'resource-inventory-current.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({key:report[key] for key in ['logicalBytes','uniqueIdentityBytes','uniqueIdentities','physicalNetReleasedBytes']}))
