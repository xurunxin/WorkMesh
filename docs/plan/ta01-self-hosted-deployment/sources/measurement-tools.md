# 本轮临时工具

工具在本任务独有临时目录执行。重放前须重新登记独有 owner、目录和镜像 tag，不复用本次已结束资源。秘密只在临时环境文件和进程内生成；文件原件和截图不保存秘密。脚本输出及负载边界见测量页。

## `build.py`

当前脚本 SHA-256：`3fc888dfb63f329788c4e21e1bb7dec29d3d151a71e27eef9e9fe6fa28df54a9`。这是本轮临时工具副本，非产品代码。首败前的旧脚本未登记文件哈希，不将这里的当前哈希倒填为首败脚本身份。

```python
from pathlib import Path
import subprocess, json, datetime, os
root=Path.cwd()
owned=Path(__file__).parent
owner='workmesh-ta01-pui_xhb6'
tag='workmesh-ta01-baseline:pui_xhb6'
sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
suffix=os.environ.get('TA01_BUILD_ATTEMPT','')
receipt={'owner':owner,'source':sha,'tag':tag,'attempt':suffix or 'initial','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'created':False}
def save(): (owned/('build-receipt'+suffix+'.json')).write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
probe=subprocess.run(['docker','image','inspect',tag],capture_output=True,text=True)
receipt['absenceProbe']={'code':probe.returncode,'output':probe.stderr}
save()
if probe.returncode==0 or 'No such image' not in probe.stderr: raise RuntimeError('镜像不存在门拒绝')
paths=['.dockerignore','.node-version','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','turbo.json','tsconfig.base.json','OPENAPI.yaml','SCHEMA.sql','AGENT_PROTOCOL.md','README.md','AGENTS.md','CONTEXT.md','apps','packages','scripts','skills','infra']
args=['docker','build','--progress=plain','--label','workmesh.task='+owner,'--build-arg','WORKMESH_BUILD_SHA='+sha,'-t',tag,'-f','infra/docker/lite.Dockerfile','-']
receipt['archivePaths']=paths
receipt['command']=args
save()
with (owned/'context.tar').open('wb') as archive:
 subprocess.run(['git','-c','core.autocrlf=false','archive','--format=tar',sha,*paths],stdout=archive,check=True)
with (owned/'context.tar').open('rb') as source, (owned/('build'+suffix+'.log')).open('wb') as log:
 result=subprocess.run(args,stdin=source,stdout=log,stderr=subprocess.STDOUT)
receipt['exitCode']=result.returncode
receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
if result.returncode==0:
 details=json.loads(subprocess.check_output(['docker','image','inspect',tag],text=True))[0]
 receipt.update(created=True,imageId=details['Id'],revision=details['Config']['Labels']['org.opencontainers.image.revision'])
save()
print(json.dumps(receipt,ensure_ascii=False))
raise SystemExit(result.returncode)
```

## `measure.py`

当前脚本 SHA-256：`b33dbc0a3f73a736a18a7d0142cc7d79092bf14a00228b9de3222cdce716cc1d`。这是本轮临时工具副本，非产品代码。首败前的旧脚本未登记文件哈希，不将这里的当前哈希倒填为首败脚本身份。

```python
from pathlib import Path
import subprocess,json,os,secrets,socket,time,datetime,urllib.request,urllib.error,http.cookiejar,threading,concurrent.futures,statistics
owned=Path(__file__).parent
owner='workmesh-ta01-pui_xhb6'
tag='workmesh-ta01-baseline:pui_xhb6'
sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
retry=os.environ.get('TA01_MEASURE_RETRY','')
suffix='-'+retry if retry else ''
receipt={'owner':owner,'source':sha,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phases':[],'http':[],'cleanup':[],'resources':[],'outcome':'未运行'}
def save(): (owned/('measurement'+suffix+'.json')).write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
def command(args,required=True):
 result=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
 receipt.setdefault('commands',[]).append({'args':args,'code':result.returncode,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 save()
 if required and result.returncode: raise RuntimeError('命令失败：'+str(args[:3])+' code='+str(result.returncode))
 return result
def freeport():
 with socket.socket() as s: s.bind(('127.0.0.1',0)); return s.getsockname()[1]
services=['postgres','redis','minio','minio-init','migrate','api','worker']
base=['docker','compose','-p',owner,'--env-file',str(owned/'private.env'),'-f',str(owned/'compose.yml'),'-f',str(owned/'labels.json')]
stop=threading.Event()
samples=[]
phase='startup'
created=False
try:
 for kind,args in [('container',['docker','ps','-aq','--filter','label=com.docker.compose.project='+owner]),('volume',['docker','volume','ls','-q','--filter','label=com.docker.compose.project='+owner]),('network',['docker','network','ls','-q','--filter','label=com.docker.compose.project='+owner])]:
  existing=command(args).stdout.splitlines()
  if existing and not retry: raise RuntimeError('项目已有对象，拒绝复用')
  if retry:
   prior=json.loads((owned/'measurement.json').read_text(encoding='utf-8'))
   if retry!='fixture-recheck' or prior['http'] or prior['phases'] or prior['source']!=sha: raise RuntimeError('夹具复核身份不符')
   for id in existing:
    query=['docker','inspect',id] if kind=='container' else ['docker',kind,'inspect',id]
    d=json.loads(command(query).stdout)[0]
    labels=d['Config']['Labels'] if kind=='container' else d['Labels']
    if labels.get('com.docker.compose.project')!=owner or (kind=='container' and labels.get('workmesh.task')!=owner): raise RuntimeError('已有对象归属不符')
 if retry:
  business=command(base+['exec','-T','postgres','psql','-U','workmesh','-d','workmesh_ta01_test','-At','-c','SELECT (SELECT count(*) FROM workspaces),(SELECT count(*) FROM work_items);']).stdout.strip()
  if business!='0|0': raise RuntimeError('夹具首败后业务库非空，拒绝复测')
  receipt['fixtureRecheck']={'prior':'measurement.json','businessCountsBefore':business,'reason':'原 bucket 含下划线，HTTP 400；只改任务夹具名称'}
 image=json.loads(command(['docker','image','inspect',tag]).stdout)[0]
 if image['Config']['Labels'].get('org.opencontainers.image.revision')!=sha or image['Config']['Labels'].get('workmesh.task')!=owner: raise RuntimeError('镜像来源或归属不匹配')
 receipt['imageId']=image['Id']
 receipt['docker']=command(['docker','info','--format','{{.OSType}} {{.Architecture}} {{.NCPU}} {{.MemTotal}}']).stdout.strip()
 receipt['hostContainersBefore']=command(['docker','ps','-q']).stdout.splitlines()
 (owned/'compose.yml').write_bytes(subprocess.check_output(['git','show',sha+':docker-compose.lite.yml']))
 (owned/'labels.json').write_text(json.dumps({'services':{s:{'labels':{'workmesh.task':owner}} for s in services}}),encoding='utf-8')
 apiport,s3port=freeport(),freeport()
 origin='http://127.0.0.1:'+str(apiport)
 values={k:secrets.token_hex(32) for k in ['POSTGRES_PASSWORD','SESSION_SECRET','WORKMESH_MASTER_KEY','WORKMESH_BOOTSTRAP_TOKEN','AUTH_RATE_LIMIT_HMAC_KEY','MINIO_ROOT_PASSWORD']}
 values.update(WORKMESH_LITE_IMAGE=tag,WORKMESH_BUILD_SHA=sha,POSTGRES_DB='workmesh_ta01_test',POSTGRES_USER='workmesh',WORKMESH_BIND_ADDRESS='127.0.0.1',API_HOST_PORT=str(apiport),S3_HOST_PORT=str(s3port),WEB_ORIGIN=origin,SESSION_COOKIE_SECURE='false',S3_PUBLIC_ENDPOINT='http://minio:9000',S3_BUCKET=owner,MINIO_ROOT_USER='ta01',S3_ACCESS_KEY_ID='ta01',S3_SECRET_ACCESS_KEY=values['MINIO_ROOT_PASSWORD'],PAGINATION_CURSOR_KEYS='ta01:'+secrets.token_hex(32),PAGINATION_CURSOR_ACTIVE_KID='ta01',AUTH_RATE_LIMIT_REDIS_PREFIX=owner)
 if retry:
  values=dict(line.split('=',1) for line in (owned/'private.env').read_text(encoding='utf-8').splitlines())
  apiport=int(values['API_HOST_PORT']);s3port=int(values['S3_HOST_PORT']);origin=values['WEB_ORIGIN']
 values['S3_BUCKET']=owner.replace('_','-')
 for flag in ['PLANNING','TEMPLATES','COSTS','GITEA','OPERATIONS_UI','COORDINATION_MCP','MODEL_PRESETS']: values['WORKMESH_BETA_'+flag]='false'
 for flag in ['AUTOMATION','AGENT_LOOPS','A2A','EXTERNAL_WEBHOOKS','MULTI_RUNTIME','NOTIFICATION_CHANNELS']: values['WORKMESH_EXPERIMENTAL_'+flag]='false'
 (owned/'private.env').write_text('\n'.join(k+'='+v for k,v in values.items())+'\n',encoding='utf-8')
 receipt['config']={'source':'准确 Git Compose；仅独有 project、测试 DB、bucket、回环端口、生成秘密与 feature=false','apiPort':apiport,'s3Port':s3port,'mcp':'Lite 无该角色；本次未测','memoryLimitsMiB':{'postgres':384,'redis':128,'minio':256,'api':640,'worker':448}}
 save()
 def sampler():
  while not stop.is_set():
   at=datetime.datetime.now(datetime.timezone.utc).isoformat()
   ids=subprocess.run(base+['ps','-q'],capture_output=True,text=True).stdout.splitlines()
   if ids:
    result=subprocess.run(['docker','stats','--no-stream','--format','{{json .}}',*ids],capture_output=True,text=True)
    samples.append({'at':at,'phase':phase,'code':result.returncode,'rows':[json.loads(l) for l in result.stdout.splitlines() if l.strip()]})
   stop.wait(2)
 thread=threading.Thread(target=sampler);thread.start()
 created=True
 started=time.monotonic();up=command(base+['up','-d','--wait','--wait-timeout','240','api','worker'],False)
 (owned/('startup'+suffix+'.log')).write_text(up.stdout+up.stderr,encoding='utf-8')
 if up.returncode: raise RuntimeError('现有 Lite 启动失败')
 receipt['startupSeconds']=time.monotonic()-started
 ids=command(base+['ps','-aq']).stdout.splitlines()
 for id in ids:
  d=json.loads(command(['docker','inspect',id]).stdout)[0]
  if d['Config']['Labels'].get('com.docker.compose.project')!=owner or d['Config']['Labels'].get('workmesh.task')!=owner: raise RuntimeError('容器归属不符')
  receipt['resources'].append({'id':id,'service':d['Config']['Labels'].get('com.docker.compose.service'),'image':d['Image'],'memoryLimit':d['HostConfig']['Memory'],'nanoCpus':d['HostConfig']['NanoCpus']})
 jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
 csrf=None
 def call(method,path,body=None,extra=None,opener=None):
  headers={'Content-Type':'application/json','Origin':origin}
  if body is not None: headers['Idempotency-Key']=secrets.token_hex(16)
  if csrf: headers['X-CSRF-Token']=csrf
  if extra: headers.update(extra)
  request=urllib.request.Request(origin+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
  start=time.monotonic()
  try:
   with (opener or client).open(request,timeout=20) as response:
    code=response.status;value=json.load(response)
  except urllib.error.HTTPError as error:
   receipt['http'].append({'phase':phase,'method':method,'path':path,'code':error.code,'ms':(time.monotonic()-start)*1000});save();raise RuntimeError('HTTP '+str(error.code)+' '+path) from None
  receipt['http'].append({'phase':phase,'method':method,'path':path,'code':code,'ms':(time.monotonic()-start)*1000})
  return value
 phase='install'
 installed=call('POST','/api/v1/auth/install',{'name':'TA01 基线','slug':'ta01-baseline','adminName':'TA01','email':'ta01@example.test','password':secrets.token_hex(20)},{'X-WorkMesh-Bootstrap-Token':values['WORKMESH_BOOTSTRAP_TOKEN']})
 csrf=installed['csrfToken']
 actor=call('GET','/api/v1/auth/me')['actor']['id'];team=call('GET','/api/v1/teams')['items'][0]['id']
 states=call('GET','/api/v1/teams/'+team+'/states?limit=100')['items'];ready=next(s['id'] for s in states if s['name']=='Ready')
 def runitem(index,opener=None):
  item=call('POST','/api/v1/work-items',{'teamId':team,'title':'TA01 基线 '+str(index),'description':'固定控制面创建与读取负载，不执行模型或代码。','statusId':ready,'responsibleHumanActorId':actor,'priority':'high'},opener=opener)
  got=call('GET','/api/v1/work-items/'+item['id'],opener=opener)
  if got['id']!=item['id']: raise RuntimeError('工作项读回身份不符')
 phase='idle';receipt['phases'].append({'name':phase,'seconds':60});save();time.sleep(60)
 phase='first-work-item';runitem('first');receipt['phases'].append({'name':phase,'items':1,'settleSeconds':30});save();time.sleep(30)
 cookie='; '.join(c.name+'='+c.value for c in jar)
 phase='concurrency-three'
 def burst(worker):
  opener=urllib.request.build_opener();opener.addheaders=[('Cookie',cookie)]
  for index in range(20): runitem(str(worker)+'-'+str(index),opener);time.sleep(0.1)
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(burst,range(3)))
 receipt['phases'].append({'name':phase,'workers':3,'itemsPerWorker':20,'settleSeconds':30});save();time.sleep(30)
 phase='final'
 sql="SELECT status,count(*) FROM outbox_events GROUP BY status ORDER BY status; SELECT count(*) AS work_items FROM work_items; SELECT pg_database_size(current_database()) AS database_bytes;"
 receipt['databaseSummary']=command(base+['exec','-T','postgres','psql','-U','workmesh','-d','workmesh_ta01_test','-At','-c',sql]).stdout
 receipt['health']=[]
 for id in ids:
  d=json.loads(command(['docker','inspect',id]).stdout)[0]
  receipt['health'].append({'id':id,'status':d['State']['Status'],'oomKilled':d['State']['OOMKilled'],'restartCount':d['RestartCount'],'exitCode':d['State']['ExitCode'],'health':d['State'].get('Health',{}).get('Status')})
 receipt['diskLogicalBytes']={}
 for service,path in [('postgres','/var/lib/postgresql/data'),('redis','/data'),('minio','/data')]:
  result=command(base+['exec','-T',service,'du','-sb',path],False)
  receipt['diskLogicalBytes'][service]={'code':result.returncode,'output':result.stdout.strip()}
 receipt['outcome']='控制面基线采样完成；非 Runner／MCP／备份验收'
except Exception as error:
 receipt['outcome']='失败或未测：'+str(error)
finally:
 stop.set()
 if 'thread' in locals(): thread.join(timeout=20)
 (owned/('samples'+suffix+'.json')).write_text(json.dumps(samples,ensure_ascii=False,indent=2),encoding='utf-8')
 receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 save()
 print(json.dumps({'outcome':receipt['outcome'],'samples':len(samples)},ensure_ascii=False))
raise SystemExit(0 if receipt['outcome'].startswith('控制面基线采样完成') else 1)
```

## `catalog.py`

当前脚本 SHA-256：`a2926e5add1f9d4c5fafb38f855ad8b6bd067da2fd0f633bf33e0375fe12a6b6`。这是本轮临时工具副本，非产品代码。首败前的旧脚本未登记文件哈希，不将这里的当前哈希倒填为首败脚本身份。

```python
from pathlib import Path
import hashlib,json,re,subprocess,datetime
root=Path.cwd();out=root/'docs/plan/ta01-self-hosted-deployment';base='c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8'
sha=lambda b:hashlib.sha256(b).hexdigest()
git=lambda *a:subprocess.check_output(['git',*a],cwd=root)
raw=lambda p:'\n'.join(json.loads(p.read_text(encoding='utf-8').split('```json\n')[1].split('\n```')[0]))
toolpaths=sorted((out/'sources').glob('*-todo.md'))+sorted((out/'sources').glob('*-conversation.md'))
body=raw(out/'sources/current-todo.md')
spec=body.split('\nSpec:\n',1)[1].split('\nSaved plan:',1)[0]
conversation=raw(out/'sources/current-conversation.md')
plan=conversation.split('Saved plan (doc X7D1XMP5_XpGdpyYKCVNZ):\n',1)[1].split('\n[2026-10-13 13:02:35 UTC] (user/plan_revision)',1)[0]
(out/'spec.md').write_bytes(spec.encode())
(out/'implementation-plan.md').write_bytes(plan.encode())
originals=['docs/plan/backend-infrastructure-roadmap/README.md','docs/plan/backend-infrastructure-roadmap/coverage-matrix.md','docs/plan/backend-infrastructure-roadmap/dependencies-and-acceptance.md','docs/plan/backend-infrastructure-roadmap/sources/todos/33.md','docs/adr/0071-lite-single-node-self-hosted-deployment.md','docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md','docs/adr/0035-retention-archive-and-heartbeat-projections.md','docs/adr/0036-exact-archive-membership.md','docs/adr/0039-authenticated-complete-recovery-bundles.md','docs/adr/0070-artifact-storage-on-rustfs-and-header-signed-uploads.md','docs/reviews/b-ship/product/progress.md','docs/reviews/b-ship/product/artifacts/README.md','docs/reviews/backend-retirement/verification.md','docs/reviews/api-mcp-docs/verification.md']
originals.append('docs/reviews/backend-retirement/README.md')
originalrows=[]
for n,path in enumerate(originals,1):
 probe=subprocess.run(['git','cat-file','-e',base+':'+path],cwd=root,capture_output=True)
 if probe.returncode:
  originalrows.append('| `'+path+'` | 当前 Git 路径缺失，未补造 | — |');continue
 b=git('show',base+':'+path);p=out/f'sources/git-{n:02}.md'
 text='# Git 原件可逆归档\n\n原路径：`'+path+'`。解释原文相对链接时须使用原路径的目录。本文件 JSON 数组以 LF 拼接，还原原 Git UTF-8 文本。\n\n```json\n'+json.dumps(b.decode().split('\n'),ensure_ascii=False,indent=2)+'\n```\n'
 p.write_bytes(text.encode())
 blob=git('rev-parse',base+':'+path).decode().strip()
 originalrows.append('| ['+path+']('+p.relative_to(out).as_posix()+') | `'+sha(b)+'` | `'+blob+'` |')
inputs=['CONTEXT.md','AGENT_PROTOCOL.md','OPENAPI.yaml','SCHEMA.sql','package.json','docker-compose.lite.yml','docker-compose.production.yml','.env.lite.example','.env.production.example','infra/docker/lite.Dockerfile','infra/docker/runtime-guard.mjs','packages/config/src/service-command.ts','packages/config/src/index.ts','packages/config/src/runtime-secrets.mjs','packages/db/src/migrations.ts','packages/db/src/migration-manifest.ts','apps/api/src/auth-rate-limit/limiter.ts','apps/api/src/auth-rate-limit/redis-store.ts','apps/api/src/realtime/coordinator.ts','apps/api/src/realtime/wake-source.ts','apps/worker/src/index.ts','packages/artifact-storage/src/index.ts','packages/recovery/src/backup.ts','packages/recovery/src/restore.ts','packages/recovery/src/s3.ts','scripts/verify-a2-backend-lite.mjs','scripts/verify-a2-backend-lite-api.mjs','scripts/ci-policy.mjs','docs/documentation-maintenance.md','docs/integration/README.md','docs/integration/reference.md','docs/integration/installation.md']
inputs.remove('.env.production.example')
inputs.append('.env.example')
inputrows=[]
for path in inputs:
 b=git('show',base+':'+path);blob=git('rev-parse',base+':'+path).decode().strip()
 inputrows.append('| ['+path+'](../../../'+path+') | `'+sha(b)+'` | `'+blob+'` |')
toolrows=[]
for p in toolpaths:
 text=raw(p);b=p.read_bytes();truncated='有截断；仅原前缀' if '(truncated)' in text else '本次完整返回'
 if p.name=='current-todo.md': truncated='Spec 完整；Saved plan 截断'
 toolrows.append('| ['+p.stem+']('+p.relative_to(out).as_posix()+') | '+truncated+' | `'+sha(text.encode())+'` | `'+sha(b)+'` | `'+git('hash-object',str(p)).decode().strip()+'` |')
head='''# 来源与完整性登记

## 准确基线与授权

开工独立查询真实 `refs/heads/main`，与本工作树 HEAD 同为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。该提交是 PR #226 的 merge；父提交含已审路线 head `3ac64f636d673906c9b5c6a0237aa7ef0e3fe726`。本卡主线来自 `git ls-remote origin refs/heads/main` 和本地不可变 Git 对象，不用陈旧 `origin/main` 推断合入。

本卡 ID 为 `zTp9s5nPMWiUfQ9Ju1TB_`，稳定标识为 `WM-TODOS-ALIGN-20261008/TA01`。平台完整计划为 `doc:X7D1XMP5_XpGdpyYKCVNZ`，从完整 current-conversation 返回取回，并与用户本轮注入全文一致。当前规格的授权仅覆盖方案和现有部署测量。用户本轮要求执行全部文件改动；原对话包含 `Confirm plan.`。

Chief 对用户的原问题与原回答未由本卡对话工具取得。本卡完整 Spec 中的“合入并接续 TA01 规划”是平台捕获裁定，按其来源保存，不伪称亲读 Chief 原对话。#32 合入和 #20 完成属于复用输入，不是本轮新增产品通过。

规划轮平台 Git 返回共享缓存 `index.lock`，没有处理锁；该失败只说明缓存未就绪。本轮不重试共享缓存，不以可读本工作树冒其已恢复。

## 来源字节

工具响应采用 JSON 行数组编码，以 LF 拼接可逐字还原实际正文，保留行尾空格和截断标记。原正文 SHA-256、编码文件 SHA-256 和文件 Git blob 各自独立。`spec.md` 与 `implementation-plan.md` 保存准确提取字段；来源工具原件含元数据和返回边界，不混算字段哈希。

### 平台返回

| 原件 | 完整性 | 原正文 SHA-256 | 归档文件 SHA-256 | 归档 blob |
| --- | --- | --- | --- | --- |
'''
field='\n字段来源：Spec SHA-256 为 `'+sha(spec.encode())+'`，计划 SHA-256 为 `'+sha(plan.encode())+'`。实际暂存及提交 blob 在验证记录中另核；这里 `git hash-object` 的计算值不能单独证明已提交。\n'
gitsection='\n### 已合入原材料\n\n下列文件取自准确主线 Git blob，全部原文可逆归档，不更新历史裁定或原文件状态。\n\n| 原路径／归档 | 原字节 SHA-256 | 原 Git blob |\n| --- | --- | --- |\n'
inputsection='\n### 当前实现绑定\n\n这些原件已存在于上述不可变提交，按原路径阅读，不复制运行代码。\n\n| 当前路径 | 原字节 SHA-256 | 原 Git blob |\n| --- | --- | --- |\n'
tail='''
## 外部来源与缺口

本轮规划读取 [Todos 安装](https://todos.dev/zh/docs/install)、[快速上手](https://todos.dev/zh/docs/quickstart) 和[平台机器](https://todos.dev/zh/docs/platform-machines)。它们说明个人使用起点、规划确认流程和平台机器服务，只作为产品对照；不证明 WorkMesh 自部署、离线或设备支持。没有下载外部凭据或调用实际厂商。

中文写作源为仓库 [zh-tech-writing](../../skills/zh-tech-writing/README.md) 的固定 commit `ffda9353768dece8aabd26ccb3a4978025e9437c`。主技能、manual-structure、typography 和 MIT 原件的哈希由仓库 source.json 与文档检查器核实，没有全局或团队技能库安装。

`docs/plan/todos-alignment-20261008/tasks/TA01.md` 和 `docs/plan/2026-10-08-todos-functional-alignment.md` 在当前树及本机可达 Git 历史未取得。#32 已归档当前卡及历史来源，本轮保留它们的原件；不从记忆重建缺失的旧文件。这个查询不证明不可达或其他机器的历史不存在。

#20、#61 及 #32 的工具 Saved plan 存在截断，不给其截断字段生成完整计划哈希。#20 的当前产品材料以已合入 Git 工件索引和进度记录复用；#61／#62 的既有验收仍按原日志的环境和范围解释。真实设备、OS、CA、账号及离线组合未指定，不能把既有测试扩大为新画像通过。
'''
(out/'sources.md').write_text(head+'\n'.join(toolrows)+'\n'+field+gitsection+'\n'.join(originalrows)+'\n'+inputsection+'\n'.join(inputrows)+'\n'+tail,encoding='utf-8',newline='\n')
print(json.dumps({'platformSources':len(toolpaths),'gitOriginals':len(originals),'bindings':len(inputs),'specHash':sha(spec.encode()),'planHash':sha(plan.encode())}))
```

## `archive_evidence.py`

当前脚本 SHA-256：`98020843a5d7535c664050bc958863b154bb978e0fe4f8f170877a0dd194ec20`。这是本轮临时工具副本，非产品代码。首败前的旧脚本未登记文件哈希，不将这里的当前哈希倒填为首败脚本身份。

```python
from pathlib import Path
import json,hashlib,subprocess,re,math,statistics
owned=Path(__file__).parent;out=Path.cwd()/'docs/plan/ta01-self-hosted-deployment'
sha=lambda b:hashlib.sha256(b).hexdigest()
files=['build-receipt.json','build.log','build-receipt-environment-recheck.json','build-environment-recheck.log','measurement.json','samples.json','startup.log','measurement-fixture-recheck.json','samples-fixture-recheck.json','startup-fixture-recheck.log','integration-docs.log','ci-policy.log']
rows=[]
for name in files:
 p=owned/name;b=p.read_bytes();text=b.decode('utf-8',errors='strict')
 target=out/'sources'/('evidence-'+name.replace('.','-')+'.md')
 target.write_text('# 实际运行原件\n\n原文件：`'+name+'`。JSON 数组按 LF 拼接还原原 UTF-8 正文，包括 CR。\n\n```json\n'+json.dumps(text.split('\n'),ensure_ascii=False,indent=2)+'\n```\n',encoding='utf-8',newline='\n')
 rows.append('| ['+name+']('+target.name+') | `'+sha(b)+'` | `'+sha(target.read_bytes())+'` |')
tools=[]
for name in ['build.py','measure.py','catalog.py','archive_evidence.py']:
 b=(owned/name).read_bytes();tools.append('## `'+name+'`\n\n当前脚本 SHA-256：`'+sha(b)+'`。这是本轮临时工具副本，非产品代码。首败前的旧脚本未登记文件哈希，不将这里的当前哈希倒填为首败脚本身份。\n\n```python\n'+b.decode().rstrip('\n')+'\n```\n')
(out/'sources/measurement-tools.md').write_text('# 本轮临时工具\n\n工具在本任务独有临时目录执行。重放前须重新登记独有 owner、目录和镜像 tag，不复用本次已结束资源。秘密只在临时环境文件和进程内生成；文件原件和截图不保存秘密。脚本输出及负载边界见测量页。\n\n'+'\n'.join(tools),encoding='utf-8',newline='\n')
(out/'sources/evidence-index.md').write_text('# 运行证据索引\n\n原始日志、回执和采样各自可逆保存。原文件 SHA-256 按原字节计算，编码文件哈希另列。\n\n| 原件 | 原文件 SHA-256 | 归档文件 SHA-256 |\n| --- | --- | --- |\n'+'\n'.join(rows)+'\n\n复现脚本见 [measurement-tools.md](measurement-tools.md)。工具文件哈希对应实际复核轮；首败日志和原命令保留，不伪造首败脚本哈希。\n',encoding='utf-8',newline='\n')
r=json.loads((owned/'measurement-fixture-recheck.json').read_text(encoding='utf-8'));samples=json.loads((owned/'samples-fixture-recheck.json').read_text(encoding='utf-8'))
def mem(value):
 n,u=re.match(r'([0-9.]+)([A-Za-z]+)',value).groups();return float(n)*{'B':1/(1024*1024),'KiB':1/1024,'MiB':1,'GiB':1024,'kB':1000/(1024*1024),'MB':1000000/(1024*1024),'GB':1000000000/(1024*1024)}[u]
phaseRows=[]
for phase in ['idle','first-work-item','concurrency-three']:
 selected=[s for s in samples if s['phase']==phase and len(s['rows'])==5 and s['code']==0]
 total=[sum(mem(row['MemUsage'].split(' / ')[0]) for row in s['rows']) for s in selected]
 cpu=[sum(float(row['CPUPerc'].rstrip('%')) for row in s['rows']) for s in selected]
 http=[h['ms'] for h in r['http'] if h['phase']==phase]
 p95=sorted(http)[math.ceil(len(http)*0.95)-1] if http else None
 phaseRows.append('| '+phase+' | '+str(len(selected))+' | '+(f'{min(total):.2f}～{max(total):.2f}' if total else '未取得')+' | '+(f'{max(cpu):.2f}%' if cpu else '未取得')+' | '+str(len(http))+' | '+(f'{p95:.2f}' if p95 is not None else '不适用')+' |')
md='''# 现有 Lite 基线测量

## 实测范围和固定条件

本轮只测现有 Lite 的控制面工作项创建／读取及 durable outbox。首任务定义为首个 Human 工作项的 POST 和 GET；并发定义为三个调用者，各创建、读回二十个工作项。没有执行模型或代码任务，不冒完整 fake Agent、Runner、MCP、工件、备份或三画像联合验收。

执行主机为 Windows／PowerShell，Docker Desktop 的 Linux x86_64 daemon 报告 32 个 CPU、8,381,870,080 字节内存。CPU 未人为限到低核数，没有把整个 Docker VM 限到低内存。本次开始前没有其他运行容器，但宿主负载未冻结；这不是独立低功耗硬件。

源码固定 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`，通过 Git archive 构建原 `infra/docker/lite.Dockerfile`。成功镜像 ID 为 `sha256:af4aeb31f8a157e13fabdbef208592483cd9527a09e54510383d734cd7eb894e`，读回 OCI revision 相同。镜像实际 Node 运行基于锁定 Node 22.19.0 Alpine；依赖由原 frozen lock 安装，没有改源码、Dockerfile 或跳过 lifecycle。

使用独有 Compose project `workmesh-ta01-pui_xhb6`、数据库 `workmesh_ta01_test`、bucket `workmesh-ta01-pui-xhb6`、回环动态端口和独有卷。所有 Beta／Experimental 关闭。PG、Redis、RustFS 为现有准确镜像输入。原 Compose 参数和 Node heap 保持；PG／Redis／RustFS／API／worker 容器限额为 384／128／256／640／448 MiB。独有 labels 只用于归属核验。

测试从空业务库安装，无既有工件。空闲固定等待 60 秒；首工作项后等待 30 秒；并发每调用者二十个工作项、每轮间隔 0.1 秒，结束后等待 30 秒。采样器在每次 `docker stats --no-stream` 结束后再等待 2 秒；实际间隔由原 UTC 时间戳决定，不能写成严格 2 秒周期。

## 实际结果

以下内存是同一采样中的五个运行服务 Docker stats 用量之和，不是整个宿主 RSS；一并保存各服务原行、容器上限、CPU、BlockIO、NetIO 和 PID。采样峰值可能漏掉短暂峰值，不能当作容量安全上限。

| 阶段 | 完整采样数 | 服务内存合计范围（MiB） | CPU 合计观测峰值 | HTTP 请求数 | HTTP p95（ms） |
| --- | --- | --- | --- | --- | --- |
'''
md+='\n'.join(phaseRows)+'\n\n'
md+=f"夹具修正后的启动就绪耗时 {r['startupSeconds']:.2f} 秒。数据库最终有 61 个工作项；outbox 63 条均为 delivered。五个长运行服务 healthy，检查时 OOMKilled=false、RestartCount=0；migrate 与 minio-init 正常退出。不能由本次末态推定所有历史运行状态。\n\n"
md+='PG 数据目录逻辑长度 75,477,252 字节，Redis 4,096 字节，RustFS 16,568 字节；PG 数据库报告 18,133,475 字节。目录逻辑长度、Docker BlockIO、镜像层和宿主物理占用不同，不能相加称物理磁盘净占用。\n\n'
md+='''## 首败和修正

首轮构建在 Alpine `apk upgrade` 读取仓库时出现 IO ERROR，原命令 exit 1、构建步骤 exit 99。原日志及回执保持。宿主对同一索引 URL 的只读 HEAD 返回 HTTP 200；随后只复核相同构建命令，未改网络权限、Dockerfile、CA 或包版本，构建 exit 0。首败仍是首败。

首次启动 `minio-init` 返回 HTTP 400。测量脚本误将带下划线的 owner 用作 bucket，API 未启动、HTTP 业务请求为零。修正前逐对象验证独有 project／task label，核 workspace 和 work_item 业务计数均为零；保持原测试密码、卷与源码，仅将夹具 bucket 改为合法名称后重跑。首轮 startup 和 samples 分别保留，不能并入成功阶段。

## 复现及下一阶段测量

完整原件见[运行证据索引](sources/evidence-index.md)，本轮工具见[临时脚本](sources/measurement-tools.md)。先校验准确源码和镜像来源，创建新的独有 owner／路径／测试库／bucket，再执行归属预检、原镜像构建及测量。不要复用本次已登记资源，不把私有环境文件提交仓库。

真实候选设备须冻结架构、OS／kernel、Docker／Compose、CPU／RAM、swap、磁盘介质／可用量及背景负载。每画像按相同数据集重复冷启动、空闲、首个真实任务及声明并发，追加 API／MCP／Worker／限流／上传下载／完整备份恢复与重启故障；固定记录 p95／p99、错误率、OOM、磁盘、启动和恢复耗时。阈值由实测及用户使用目标裁定，不凭本轮小数据推最低值。

当前没有 2 GB、1 GB、ARM64 服务端、完整离线服务端、私有 CA／企业身份或新 Redis-free／filesystem 组合的测量。建议准备匹配 Docker 的 Linux 主机、SSD 和独立备份空间；内存及 CPU 数量不作未测最低承诺。设备与访问条件未指定的结果均未测。
'''
(out/'measurement.md').write_text(md,encoding='utf-8',newline='\n')
print(json.dumps({'phases':len(phaseRows),'samples':len(samples),'http':len(r['http']),'evidenceFiles':len(files)}))
```
