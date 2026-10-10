"""同一 owner/container 的新空恢复夹具；旧失败桶、数据库与恢复目录全部保留。"""
from pathlib import Path
import datetime,json,re,subprocess,urllib.parse,uuid
ROOT=Path(__file__).resolve().parents[3];DOC=ROOT/'docs/plan/agent-mcp-m5';LOCAL=ROOT/'.tmp/m5-runtime'
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
owner=json.loads((DOC/'product-owner.json').read_text(encoding='utf8'));env=json.loads((LOCAL/'environment.json').read_text(encoding='utf8'))
assert owner['runId']=='m5-5dbe32e19a' and owner['workspace']==str(ROOT)
def call(argv):return subprocess.run(argv,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
containers={x['kind']:x for x in owner['containers']}
for x in containers.values():
 r=call(['docker','inspect','--format','{{.Id}}|{{index .Config.Labels "workmesh.m5.owner"}}|{{.State.Running}}',x['containerId']]);assert r.returncode==0
 assert r.stdout.decode().strip()==x['containerId']+'|'+owner['runId']+'|true'
assert not (DOC/'product-recovery-current-preparation.json').exists(),'已有准备原件，禁止覆盖或丢弃失败现场'
suffix='current_'+uuid.uuid4().hex[:8];base=owner['runId'].replace('-','_')+'_'+suffix
resources={'owner':owner['runId'],'registeredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceDatabase':base+'_source_test','targetDatabase':base+'_target_test','sourceBucket':owner['runId']+'-'+suffix.replace('_','-')+'-source','targetBucket':owner['runId']+'-'+suffix.replace('_','-')+'-target','operations':[],'oldRecoveryResourcesPreserved':True,'deletions':0}
owner.setdefault('additionalRecoveryResources',[]).append(resources);save(DOC/'product-owner.json',owner)
receipt=DOC/'product-recovery-current-preparation.json';save(receipt,resources)
for name in [resources['sourceDatabase'],resources['targetDatabase']]:
 assert re.fullmatch('[a-z0-9_]+',name)
 r=call(['docker','exec',containers['postgres']['containerId'],'createdb','-U','workmesh',name]);resources['operations'].append({'kind':'createdb','target':name,'exit':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()});save(receipt,resources);assert r.returncode==0
for bucket in [resources['sourceBucket'],resources['targetBucket']]:
 assert re.fullmatch('[a-z0-9-]+',bucket)
 tasks=[('create','',None),('versioning','?versioning','<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>Enabled</Status></VersioningConfiguration>'),('object-lock','?object-lock','<ObjectLockConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><ObjectLockEnabled>Enabled</ObjectLockEnabled></ObjectLockConfiguration>')]
 for kind,query,body in tasks:
  command='curl -sS --fail --aws-sigv4 "aws:amz:us-east-1:s3" --user "$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD" -X PUT '
  if body:command+='-H "Content-Type: application/xml" --data-binary '+"'"+body+"' "
  command+='"http://127.0.0.1:9000/'+bucket+query+'"'
  r=call(['docker','exec',containers['store']['containerId'],'sh','-c',command]);resources['operations'].append({'kind':kind,'target':bucket,'exit':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()});save(receipt,resources);assert r.returncode==0
parsed=urllib.parse.urlsplit(env['DATABASE_URL'])
env.update({'RECOVERY_SOURCE_DATABASE_URL':urllib.parse.urlunsplit(parsed._replace(path='/'+resources['sourceDatabase'])),'RECOVERY_TARGET_DATABASE_URL':urllib.parse.urlunsplit(parsed._replace(path='/'+resources['targetDatabase'])),'RECOVERY_SOURCE_S3_BUCKET':resources['sourceBucket'],'RECOVERY_TARGET_S3_BUCKET':resources['targetBucket'],'WORKMESH_PLAYWRIGHT_RUN_DIR':str(LOCAL/'recovery-current')})
save(LOCAL/'environment.json',env);save(DOC/'product-owner.json',owner)
print(json.dumps({'preparedOwnedDatabases':2,'preparedOwnedBuckets':2,'sameExistingContainers':True,'oldResourcesPreserved':True,'secretsPrinted':False}))
