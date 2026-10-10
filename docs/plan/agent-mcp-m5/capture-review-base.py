"""无损保全审核基线全部规划Git对象及本轮修改前工作树字节，不运行产品。"""
from pathlib import Path
import datetime,hashlib,json,subprocess,sys,zipfile
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2]
BASE='32a544fecab58601a1ab9ff3e794896a813b9f22'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def fp(body):return {'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
assert git('rev-parse','HEAD').decode().strip()==BASE
if (OUT/'review-base-manifest.json').exists():
 manifest=json.loads((OUT/'review-base-manifest.json').read_text(encoding='utf8'))
 assert manifest['candidate']==BASE
 assert fp((OUT/manifest['archive']['path']).read_bytes())=={k:manifest['archive'][k] for k in ('bytes','sha256')}
 print(json.dumps({'candidate':BASE,'files':len(manifest['entries']),'alreadyPreserved':True,'overwritten':False}))
 sys.exit(0)
members={};entries=[]
for row in git('ls-tree','-rz',BASE,'--','docs/plan/agent-mcp-m5').split(b'\0'):
 if not row:continue
 meta,path=row.split(b'\t',1);mode,kind,oid=meta.decode().split();assert kind=='blob'
 path=path.decode();item={'path':path,'blobId':oid,'mode':mode}
 for source,body in [('git',git('cat-file','blob',oid)),('worktree',(ROOT/path).read_bytes())]:
  member='members/'+hashlib.sha256(body).hexdigest();members[member]=body
  item[source]={'member':member,**fp(body)}
 entries.append(item)
raw=git('cat-file','commit',BASE);members['commit/'+BASE]=raw
target=OUT/'input/candidate-before-review.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for name,body in sorted(members.items()):
  info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,body)
manifest={'candidate':BASE,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'entries':entries,'commit':{'member':'commit/'+BASE,**fp(raw)},
 'archive':{'path':'input/candidate-before-review.zip','members':len(members),**fp(target.read_bytes())},
 'meaning':'Git为完整已审候选对象；worktree为本轮修改前实读字节，不伪称历史每轮工作树原件。旧首败、数量、source/环境与检查原件全部包括。'}
(OUT/'review-base-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps({'candidate':BASE,'files':len(entries),'archiveMembers':len(members),'productTestsRun':False}))
