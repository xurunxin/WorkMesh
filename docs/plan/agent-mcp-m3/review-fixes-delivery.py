"""提交后核全部受测源码与归档原字节；只登记回执，不改变受测产品代码。"""
from pathlib import Path
import hashlib,json,subprocess,sys,zipfile
HERE=Path(__file__).parent;ROOT=HERE.resolve().parents[2]
MAIN='ef4cb5e1458d911d98433c443dba46e6c224caa0'
sys.stdout.reconfigure(encoding='utf-8')
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def sha(data):return hashlib.sha256(data).hexdigest()
head=git('rev-parse','HEAD').decode().strip()
tree={}
for row in git('ls-tree','-rz',head).split(b'\0'):
    if row:
        meta,path=row.split(b'\t',1);tree[path.decode()]=meta.decode().split()[2]
source=json.loads((HERE/'product-source-verification.json').read_text(encoding='utf-8'))
assert source['candidateHead']==head and source['exit']==0
archives=[]
process=subprocess.Popen(['git','cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for path in sorted(HERE.rglob('*.zip')):
    name=path.relative_to(ROOT).as_posix();blob=tree[name]
    process.stdin.write((blob+'\n').encode());process.stdin.flush()
    header=process.stdout.readline().decode().split();assert header[1]=='blob'
    data=process.stdout.read(int(header[2]));assert len(data)==int(header[2]) and process.stdout.read(1)==b'\n'
    runtime=path.read_bytes();assert data==runtime
    with zipfile.ZipFile(path) as z:assert z.testzip() is None
    archives.append({'path':name,'candidateBlob':blob,'bytes':len(data),'gitSha256':sha(data),'runtimeSha256':sha(runtime),'matches':True})
process.stdin.close();assert process.wait()==0
white=subprocess.run(['git','diff','--check',MAIN,head],cwd=ROOT,capture_output=True)
assert white.returncode==0,white.stdout.decode('utf-8','replace')
value={'productCodeHead':head,'mainObserved':MAIN,'sourceFileCount':source['fileCount'],'archiveCount':len(archives),'archives':archives,
 'whitespace':{'argv':['git','diff','--check',MAIN,head],'exit':white.returncode,'stdout':white.stdout.decode(),'stderr':white.stderr.decode()},
 'exit':0,'boundary':'产品源码/合同/依赖及所有ZIP逐当前Git blob与Windows bytes核验；后继报告元数据不改受测源码，不冒PR CI/复审/合入。上一候选完整原件见review-fixes-history.zip。'}
(HERE/'product-delivery-receipt.json').write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps({'head':head,'sourceFiles':source['fileCount'],'archiveCount':len(archives),'exit':0}))
