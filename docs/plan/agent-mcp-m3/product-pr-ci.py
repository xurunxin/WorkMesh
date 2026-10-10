"""仅收集本 PR 的实际 Actions 事实；不重跑、取消或合入。"""
from pathlib import Path
import hashlib,io,json,re,subprocess,sys,time,zipfile

ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).parent
REPO='xurunxin/WorkMesh';PR=215
sys.stdout.reconfigure(encoding='utf-8')
run_id=int(sys.argv[2]);OUT=ROOT/'.tmp/m3-pr-ci'/str(run_id);OUT.mkdir(parents=True,exist_ok=True)
ledger=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def redact(b):
    b=re.sub(rb'\bwm[ips]_[A-Za-z0-9_-]+',b'[REDACTED_WORKMESH_CREDENTIAL]',b)
    b=re.sub(rb'\bgh[oprsu]_[A-Za-z0-9_]+',b'[REDACTED_GITHUB_CREDENTIAL]',b)
    return re.sub(rb'(?i)(X-Amz-(?:Signature|Credential|Security-Token)=)[^&\s"<>]+',rb'\1[REDACTED_SIGNED_VALUE]',b)
def command(args,name):
    started=time.time();p=subprocess.run(args,cwd=ROOT,capture_output=True)
    stdout=redact(p.stdout);stderr=redact(p.stderr)
    (OUT/(name+'.stdout')).write_bytes(stdout);(OUT/(name+'.stderr')).write_bytes(stderr)
    ledger.append({'argv':args,'startedUnix':started,'endedUnix':time.time(),'elapsedSeconds':time.time()-started,
      'exit':p.returncode,'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr),'stdoutBytes':len(stdout),'stderrBytes':len(stderr)})
    with (OUT/'command-history.jsonl').open('a',encoding='utf-8') as history:
        history.write(json.dumps(ledger[-1],ensure_ascii=False)+'\n')
    if p.returncode:raise RuntimeError(name+': '+stderr.decode('utf-8','replace'))
    return p.stdout
def api(path,name):return json.loads(command(['gh','api','repos/'+REPO+'/'+path],name))
def write(path,data):path.write_bytes((json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode())
def sanitize_archive(data):
    target=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as original,zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as sanitized:
        assert original.testzip() is None
        for name in original.namelist():
            b=original.read(name)
            if zipfile.is_zipfile(io.BytesIO(b)):b=sanitize_archive(b)
            else:b=redact(b)
            sanitized.writestr(name,b)
    return target.getvalue()

mode=sys.argv[1]
run=api('actions/runs/'+str(run_id),'run')
job_response=api('actions/runs/'+str(run_id)+'/jobs?per_page=100','jobs')
jobs=job_response['jobs'];assert job_response['total_count']==len(jobs)
write(OUT/'latest-status.json',{'run':run,'jobs':jobs})
if mode=='poll':
    with (OUT/'poll-history.jsonl').open('a',encoding='utf-8') as history:
        history.write(json.dumps({'observedUnix':time.time(),'run':run,'jobs':jobs})+'\n')
    print(json.dumps({'run':run['run_number'],'id':run_id,'head':run['head_sha'],'status':run['status'],'conclusion':run['conclusion'],
      'jobs':[{'name':j['name'],'status':j['status'],'conclusion':j['conclusion']} for j in jobs]}));sys.exit(0)
assert mode=='collect' and run['status']=='completed' and all(j['status']=='completed' for j in jobs)
pr=api('pulls/'+str(PR),'pr')
for job in jobs:
    command(['gh','api','--allow-escape-sequences','repos/'+REPO+'/actions/jobs/'+str(job['id'])+'/logs'],'job-'+str(job['id'])+'-log')
artifact_response=api('actions/runs/'+str(run_id)+'/artifacts?per_page=100','artifacts')
artifacts=artifact_response['artifacts'];assert artifact_response['total_count']==len(artifacts)
archive_rows=[]
for artifact in artifacts:
    raw=command(['gh','api','--allow-escape-sequences','repos/'+REPO+'/actions/artifacts/'+str(artifact['id'])+'/zip'],'artifact-'+str(artifact['id']))
    if artifact.get('digest'):assert artifact['digest']=='sha256:'+sha(raw),artifact['name']
    # The command initially preserves the fetched compressed bytes only in this owned buffer.
    # Replace it with a full member-preserving redacted ZIP before any repository packaging.
    clean=sanitize_archive(raw);path=OUT/('artifact-'+str(artifact['id'])+'.stdout');path.write_bytes(clean)
    archive_rows.append({'id':artifact['id'],'name':artifact['name'],'githubDigest':artifact.get('digest'),
      'githubSize':artifact['size_in_bytes'],'downloadSha256':sha(raw),'redactedSha256':sha(clean),'redactedBytes':len(clean),
      'file':path.name,'redaction':'所有成员保留；WorkMesh/GitHub凭据与签名credential/signature值脱敏，嵌套ZIP同规则。原下载digest与脱敏bytes分列。'})
logs='\n'.join((OUT/('job-'+str(j['id'])+'-log.stdout')).read_text(encoding='utf-8',errors='replace') for j in jobs)
checkout=sorted(set(re.findall(r'(?m)^\S+\s+([a-f0-9]{40})\s*$',logs)))
# Checkout logs, rather than run.head_sha, identify the tested synthetic merge commit.
commits={s:api('git/commits/'+s,'commit-'+s) for s in checkout}
head=run['head_sha'];base=pr['base']['sha']
for s in set([head,base]):
    if s not in commits:commits[s]=api('git/commits/'+s,'commit-'+s)
source=json.loads((HERE/'product-source-manifest.json').read_text(encoding='utf-8'))
tree_bytes=command(['git','ls-tree','-rz',head],'source-tree');tree={}
for row in tree_bytes.split(b'\0'):
    if row:
        meta,p=row.split(b'\t',1);tree[p.decode()]=meta.decode().split()[2]
binding=[]
for r in source['files']:
    actual=tree[r['path']];runtime=sha((ROOT/r['path']).read_bytes())
    binding.append({'path':r['path'],'headBlob':actual,'reviewedExpectedBlob':r['expectedCandidateBlob'],
      'runtimeSha256':runtime,'testedRuntimeSha256':r['runtimeSha256'],'unchanged':actual==r['expectedCandidateBlob'] and runtime==r['runtimeSha256']})
write(OUT/'command-ledger.json',ledger)
summary={'runId':run_id,'runNumber':run['run_number'],'runAttempt':run['run_attempt'],'status':run['status'],'conclusion':run['conclusion'],
 'runUrl':run['html_url'],'head':head,'baseObservedAtCollection':base,'pr':PR,'prUrl':pr['html_url'],
 'commits':{s:{'tree':c['tree']['sha'],'parents':[p['sha'] for p in c['parents']]} for s,c in commits.items()},
 'actualCheckoutCandidatesFromLogs':checkout,'jobs':[{'id':j['id'],'name':j['name'],'status':j['status'],'conclusion':j['conclusion'],
  'startedAt':j['started_at'],'completedAt':j['completed_at'],'steps':j['steps'],'nativeChildExit':None} for j in jobs],
 'artifacts':archive_rows,'sourceBinding':binding,'all1114Unchanged':all(r['unchanged'] for r in binding),
 'all1114HeadBlobsUnchanged':all(r['headBlob']==r['reviewedExpectedBlob'] for r in binding),
 'all1114RuntimeUnchanged':all(r['runtimeSha256']==r['testedRuntimeSha256'] for r in binding),
 'boundary':'真实job/step conclusion不伪native子exit。run head、PR base、日志合成checkout及commit parents/tree分列；没有远端逐文件运行前后实读。未取消/重跑/合入。'}
write(OUT/'summary.json',summary)
package=OUT/('ci'+str(run['run_number'])+'-originals.zip')
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.iterdir()):
        if p.is_file() and p!=package:z.writestr(p.name,p.read_bytes())
write(OUT/'package-index.json',{'archive':package.name,'sha256':sha(package.read_bytes()),'bytes':package.stat().st_size,
 'members':[{'name':n,'sha256':sha(b),'bytes':len(b)} for n,b in ((p.name,p.read_bytes()) for p in sorted(OUT.iterdir()) if p.is_file() and p.name not in [package.name,'package-index.json'])]})
print(json.dumps({'run':run['run_number'],'head':head,'conclusion':run['conclusion'],'jobs':len(jobs),'artifacts':len(artifacts),
 'checkout':checkout,'allSourceUnchanged':summary['all1114Unchanged'],'package':str(package),'sha256':sha(package.read_bytes())}))
