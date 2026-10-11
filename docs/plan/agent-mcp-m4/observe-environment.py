"""仅只读机器/容器/空间观察；不创建部署，不输出非白名单环境。"""
from pathlib import Path
import json
import shutil
import subprocess
import time
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
flags = ['WORKMESH_BETA_PLANNING','WORKMESH_BETA_TEMPLATES','WORKMESH_EXPERIMENTAL_AUTOMATION',
         'WORKMESH_EXPERIMENTAL_AGENT_LOOPS','WORKMESH_BETA_COSTS','WORKMESH_EXPERIMENTAL_A2A']
def run(args):
    before = time.perf_counter()
    proc = subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace')
    return {'command':args,'exitCode':proc.returncode,'runtimeSeconds':time.perf_counter()-before,
            'stdout':proc.stdout,'stderr':proc.stderr}

receipts = []
ps = run(['docker','ps','-a','--no-trunc','--format','{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Ports}}\t{{.Networks}}'])
receipts.append(ps)
containers = [dict(zip(['ID','Names','Image','State','Ports','Networks'],line.split('\t')))
              for line in ps['stdout'].splitlines() if line.strip()] if ps['exitCode']==0 else []
existing_api = None
if any(x.get('Names')=='workmesh-api-1' for x in containers):
    inspected = run(['docker','inspect','workmesh-api-1'])
    # 不持久保存inspect原文：其Config包含非本卡凭据。
    data = json.loads(inspected['stdout'])[0] if inspected['exitCode']==0 else None
    if data:
        selected = dict(item.split('=',1) for item in data['Config'].get('Env',[]) if item.split('=',1)[0] in flags)
        existing_api = {'id':data['Id'],'name':data['Name'],'running':data['State']['Running'],
                        'featureWhitelist':selected,'inspectExitCode':inspected['exitCode'],
                        'inspectRuntimeSeconds':inspected['runtimeSeconds'],'fullInspectPersisted':False}
    else:
        existing_api = {'inspectExitCode':inspected['exitCode'],'stderr':inspected['stderr']}
for args in [['git','--version'],['node','--version'],['pnpm.cmd','--version']]:
    receipts.append(run(args))
disk = shutil.disk_usage(ROOT)
data = {'sampleUtc':datetime.now(timezone.utc).isoformat(),'workspace':str(ROOT),
        'nodeModulesExists':(ROOT/'node_modules').exists(),'disk':{'totalBytes':disk.total,'usedBytes':disk.used,'freeBytes':disk.free},
        'existingApi':existing_api,'containers':containers,'readOnlyReceipts':receipts,
        'ownedM4RuntimeResources':[],'startedServices':[],'deletedPaths':[],
        'physicalNetReleasedBytes':None,'limits':'此刻卷级空间不是可归因释放；停止M5容器仍保护，不重用或删除。非白名单Env不落盘。'}
(OUT/'input/environment-observation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'容器数':len(containers),'既有API停止':existing_api and not existing_api.get('running',True),
                  '六域白名单':existing_api and existing_api.get('featureWhitelist'),
                  '空间可用字节':disk.free,'node_modules存在':data['nodeModulesExists'],
                  '命令退出码':[x['exitCode'] for x in receipts]},ensure_ascii=False))
