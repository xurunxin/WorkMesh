"""保存本轮规划静态检查的实际命令、原始输出和暂存字节；不运行产品。"""
from pathlib import Path
import datetime,hashlib,json,subprocess,sys,time,zipfile

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
PREFIX=OUT.relative_to(ROOT).as_posix()
def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def write(name,value):
 (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
checks=[];members={}
def run(name,args):
 started=now();tick=time.monotonic()
 result=subprocess.run(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 row={'name':name,'argv':args,'cwd':str(ROOT),'startedAt':started,'endedAt':now(),
      'runtimeSeconds':time.monotonic()-tick,'nativeExit':result.returncode}
 for channel in ('stdout','stderr'):
  body=getattr(result,channel);member=name+'/'+channel
  members[member]=body;row[channel]={'member':member,**fp(body)}
 checks.append(row)
 if result.returncode:raise RuntimeError(name+' exit='+str(result.returncode))
 return result.stdout

failure=None;staged=[];classification=None
try:
 run('operation-matrix',[sys.executable,PREFIX+'/build-operation-matrix.py'])
 run('full-source-and-plan',[sys.executable,PREFIX+'/verify-planning.py'])
 run('stage-authorized-planning-files',['git','add','--',PREFIX])
 run('staged-whitespace',['git','diff','--cached','--check'])
 paths=run('staged-paths',['git','diff','--cached','--name-only','-z']).decode('utf8').split('\0')
 paths=[p for p in paths if p]
 assert paths and all(p.startswith(PREFIX+'/') for p in paths),'只允许规划目录变更'
 code="import {classifyChanges,readWorkspaces} from './scripts/ci-policy.mjs';const paths=JSON.parse(process.argv[1]);console.log(JSON.stringify({paths,...classifyChanges(paths,readWorkspaces())}));"
 classification=json.loads(run('actual-ci-classification',['node','--input-type=module','-e',code,json.dumps(paths)]))
 assert classification['mode']=='full' and all(classification['checks'].values())
 write('planning-ci-classification.json',classification)
 for path in paths:
  blob=run('index-'+str(len(staged)),['git','show',':'+path])
  worktree=(ROOT/path).read_bytes()
  assert blob==worktree,(path,'暂存与实际字节不同')
  staged.append({'path':path,'blobId':hashlib.sha1(b'blob '+str(len(blob)).encode()+b'\0'+blob).hexdigest(),
                 'index':fp(blob),'worktree':fp(worktree),'equal':True})
except Exception as error:
 failure=str(error)
finally:
 target=OUT/'input/planning-checks-originals.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
  for member,body in sorted(members.items()):
   info=zipfile.ZipInfo(member,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
   info.external_attr=0o100644<<16;z.writestr(info,body)
 result={'productTestsRun':False,'scope':'本轮规划静态核验，产品及联合验收未运行',
         'recordedAt':now(),'failure':failure,'checks':checks,'classification':classification,
         'stagedByteBindings':staged,'archive':{'path':'input/planning-checks-originals.zip',**fp(target.read_bytes())},
         'receiptBoundary':'暂存核验对应上述实际path与byte；本回执、原件ZIP及随后新增的分类回执在末次提交核验另行覆盖。静态核验file列表不自绑定自身，commit回执不自引用其最终head。'}
 write('planning-checks.json',result)
 print(json.dumps({'checks':len(checks),'stagedFiles':len(staged),'failure':failure,
                   'ciMode':classification.get('mode') if classification else None,'productTestsRun':False},ensure_ascii=False))
if failure:sys.exit(1)
