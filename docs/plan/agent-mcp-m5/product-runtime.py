"""本任务独有服务与实际检查回执；凭据只留在忽略的 .tmp，不输出。"""
from pathlib import Path
import datetime,hashlib,json,os,secrets,socket,subprocess,sys,time,uuid
sys.stdout.reconfigure(encoding='utf8',errors='replace')
sys.stderr.reconfigure(encoding='utf8',errors='replace')

ROOT=Path(__file__).resolve().parents[3]
DOC=ROOT/'docs/plan/agent-mcp-m5';LOCAL=ROOT/'.tmp/m5-runtime'
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def call(argv,env=None):return subprocess.run(argv,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def source_fingerprints():
 head=call(['git','rev-parse','HEAD']).stdout.decode().strip()
 tree=call(['git','ls-tree','-rz',head]).stdout.split(b'\0');objects={}
 for row in tree:
  if row:
   meta,path=row.split(b'\t',1);objects[path.decode()]=meta.split()[2].decode()
 tracked=call(['git','ls-files','-z']).stdout.decode().split('\0')
 added=call(['git','ls-files','--others','--exclude-standard','-z']).stdout.decode().split('\0')
 values=[]
 for path in sorted(set(tracked+added)):
  if not path or (path.startswith(('docs/plan/','docs/reviews/')) and path!='docs/plan/agent-mcp-m5/product-runtime.py'):continue
  file=ROOT/path
  if not file.is_file():continue
  raw=file.read_bytes();blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
  values.append({'path':path,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'runtimeBlob':blob,'headBlob':objects.get(path),'matchesHead':objects.get(path)==blob})
 return {'head':head,'entries':values,'digest':hashlib.sha256(json.dumps(values,sort_keys=True).encode()).hexdigest()}
if sys.argv[1]=='prepare':
 assert not (LOCAL/'environment.json').exists(),'已有恢复目录，禁止覆盖'
 LOCAL.mkdir(parents=True,exist_ok=True)
 run='m5-'+uuid.uuid4().hex[:10];pw=secrets.token_hex(24);dbport,redisport,storeport=port(),port(),port()
 env={k:v for k,v in os.environ.items() if k.upper() in ['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','HOME','NUMBER_OF_PROCESSORS']}
 env.update({'DATABASE_URL':f'postgres://workmesh:{pw}@127.0.0.1:{dbport}/workmesh_test','REDIS_URL':f'redis://127.0.0.1:{redisport}',
  'NODE_ENV':'test','RUN_INTEGRATION':'1','WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK':'true','WORKMESH_BOOTSTRAP_TOKEN':secrets.token_urlsafe(32),
  'SESSION_SECRET':secrets.token_hex(32),'WORKMESH_MASTER_KEY':secrets.token_hex(32),'WORKMESH_RUNNER_SERVICE_TOKEN':secrets.token_hex(32),
  'AUTH_RATE_LIMIT_HMAC_KEY':secrets.token_hex(32),'AUTH_RATE_LIMIT_REDIS_PREFIX':run,'WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST':'127.0.0.1',
  'S3_ENDPOINT':f'http://127.0.0.1:{storeport}','S3_REGION':'us-east-1','S3_BUCKET':run,'S3_ACCESS_KEY_ID':run,'S3_SECRET_ACCESS_KEY':secrets.token_hex(24),
  'M5_CLIENT_EXECUTABLE':r'C:\Users\xurx\.bun\install\global\node_modules\@opencode\cli\bin\opencode.exe','M5_EVIDENCE_ROOT':str(LOCAL/'evidence')})
 save(LOCAL/'environment.json',env)
 pgfile=LOCAL/'postgres.env';pgfile.write_text(f'POSTGRES_USER=workmesh\nPOSTGRES_DB=workmesh_test\nPOSTGRES_PASSWORD={pw}\n')
 storefile=LOCAL/'store.env';storefile.write_text(f'MINIO_ROOT_USER={run}\nMINIO_ROOT_PASSWORD={env["S3_SECRET_ACCESS_KEY"]}\n')
 ledger={'runId':run,'task':'M5','workspace':str(ROOT),'startedAt':now(),'containers':[],'sharedImagesPreserved':True,'recoveryDirectory':str(LOCAL),'cleanup':'未执行'}
 for kind,image,p,e,args in [('postgres','postgres:16.9-alpine',dbport,pgfile,[]),('redis','redis:7.4.5-alpine',redisport,None,[]),('store','rustfs/rustfs:1.0.0',storeport,storefile,[])]:
  name=run+'-'+kind;target={'postgres':5432,'redis':6379,'store':9000}[kind]
  row={'kind':kind,'name':name,'image':image,'port':p,'registeredAt':now(),'owner':run,'containerId':None}
  ledger['containers'].append(row);save(DOC/'product-owner.json',ledger)
  argv=['docker','run','-d','--pull','never','--name',name,'--label','workmesh.m5.owner='+run,'-p',f'127.0.0.1:{p}:{target}']
  if e:argv+=['--env-file',str(e)]
  result=call(argv+[image]+args)
  row.update({'nativeExit':result.returncode,'containerId':result.stdout.decode().strip(),'stderr':result.stderr.decode(errors='replace')});save(DOC/'product-owner.json',ledger)
  if result.returncode:raise SystemExit('独有 '+kind+' 准备失败；见 owner 回执')
 for attempt in range(60):
  result=call(['docker','exec',run+'-postgres','pg_isready','-U','workmesh'])
  if result.returncode==0:break
  time.sleep(.5)
 else:raise SystemExit('独有 Postgres 未 ready')
 print(json.dumps({'owner':run,'registeredContainers':3,'database':'workmesh_test','credentialsPrinted':False}))
elif sys.argv[1] in ['check','check-joint','check-e2e']:
 profile={'check-joint':'joint-environment.json','check-e2e':'e2e-environment.json'}.get(sys.argv[1],'environment.json')
 env=json.loads((LOCAL/profile).read_text(encoding='utf8'));label=sys.argv[2];argv=sys.argv[3:]
 assert argv and all('wmi_' not in arg for arg in argv)
 before=source_fingerprints();started=now();tick=time.monotonic()
 fingerprints=LOCAL/'sources';fingerprints.mkdir(exist_ok=True)
 sourcepath=fingerprints/(label+'.json')
 assert not sourcepath.exists(),'命令 label 已有原件，必须使用新 label，禁止覆盖首败/共享快照'
 save(sourcepath,{'before':before,'after':None,'processCompleted':False})
 # Keep partial output in the private recovery directory even if a turn is interrupted.
 # Only the redacted completed files below may enter the public evidence bundle.
 rawdir=LOCAL/'private-check-output';rawdir.mkdir(exist_ok=True)
 rawout=rawdir/(label+'-stdout.bin');rawerr=rawdir/(label+'-stderr.bin')
 stdoutfile=rawout.open('wb');stderrfile=rawerr.open('wb')
 process=subprocess.Popen(argv,cwd=ROOT,env=env,stdout=stdoutfile,stderr=stderrfile)
 processpath=LOCAL/'processes'/(label+'.json')
 processrow={'pid':process.pid,'argv':argv,'cwd':str(ROOT),'startedAt':started,'owner':json.loads((DOC/'product-owner.json').read_text(encoding='utf8'))['runId'],'nativeExit':None}
 save(processpath,processrow)
 process.wait();stdoutfile.close();stderrfile.close()
 result=subprocess.CompletedProcess(argv,process.returncode,rawout.read_bytes(),rawerr.read_bytes())
 runtime=time.monotonic()-tick;ended=now();after=source_fingerprints()
 processrow.update({'endedAt':ended,'nativeExit':result.returncode});save(processpath,processrow)
 output=LOCAL/'checks';output.mkdir(exist_ok=True)
 values=[v for k,v in env.items() if any(x in k for x in ['TOKEN','SECRET','PASSWORD','MASTER_KEY','DATABASE_URL'])]
 fingerprints=LOCAL/'sources';fingerprints.mkdir(exist_ok=True)
 sourcepath=fingerprints/(label+'.json');save(sourcepath,{'before':before,'after':after})
 # Keep the original per-command path/bytes. Equal completed manifests share
 # a task-owned immutable file instead of copying the same source inventory.
 sourcebytes=sourcepath.read_bytes();sourcehash=hashlib.sha256(sourcebytes).hexdigest()
 objects=LOCAL/'source-objects';objects.mkdir(exist_ok=True)
 canonical=objects/(sourcehash+'.json')
 if canonical.exists():
  assert canonical.read_bytes()==sourcebytes,'内容寻址快照不一致，停止'
  assert sourcepath.resolve().is_relative_to(LOCAL.resolve()) and not sourcepath.is_symlink()
  sourcepath.unlink();os.link(canonical,sourcepath)
 else:os.link(sourcepath,canonical)
 row={'label':label,'argv':argv,'cwd':str(ROOT),'startedAt':started,'endedAt':ended,'runtimeSeconds':runtime,'nativeExit':result.returncode,'logs':{},'sourceBinding':{'path':str(sourcepath.relative_to(ROOT)),'beforeDigest':before['digest'],'afterDigest':after['digest'],'unchanged':before['digest']==after['digest'],'sha256':hashlib.sha256(sourcepath.read_bytes()).hexdigest()}}
 for channel in ['stdout','stderr']:
  raw=getattr(result,channel).decode('utf8',errors='replace')
  for value in sorted(values,key=len,reverse=True):raw=raw.replace(value,'[redacted]')
  data=raw.encode('utf8');path=output/(label+'-'+channel+'.txt');path.write_bytes(data)
  row['logs'][channel]={'path':str(path.relative_to(ROOT)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'redacted':True}
 receipts=DOC/'product-checks.json';previous=json.loads(receipts.read_text(encoding='utf8')) if receipts.exists() else []
 previous.append(row);save(receipts,previous)
 print(json.dumps(row,ensure_ascii=False))
 print((output/(label+'-stdout.txt')).read_text(encoding='utf8')[-3500:]);print((output/(label+'-stderr.txt')).read_text(encoding='utf8')[-1000:])
 sys.exit(result.returncode)
else:raise SystemExit('未知模式')
