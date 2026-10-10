"""记录同步规划的实际静态检查和对象字节，不安装、不运行产品、不清理资源。"""
from pathlib import Path
import datetime,hashlib,json,subprocess,sys,time,zipfile
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2];PREFIX=OUT.relative_to(ROOT).as_posix()
BASE='32a544fecab58601a1ab9ff3e794896a813b9f22';MAIN='87f88b89297c5c1e346f7ef99118c410f4b4a905'
mode=sys.argv[1];assert mode in ('pre','post')
def fp(body):return {'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
checks=[];members={};bindings=[];failure=None;classification=None;head=None
def run(name,args):
 tick=time.monotonic();started=now()
 result=subprocess.run(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 row={'name':name,'argv':args,'cwd':str(ROOT),'startedAt':started,'endedAt':now(),
      'runtimeSeconds':time.monotonic()-tick,'nativeExit':result.returncode}
 for channel in ('stdout','stderr'):
  body=getattr(result,channel);member=name+'/'+channel;members[member]=body
  row[channel]={'member':member,**fp(body)}
 checks.append(row)
 if result.returncode:raise RuntimeError(name+' exit='+str(result.returncode))
 return result.stdout
try:
 if mode=='pre':
  run('baseline-preserved',[sys.executable,PREFIX+'/capture-review-base.py'])
  run('plan-full-copy-and-edits',[sys.executable,PREFIX+'/sync-current-plan.py'])
  run('operation-matrix',[sys.executable,PREFIX+'/build-operation-matrix.py'])
  run('full-source-and-review-plan',[sys.executable,PREFIX+'/verify-planning.py'])
  run('stage-authorized-planning',['git','add','--',PREFIX])
  run('staged-whitespace',['git','diff','--cached','--check'])
  run('main-to-index-whitespace',['git','diff','--cached',MAIN,'--check'])
  changed=run('changed-paths',['git','diff','--cached','--name-only','-z']).decode('utf8').split('\0')
  paths=run('pr-main-to-index-paths',['git','diff','--cached',MAIN,'--name-only','-z']).decode('utf8').split('\0')
  allpaths=run('all-index-planning-files',['git','ls-files','-z','--',PREFIX]).decode('utf8').split('\0')
  source=':'
 else:
  head=run('candidate-head',['git','rev-parse','HEAD']).decode().strip()
  run('candidate-whitespace',['git','diff',BASE,head,'--check'])
  run('main-to-candidate-whitespace',['git','diff',MAIN,head,'--check'])
  changed=run('changed-paths',['git','diff',BASE,head,'--name-only','-z']).decode('utf8').split('\0')
  paths=run('pr-main-to-candidate-paths',['git','diff',MAIN,head,'--name-only','-z']).decode('utf8').split('\0')
  allpaths=run('all-committed-planning-files',['git','ls-tree','-rz','--name-only',head,'--',PREFIX]).decode('utf8').split('\0')
  source=head+':'
 changed=[p for p in changed if p];paths=[p for p in paths if p];allpaths=[p for p in allpaths if p]
 assert changed and all(p.startswith(PREFIX+'/') for p in paths),'只允许本规划目录，无产品变更'
 code="import {classifyChanges,readWorkspaces} from './scripts/ci-policy.mjs';const paths=JSON.parse(process.argv[1]);console.log(JSON.stringify({paths,...classifyChanges(paths,readWorkspaces())}));"
 classification=json.loads(run('actual-complete-pr-ci-classification',['node','--input-type=module','-e',code,json.dumps(paths)]))
 assert classification['mode']=='full' and all(classification['checks'].values())
 for path in allpaths:
  argv=['git','show',source+path];result=subprocess.run(argv,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  assert result.returncode==0,(path,result.returncode)
  blob=result.stdout;worktree=(ROOT/path).read_bytes();assert blob==worktree,(path,'对象与实际字节不同')
  bindings.append({'path':path,'argv':argv,'nativeExit':result.returncode,
                   'blobId':hashlib.sha1(b'blob '+str(len(blob)).encode()+b'\0'+blob).hexdigest(),
                   'object':fp(blob),'worktree':fp(worktree),'equal':True,
                   'rawByteSource':'准确Git对象可完整重读；只登记指纹，不把摘要称stdout原件'})
except Exception as error:failure=str(error)
finally:
 name='review-checks' if mode=='pre' else 'review-commit-verification'
 archive='input/'+name+'-originals.zip'
 with zipfile.ZipFile(OUT/archive,'w',zipfile.ZIP_DEFLATED) as z:
  for member,body in sorted(members.items()):
   info=zipfile.ZipInfo(member,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
   z.writestr(info,body)
 value={'mode':mode,'recordedAt':now(),'main':MAIN,'reviewedBase':BASE,'candidateHead':head,
        'productTestsRun':False,'blockingFindings':{'B1':'待_oY复核','B2':'待_oY复核','B3':'待_oY复核'},
        'failure':failure,'checks':checks,'ciClassification':classification,'byteBindings':bindings,
        'changedFiles':changed if 'changed' in globals() else [],
        'archive':{'path':archive,**fp((OUT/archive).read_bytes())},
        'receiptBoundary':'本回执与ZIP在上述检查之后生成，下次只追加/更新对应回执；最终head在聊天及只读Git实报，不为自引用循环补写。旧planning回执保持原时点。'}
 (OUT/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
 print(json.dumps({'mode':mode,'candidateHead':head,'checks':len(checks),'files':len(bindings),
                   'changedFiles':len(value['changedFiles']),'failure':failure,
                   'ciMode':classification.get('mode') if classification else None,'productTestsRun':False},ensure_ascii=False))
if failure:sys.exit(1)
