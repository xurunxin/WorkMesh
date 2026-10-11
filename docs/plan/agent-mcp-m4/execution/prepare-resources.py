"""仅准备本卡登记的独有loopback容器；不删除或改现有服务。"""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,secrets,time,shutil,os,hashlib
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[3]
PRIVATE=ROOT/'.tmp/m4-4adc5e39'
PREFIX='m4-01a127d4-4adc5e39'
ledger=OUT/'resources.json'
if ledger.exists(): raise RuntimeError('原资源账本已存在，禁止盲目重复创建')
PRIVATE.mkdir(parents=True,exist_ok=True)
password=secrets.token_hex(24)
key=secrets.token_hex(12)
secret=secrets.token_hex(24)
resources=[{'role':role,'name':PREFIX+'-'+role,'volume':PREFIX+'-'+role+'-data','image':image,'port':port,'containerId':None,'status':'登记未创建'}
           for role,image,port in [('postgres','postgres:16.9-alpine',5432),('redis','redis:7.4.5-alpine',6379),('objectstore','rustfs/rustfs:1.0.0',9000)]]
data={'owner':'本会话M4','prefix':PREFIX,'privatePath':str(PRIVATE.resolve()),'workspace':str(ROOT.resolve()),
      'containers':resources,'network':'各独有container默认bridge；无共享服务或自建network清理','processes':[],
      'physicalNetReleasedBytes':None,'diskUsageBefore':dict(zip(['total','used','free'],shutil.disk_usage(ROOT))),
      'protectedResources':'M5恢复、旧9对象、G1D0C3与父目录、其他workspace/store/image不动','receipts':[]}
def save(): ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
save()
def run(args):
 t=time.perf_counter(); result=subprocess.run(args,capture_output=True)
 shown=[arg.replace(password,'[REDACTED]').replace(key,'[REDACTED]').replace(secret,'[REDACTED]') for arg in args]
 data['receipts'].append({'command':shown,'exitCode':result.returncode,'runtimeSeconds':time.perf_counter()-t,'stdout':result.stdout.decode('utf-8',errors='replace'),'stderr':result.stderr.decode('utf-8',errors='replace')}); save()
 if result.returncode: raise RuntimeError(shown)
 return result.stdout.decode().strip()
for item in resources:
 item['imageId']=run(['docker','image','inspect',item['image'],'--format','{{.Id}}'])
 item['volumeId']=run(['docker','volume','create','--label','workmesh.m4.owner='+PREFIX,item['volume']])
 args=['docker','run','-d','--name',item['name'],'--label','workmesh.m4.owner='+PREFIX,'--memory','512m','-p',f"127.0.0.1::{item['port']}"]
 if item['role']=='postgres': args+=['-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_USER=workmesh','-e','POSTGRES_DB=workmesh_m4_test','-v',item['volume']+':/var/lib/postgresql/data',item['image']]
 elif item['role']=='redis': args+=['-v',item['volume']+':/data',item['image']]
 else: args+=['-e','RUSTFS_ACCESS_KEY='+key,'-e','RUSTFS_SECRET_KEY='+secret,'-v',item['volume']+':/data',item['image'],'/data']
 item['containerId']=run(args); item['status']='已创建'; save()
 info=json.loads(run(['docker','inspect',item['containerId'],'--format','{{json .NetworkSettings.Ports}}']))
 item['hostPort']=int(info[str(item['port'])+'/tcp'][0]['HostPort']); save()
pg,redis,store=resources
env={'NODE_ENV':'test','RUN_INTEGRATION':'1','DATABASE_URL':f"postgres://workmesh:{password}@127.0.0.1:{pg['hostPort']}/workmesh_m4_test",'REDIS_URL':f"redis://127.0.0.1:{redis['hostPort']}",
 'SESSION_SECRET':secrets.token_hex(32),'WORKMESH_RUNNER_SERVICE_TOKEN':secrets.token_hex(32),'WORKMESH_BOOTSTRAP_TOKEN':secrets.token_hex(32),
 'WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK':'true','WORKMESH_ENCRYPTION_KEY':secrets.token_hex(32),
 'S3_ENDPOINT':f"http://127.0.0.1:{store['hostPort']}",'S3_ACCESS_KEY_ID':key,'S3_SECRET_ACCESS_KEY':secret,'S3_BUCKET':'workmesh-m4-test','S3_REGION':'us-east-1','S3_FORCE_PATH_STYLE':'true'}
for feature in ['WORKMESH_BETA_PLANNING','WORKMESH_BETA_TEMPLATES','WORKMESH_BETA_COSTS','WORKMESH_EXPERIMENTAL_AUTOMATION','WORKMESH_EXPERIMENTAL_AGENT_LOOPS','WORKMESH_EXPERIMENTAL_A2A','WORKMESH_BETA_COORDINATION_MCP']: env[feature]='true'
(PRIVATE/'environment.json').write_text(json.dumps(env,indent=2)+'\n',encoding='utf-8',newline='\n')
data['environmentNames']=sorted(env); data['preparedUtc']=datetime.now(timezone.utc).isoformat(); save()
print(json.dumps({'prefix':PREFIX,'containers':len(resources),'registeredBeforeCreation':True,'credentialsPersistedToIgnoredPrivatePath':True}))
