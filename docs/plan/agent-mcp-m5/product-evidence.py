"""仅本批已登记资源：准备既有恢复检查、脱敏保全和停止 owned 容器；不删除目录或镜像。"""
from pathlib import Path
import datetime,hashlib,json,os,re,subprocess,sys,urllib.parse,zipfile
ROOT=Path(__file__).resolve().parents[3]; DOC=ROOT/'docs/plan/agent-mcp-m5'; LOCAL=ROOT/'.tmp/m5-runtime'
sys.stdout.reconfigure(encoding='utf8',errors='replace')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
def call(argv):return subprocess.run(argv,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
ledger=json.loads((DOC/'product-owner.json').read_text(encoding='utf8'))
env=json.loads((LOCAL/'environment.json').read_text(encoding='utf8'))
def inspect(row):
 result=call(['docker','inspect',row['containerId']]);assert result.returncode==0,'owned 容器缺失'
 value=json.loads(result.stdout)[0]
 assert value['Id']==row['containerId'] and value['Config']['Labels'].get('workmesh.m5.owner')==ledger['runId'],'owner 不匹配，禁止操作'
 return {'id':value['Id'],'name':value['Name'],'state':value['State'],'mounts':value['Mounts'],'networkMode':value['HostConfig']['NetworkMode'],'imageId':value['Image']}
if sys.argv[1]=='prepare-checks':
 assert LOCAL.resolve().is_relative_to(ROOT.resolve()) and not LOCAL.is_symlink()
 rows=[inspect(row) for row in ledger['containers']]
 assert all(row['state']['Running'] for row in rows),'先恢复本任务已登记服务'
 pg=next(row for row in ledger['containers'] if row['kind']=='postgres')
 store=next(row for row in ledger['containers'] if row['kind']=='store')
 assert 'recoveryResources' not in ledger,'恢复准备已登记，禁止覆盖'
 suffix=ledger['runId'].replace('-','_');source=suffix+'_source_test';target=suffix+'_target_test'
 resources={'registeredAt':now(),'sourceDatabase':source,'targetDatabase':target,'sourceBucket':ledger['runId']+'-source','targetBucket':ledger['runId']+'-target','nativeResults':[],'playwrightRoot':str(LOCAL/'playwright')}
 ledger['recoveryResources']=resources;save(DOC/'product-owner.json',ledger)
 for database in [source,target]:
  assert re.fullmatch('[a-z0-9_]+',database)
  result=call(['docker','exec',pg['containerId'],'createdb','-U','workmesh',database])
  resources['nativeResults'].append({'operation':'createdb','database':database,'exit':result.returncode,'stdout':result.stdout.decode(errors='replace'),'stderr':result.stderr.decode(errors='replace')})
  save(DOC/'product-owner.json',ledger);assert result.returncode==0,'恢复test库准备失败'
 for bucket in [resources['sourceBucket'],resources['targetBucket']]:
  assert re.fullmatch('[a-z0-9-]+',bucket)
  script='curl -sS --fail --aws-sigv4 "aws:amz:us-east-1:s3" --user "$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD" -X PUT http://127.0.0.1:9000/'+bucket
  result=call(['docker','exec',store['containerId'],'sh','-c',script])
  resources['nativeResults'].append({'operation':'create-owned-bucket','bucket':bucket,'exit':result.returncode})
  save(DOC/'product-owner.json',ledger);assert result.returncode==0,'恢复bucket准备失败'
 parsed=urllib.parse.urlsplit(env['DATABASE_URL'])
 env.update({'RUN_RECOVERY_INTEGRATION':'1','RECOVERY_SOURCE_DATABASE_URL':urllib.parse.urlunsplit(parsed._replace(path='/'+source)),
  'RECOVERY_TARGET_DATABASE_URL':urllib.parse.urlunsplit(parsed._replace(path='/'+target)), 'WORKMESH_POSTGRES_TOOL_CONTAINER':pg['name'],
  'RECOVERY_TEST_S3_ENDPOINT':env['S3_ENDPOINT'],'RECOVERY_TEST_S3_ACCESS_KEY_ID':env['S3_ACCESS_KEY_ID'],'RECOVERY_TEST_S3_SECRET_ACCESS_KEY':env['S3_SECRET_ACCESS_KEY'],
  'RECOVERY_SOURCE_S3_BUCKET':resources['sourceBucket'],'RECOVERY_TARGET_S3_BUCKET':resources['targetBucket'],'WORKMESH_PLAYWRIGHT_RUN_DIR':resources['playwrightRoot']})
 save(LOCAL/'environment.json',env);print(json.dumps({'owner':ledger['runId'],'preparedRecoveryDatabases':2,'ownedBuckets':2,'credentialsPrinted':False}))
elif sys.argv[1]=='ci-profile':
 old=env.pop('WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST',None)
 limits={'AUTH_RATE_LIMIT_ENDPOINT_BURST':'10000','AUTH_RATE_LIMIT_SOCKET_BURST':'10000','AUTH_RATE_LIMIT_CLIENT_IP_BURST':'10000','AUTH_RATE_LIMIT_SUBJECT_BURST':'1000','AUTH_RATE_LIMIT_INSTALL_BURST':'100'}
 env.update(limits);save(LOCAL/'environment.json',env)
 save(DOC/'product-check-profile.json',{'at':now(),'source':'.github/workflows/ci.yml api-integration and e2e environment','authLimits':limits,'removedOuterPrivateHostAllowlist':old,'privateModels':'fixture grants loopback only while preparing and executing its controlled model','productionPolicyChanged':False,'sharedRedisFlushed':False,'firstFailurePreserved':'required-integration'})
 print(json.dumps({'ciTestLimitsApplied':True,'outerPrivateModelAllowlistRemoved':True,'productionPolicyChanged':False}))
elif sys.argv[1]=='prepare-object-lock':
 store=next(row for row in ledger['containers'] if row['kind']=='store');inspect(store)
 results=[]
 for bucket in [ledger['recoveryResources']['sourceBucket'],ledger['recoveryResources']['targetBucket']]:
  assert bucket.startswith(ledger['runId']+'-') and re.fullmatch('[a-z0-9-]+',bucket)
  for query,body in [('versioning','<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>Enabled</Status></VersioningConfiguration>'),('object-lock','<ObjectLockConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><ObjectLockEnabled>Enabled</ObjectLockEnabled></ObjectLockConfiguration>')]:
   script='curl -sS --fail --aws-sigv4 "aws:amz:us-east-1:s3" --user "$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD" -H "Content-Type: application/xml" -X PUT --data-binary '+"'"+body+"'"+' "http://127.0.0.1:9000/'+bucket+'?'+query+'"'
   result=call(['docker','exec',store['containerId'],'sh','-c',script])
   results.append({'bucket':bucket,'operation':query,'exit':result.returncode,'stdout':result.stdout.decode(errors='replace'),'stderr':result.stderr.decode(errors='replace')})
   save(DOC/'product-recovery-preparation.json',{'at':now(),'reason':'existing recovery suite requires versioning and ObjectLock; owned preparatory buckets were initially empty without these flags','owner':ledger['runId'],'results':results,'bucketDeletes':0})
   assert result.returncode==0,'原生S3配置失败；保留目标，不改权限或绕过'
 print(json.dumps({'ownedRecoveryBucketsConfigured':2,'bucketDeletes':0,'sharedStoreUntouched':True}))
elif sys.argv[1]=='normalize-readback':
 file=DOC/'input/product-platform-todo-readback.txt';raw=file.read_bytes()
 target=DOC/'input/product-platform-todo-readback-raw.zip'
 assert not target.exists(),'原读回原件已保全，禁止覆盖'
 with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as zipped:zipped.writestr(file.name,raw)
 with zipfile.ZipFile(target) as zipped:assert zipped.read(file.name)==raw
 normalized=('\n'.join(line.rstrip() for line in raw.decode('utf8').splitlines()).rstrip()+'\n').encode('utf8')
 file.write_bytes(normalized)
 save(DOC/'input/product-platform-readback-provenance.json',{'rawArchive':target.name,'member':file.name,'rawArchiveSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'rawSha256':hashlib.sha256(raw).hexdigest(),'readableSha256':hashlib.sha256(normalized).hexdigest(),'operation':'仅去可读副本行尾空白／多余尾部空行并采用LF；原平台截断Saved plan保持截断，不补全文','firstFailure':'final-staged-whitespace-first native exit2','specTextChanged':False})
 print(json.dumps({'rawReadbackPreservedAndVerified':True,'readableWhitespaceNormalized':True,'specChanged':False}))
elif sys.argv[1]=='bundle':
 previous=json.loads((DOC/'product-evidence-index.json').read_text(encoding='utf8')) if (DOC/'product-evidence-index.json').exists() else None
 files=list((LOCAL/'checks').glob('*'))+list((LOCAL/'sources').glob('*'))
 files+=list((LOCAL/'processes').glob('*.json'))
 last=LOCAL/'playwright/root-mixed/output/.last-run.json'
 if last.is_file():files.append(last)
 files+=list((LOCAL/'evidence').rglob('*.json'))+list((LOCAL/'evidence').rglob('*.log'))
 for folder in ['mcp-coverage','execution-recovery','planning-collaboration','delivery-recovery']:
  files+=list((ROOT/'ci-logs'/folder).rglob('*.json'))
 entries=[]; out=DOC/'product-evidence';out.mkdir(exist_ok=True)
 tmp=LOCAL/'evidence-bundle.zip'
 # Never include environment.json, cookies/auth state, private config, DB files or model secrets.
 secrets=[v for k,v in env.items() if any(key in k for key in ['TOKEN','SECRET','PASSWORD','MASTER_KEY','DATABASE_URL','HMAC_KEY']) and len(v)>8]
 secrets += [urllib.parse.unquote(urllib.parse.urlsplit(value).password or '') for key,value in env.items() if key.endswith('DATABASE_URL')]
 secrets = [value for value in secrets if len(value)>8]
 with zipfile.ZipFile(tmp,'w',compression=zipfile.ZIP_DEFLATED) as archive:
  for file in sorted(set(files)):
   if not file.is_file() or file.is_symlink():continue
   if file.name=='opencode.json':continue
   raw=file.read_bytes();text=raw.decode('utf8',errors='strict')
   for value in sorted(secrets,key=len,reverse=True):text=text.replace(value,'[redacted]')
   text=re.sub(r'wm[ips]_[A-Za-z0-9_-]+','[credential]',text)
   text=re.sub(r'([?&]X-Amz-(?:Signature|Credential|Security-Token)=)[^&\s"\\]+',r'\1[redacted]',text,flags=re.I)
   public=text.encode('utf8');member=file.relative_to(ROOT).as_posix()
   archive.writestr(member,public)
   entries.append({'sourcePath':member,'member':member,'rawSha256':hashlib.sha256(raw).hexdigest(),'publicSha256':hashlib.sha256(public).hexdigest(),'rawBytes':len(raw),'publicBytes':len(public),'redactionChangedBytes':raw!=public,'modifiedAt':datetime.datetime.fromtimestamp(file.stat().st_mtime,datetime.timezone.utc).isoformat(),'interpretation':'现时运行目录原件；含旧套件历史文件，须按命令与对应源码manifest关联，不以目录存在证明新用例运行'})
 digest=hashlib.sha256(tmp.read_bytes()).hexdigest();target=out/(digest+'.zip')
 target.write_bytes(tmp.read_bytes())
 # Read every member back before binding the archive. Original local bytes stay in recovery.
 with zipfile.ZipFile(target) as archive:
  assert set(archive.namelist())=={row['member'] for row in entries}
  for row in entries:assert hashlib.sha256(archive.read(row['member'])).hexdigest()==row['publicSha256']
 prior=(previous.get('supersededArchives',[])+[{'archive':previous['archive'],'sha256':previous['sha256'],'bytes':previous['bytes'],'createdAt':previous['createdAt'],'meaning':'同轮较早保全包，不含后续命令；原件留存'}]) if previous and previous['sha256']!=digest else []
 save(DOC/'product-evidence-index.json',{'archive':'product-evidence/'+target.name,'sha256':digest,'bytes':target.stat().st_size,'createdAt':now(),'entries':entries,'supersededArchives':prior,'originalLocalBytesPreserved':True,'missing':['earliest checks had no contemporaneous source before/after manifest','intermediate overwritten same-name live captures are not reconstructible','intermediate uncommitted test/driver source bodies were not preserved at every failure; fingerprints do not reconstruct those bodies'],'format':'ZIP preserves public bytes, no newline normalization'})
 print(json.dumps({'archive':target.name,'members':len(entries),'bytes':target.stat().st_size,'allMembersVerified':True}))
elif sys.argv[1]=='summarize':
 rows=json.loads((DOC/'product-checks.json').read_text(encoding='utf8'));summaries=[]
 for row in rows:
  file=ROOT/row['logs']['stdout']['path'];text=re.sub(r'\x1b\[[0-9;]*m','',file.read_text(encoding='utf8'))
  counts=[line.strip() for line in text.splitlines() if re.search(r'(?:Test Files\s+|Tests\s+\d|# tests |# pass |# fail |# skipped |Tasks:\s+|Cached:\s+|\d+ passed \(|\d+ failed\s*$|\d+ skipped\s*$)',line)]
  summaries.append({'label':row['label'],'exit':row['nativeExit'],'runtimeSeconds':row['runtimeSeconds'],'countsFromActualStdout':counts,'selectionFilter':('-t' in row['argv']),'countsInterpretation':'过滤运行的 skipped 包含未选择用例；完整运行的环境 skip 按原套件原因保留','sourceBinding':row.get('sourceBinding')})
 save(DOC/'product-check-summary.json',{'derivedFrom':'product-checks.json and preserved actual stdout','rows':summaries,'historicalResultsNotReplaced':True})
 print(json.dumps({'summarizedActualCommands':len(summaries),'failedRunsPreserved':sum(row['exit']!=0 for row in summaries)}))
elif sys.argv[1]=='cleanup':
 # Only stop exact IDs whose owner label and original ID both match. Preserve volumes, networks, images, directories.
 before=[inspect(row) for row in ledger['containers']];operations=[]
 for row in ledger['containers']:
  value=inspect(row)
  if value['state']['Running']:
   result=call(['docker','stop','--time','20',row['containerId']])
   operations.append({'containerId':row['containerId'],'argv':['docker','stop','--time','20',row['containerId']],'exit':result.returncode,'stdout':result.stdout.decode().strip(),'stderr':result.stderr.decode(errors='replace')})
   assert result.returncode==0,'停止失败，保留现场'
 after=[inspect(row) for row in ledger['containers']]
 assert all(not row['state']['Running'] for row in after)
 receipt={'at':now(),'before':before,'operations':operations,'after':after,'containersRetained':True,'volumesRetained':True,'sharedImagesAndNetworksPreserved':True,'recoveryDirectoryRetained':str(LOCAL),'recursiveDeletes':0,'G1D0C3':'untouched'}
 save(DOC/'product-cleanup.json',receipt);ledger['cleanup']='本人精确ID容器已停止；容器/卷/镜像/网络/恢复目录保留';save(DOC/'product-owner.json',ledger)
 print(json.dumps({'ownedContainersStopped':3,'recursiveDeletes':0,'recoveryPreserved':True}))
else:raise SystemExit('未知模式')
