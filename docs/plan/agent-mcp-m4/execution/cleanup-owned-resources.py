"""必需命令退出且原件保全后，仅停止本卡独有容器；恢复树/卷/镜像不删除。"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,subprocess,time,sys

root=Path(__file__).resolve().parents[4]
out=root/'docs/plan/agent-mcp-m4/execution'
assert sys.argv[1:] in ([], ['--review']), '仅接受当前原模式或明确审查修复模式'
review = sys.argv[1:] == ['--review']
report_path=out/('cleanup-review.json' if review else 'cleanup-current.json')
assert not report_path.exists(),'原收尾回执不可覆盖'
ledger=json.loads((out/'resources.json').read_text(encoding='utf-8'))
checks=[]
labels = ['review-ci-conformance-recovered', 'review-native-local-entry', 'review-optional-stable-final', 'review-root-unit-bounded-pool', 'review-ci-validate'] if review else ['final-integration-correct-environment','final-e2e-current']
for label in labels:
    value=json.loads((out/'checks'/label/'receipt.json').read_text(encoding='utf-8'))
    assert value['exitCode']==0,(label,value['exitCode'])
    checks.append({'label':label,'exitCode':value['exitCode'],'endUtc':value['endUtc']})
preserved=json.loads((out/'runtime-evidence-current.json').read_text(encoding='utf-8'))
native=[]
for row in preserved['records']:
    if not row['source'].endswith('/resources.json') or '/native-evidence/opencode-' not in row['source']:continue
    path=root/row['preservedPath'];raw=path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==row['preservedSha256']
    value=json.loads(raw)
    assert value['allOwnedProcessesExited'] and value['proxyClosed'] and value['nativeServerListenerClosed']
    assert value['protectedUnchanged'] and value['recoveryDirectoryPreserved']
    native.append({'source':row['source'],'preservedPath':row['preservedPath'],'processes':value['processes'],'allOwnedProcessesExited':True,'proxyClosed':True,'nativeServerListenerClosed':True,'protectedUnchanged':True})
assert native,'必须保全 native 进程和资源回执'
commands=[]
def run(args):
    start=time.perf_counter();result=subprocess.run(args,cwd=root,capture_output=True)
    value={'command':args,'runtimeSeconds':time.perf_counter()-start,'exitCode':result.returncode,'stdout':result.stdout.decode('utf-8',errors='replace'),'stderr':result.stderr.decode('utf-8',errors='replace')}
    commands.append(value)
    assert result.returncode==0,value
    return value['stdout']
report={'observedUtc':datetime.now(timezone.utc).isoformat(),'checks':checks,'native':native,'commands':commands,'containerResults':[],'retainedRecoveryRoots':True,'retainedVolumes':True,'retainedImages':True,'protected':'M5恢复、旧9对象、G1D0C3及父目录、共享store/image及他人服务保持保护；无递归删除/移动，无globalprune','physicalNetReleasedBytes':None}
def save():report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
try:
    # 3100/3101 是本轮 Playwright 的独有入口；仍监听时停止收尾。
    listeners=json.loads(run(['powershell.exe','-NoProfile','-Command',"ConvertTo-Json -InputObject @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3100,3101) } | Select-Object LocalAddress,LocalPort,OwningProcess) -Compress"]) or '[]')
    assert not listeners,{'activeTestListeners':listeners}
    pg=next(item for item in ledger['containers'] if item['role']=='postgres')
    sessions=run(['docker','exec',pg['containerId'],'psql','-U','workmesh','-d','workmesh_m4_test','-Atc',"SELECT pid,application_name,state FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()"])
    assert not sessions.strip(),{'activeDatabaseClients':sessions}
    for item in ledger['containers']:
        details=json.loads(run(['docker','inspect',item['containerId'],'--format','{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}},"state":{{json .State}},"mounts":{{json .Mounts}}}']))
        assert details['id']==item['containerId'] and details['name']=='/'+item['name']
        assert details['labels'].get('workmesh.m4.owner')==ledger['prefix']
        assert any(mount.get('Name')==item['volume'] for mount in details['mounts'])
        result={'role':item['role'],'name':item['name'],'before':details}
        if details['state']['Running']:run(['docker','stop','--time','10',item['containerId']])
        result['after']=json.loads(run(['docker','inspect',item['containerId'],'--format','{{json .State}}']))
        assert not result['after']['Running']
        report['containerResults'].append(result);save()
    report['result']='本卡三个独有容器已停止；进程/监听退出已核，恢复原件及卷/镜像保留，未删除文件'
    save()
except BaseException as error:
    report['stopReason']=str(error);report['result']='遇活动引用或失败即停，不绕过';save();raise
print(json.dumps({'ownedContainersStopped':len(report['containerResults']),'nativeResourceReceipts':len(native),'retainedRecoveryRoots':True,'physicalNetReleasedBytes':None}))
