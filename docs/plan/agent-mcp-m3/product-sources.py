"""完整Git blob与Windows运行字节独立保全，提交后逐blob复核。"""
from pathlib import Path
import hashlib,json,subprocess,sys,zipfile,shutil
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).parent
sys.stdout.reconfigure(encoding='utf-8')
def git(*args,input=None):return subprocess.check_output(['git',*args],cwd=ROOT,input=input)
def digest(data):return hashlib.sha256(data).hexdigest()
def write(name,value):(HERE/name).write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
def selected(p):
    return p.startswith(('apps/','packages/','scripts/','docs/adr/','.github/')) or p in ['CONTEXT.md','AGENT_PROTOCOL.md','OPENAPI.yaml','SCHEMA.sql','AGENTS.md','package.json','pnpm-lock.yaml','vitest.config.ts','vitest.integration.config.ts','playwright.config.ts','turbo.json','.node-version','.gitattributes','.npmrc','.gitignore'] or p in {f'docs/plan/agent-mcp-{batch}/{name}.json' for batch,name in [('m0','operation-decisions'),('m1','operation-decisions'),('m2','product-discovery-decisions'),('m3','product-discovery-decisions')]}
def read_blobs(objects):
    # cat-file batch returns object bytes without display truncation or newline conversion.
    process=subprocess.Popen(['git','cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    results={}
    for object_id in dict.fromkeys(objects):
        process.stdin.write((object_id+'\n').encode());process.stdin.flush()
        header=process.stdout.readline().decode().strip().split()
        if len(header)!=3 or header[1]!='blob':raise RuntimeError('完整blob读取失败')
        data=process.stdout.read(int(header[2]));assert len(data)==int(header[2]) and process.stdout.read(1)==b'\n'
        results[object_id]=data
    process.stdin.close();assert process.wait()==0
    return results
head=git('rev-parse','HEAD').decode().strip()
if '--verify' in sys.argv:
    manifest=json.loads((HERE/'product-source-manifest.json').read_text(encoding='utf-8'))
    tree={}
    for item in git('ls-tree','-rz',head).split(b'\0'):
        if item:
            metadata,name=item.split(b'\t',1);tree[name.decode()]=metadata.decode().split()[2]
    blobs=read_blobs([tree[r['path']] for r in manifest['files']])
    observations=[]
    for r in manifest['files']:
        working=(ROOT/r['path']).read_bytes();blob_id=tree[r['path']]
        if digest(working)!=r['runtimeSha256'] or blob_id!=r['expectedCandidateBlob']:raise RuntimeError('提交后源码字节变化：'+r['path'])
        observations.append({'path':r['path'],'candidateBlob':blob_id,'candidateSha256':digest(blobs[blob_id]),'runtimeSha256':digest(working),'expectedBlobMatches':True})
    write('product-source-verification.json',{'candidateHead':head,'fileCount':len(observations),'exit':0,'files':observations,
      'boundary':'仅证明product-source-manifest中全部源码、合同、依赖与发现增量精确提交及运行字节一致；报告/日志 metadata successor 不改变这些文件。'})
    print(json.dumps({'candidateHead':head,'files':len(observations),'exit':0}));raise SystemExit(0)
# Preserve the previous complete working-byte snapshot instead of replacing history.
if (HERE/'product-source-snapshot.zip').exists() and (HERE/'product-source-manifest.json').exists():
    old=HERE/'product-source-snapshot.zip';key=digest(old.read_bytes());history=HERE/'product-source-history';history.mkdir(exist_ok=True)
    if not (history/(key+'.zip')).exists():shutil.copyfile(old,history/(key+'.zip'));shutil.copyfile(HERE/'product-source-manifest.json',history/(key+'.json'))
names=sorted(set(n.decode() for n in git('ls-files','-co','--exclude-standard','-z').split(b'\0') if n))
names=[n for n in names if selected(n) and (ROOT/n).is_file()]
base={}
for item in git('ls-tree','-rz',head).split(b'\0'):
    if item:
        metadata,name=item.split(b'\t',1);base[name.decode()]=metadata.decode().split()[2]
blobs=read_blobs([base[n] for n in names if n in base])
files=[]
with zipfile.ZipFile(HERE/'product-source-snapshot.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        working=(ROOT/name).read_bytes()
        canonical=git('hash-object','--path',name,'--stdin',input=working).decode().strip()
        archive.writestr('runtime/'+name,working)
        original=blobs[base[name]] if name in base else None
        if original is not None:archive.writestr('git/'+name,original)
        files.append({'path':name,'sourceCommit':head if original is not None else None,'sourceBlob':base.get(name),
          'sourceGitSha256':digest(original) if original is not None else None,'runtimeSha256':digest(working),
          'runtimeSize':len(working),'expectedCandidateBlob':canonical,'members':{'runtime':'runtime/'+name,'sourceGit':'git/'+name if original is not None else None}})
write('product-source-manifest.json',{'sourceCommit':head,'mainRefObserved':'ef4cb5e1458d911d98433c443dba46e6c224caa0',
 'approvedPlanCommit':'499ccc1419ba2fbd15171f6ff7c0adc78647c2cc','files':files,
 'archive':'product-source-snapshot.zip','archiveSha256':digest((HERE/'product-source-snapshot.zip').read_bytes()),
 'gitVsRuntime':'Git原blob与Windows运行bytes分别完整读取并SHA256。expectedCandidateBlob由真实git hash-object --path过滤计算，不把Windows换行冒Git对象，不猜截断内容。提交后另逐blob校验。',
 'runtimeCoverage':'各命令JSON的before/after是当时实读指纹；本快照是最终源码完整原字节。源码在长命令期间变动的回执明确列差异，不能用这个快照倒称所有旧测试执行了新文件。'})
print(json.dumps({'sourceCommit':head,'files':len(files),'archiveSha256':digest((HERE/'product-source-snapshot.zip').read_bytes()),'exit':0}))
