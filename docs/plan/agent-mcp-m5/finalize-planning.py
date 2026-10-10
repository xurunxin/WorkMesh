"""保存最终规划字节核验回执；pre 核暂存、post 核已提交对象，不运行产品。"""
from pathlib import Path
import datetime,hashlib,json,subprocess,sys,time,zipfile

OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2];PREFIX=OUT.relative_to(ROOT).as_posix()
mode=sys.argv[1];assert mode in ('pre','post')
def fp(body):return {'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
rows=[];members={};bindings=[];failure=None
def run(name,args):
 started=now();tick=time.monotonic()
 result=subprocess.run(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 row={'name':name,'argv':args,'startedAt':started,'endedAt':now(),'runtimeSeconds':time.monotonic()-tick,'nativeExit':result.returncode}
 for channel in ('stdout','stderr'):
  body=getattr(result,channel);member=name+'/'+channel;members[member]=body
  row[channel]={'member':member,**fp(body)}
 rows.append(row)
 if result.returncode:raise RuntimeError(name+' exit='+str(result.returncode))
 return result.stdout
head=None;classification=None
try:
 if mode=='pre':
  run('final-source-archive',[sys.executable,'-c',"import runpy,json;print(json.dumps(runpy.run_path('"+PREFIX+"/capture-planning.py')['source_capture']()))"])
  run('final-matrix',[sys.executable,PREFIX+'/build-operation-matrix.py'])
  run('final-full-static',[sys.executable,PREFIX+'/verify-planning.py'])
  run('final-stage',['git','add','--',PREFIX])
  run('final-whitespace',['git','diff','--cached','--check'])
  paths=run('final-paths',['git','diff','--cached','--name-only','-z']).decode('utf8').split('\0')
  source=':'
 else:
  head=run('candidate-head',['git','rev-parse','HEAD']).decode().strip()
  run('candidate-whitespace',['git','diff',head+'^',head,'--check'])
  paths=run('candidate-paths',['git','diff',head+'^',head,'--name-only','-z']).decode('utf8').split('\0')
  source=head+':'
 paths=[p for p in paths if p]
 assert paths and all(p.startswith(PREFIX+'/') for p in paths),'规划提交不得含产品变更'
 code="import {classifyChanges,readWorkspaces} from './scripts/ci-policy.mjs';const paths=JSON.parse(process.argv[1]);console.log(JSON.stringify({paths,...classifyChanges(paths,readWorkspaces())}));"
 classification=json.loads(run('final-ci-classification',['node','--input-type=module','-e',code,json.dumps(paths)]))
 assert classification['mode']=='full' and all(classification['checks'].values())
 for path in paths:
  args=['git','show',source+path]
  result=subprocess.run(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  assert result.returncode==0,(path,result.returncode)
  body=result.stdout;worktree=(ROOT/path).read_bytes()
  assert body==worktree,(path,'对象与运行byte不同')
  bindings.append({'path':path,'argv':args,'nativeExit':result.returncode,'blobId':hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest(),
                   'object':fp(body),'worktree':fp(worktree),'equal':True,
                   'rawByteSource':'准确Git对象可重读；本文只登记字节指纹，不将哈希称stdout全文归档'})
except Exception as error:failure=str(error)
finally:
 name='planning-final-static' if mode=='pre' else 'planning-commit-verification'
 archive='input/'+name+'-originals.zip'
 with zipfile.ZipFile(OUT/archive,'w',zipfile.ZIP_DEFLATED) as z:
  for member,body in sorted(members.items()):
   info=zipfile.ZipInfo(member,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
   z.writestr(info,body)
 value={'mode':mode,'recordedAt':now(),'candidateHead':head,'productTestsRun':False,'failure':failure,
        'checks':rows,'ciClassification':classification,'byteBindings':bindings,
        'archive':{'path':archive,**fp((OUT/archive).read_bytes())},
        'receiptBoundary':'本回执及其输出ZIP在核验完成后生成；随后只追加回执。最终head于聊天与只读Git实报，不自引用、不借旧head验收产品。'}
 (OUT/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
 print(json.dumps({'mode':mode,'candidateHead':head,'files':len(bindings),'failure':failure,
                   'ciMode':classification.get('mode') if classification else None,'productTestsRun':False},ensure_ascii=False))
if failure:sys.exit(1)
