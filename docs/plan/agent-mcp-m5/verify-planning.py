"""复核规划源原byte、归档、合同映射、文本及链接；不运行产品。"""
from pathlib import Path
import hashlib,json,re,subprocess,zipfile
import yaml

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def load(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
manifest=load('source-manifest.json')
assert git('rev-parse','HEAD').decode().strip()==manifest['main'], '静态规划首检要求起始HEAD精确main；提交后的blob核验用独立回执'
archive=OUT/manifest['archive']['path']
assert fp(archive.read_bytes())['sha256']==manifest['archive']['sha256']
with zipfile.ZipFile(archive) as z:
 assert len(z.namelist())==manifest['archive']['members']
 for entry in manifest['entries']:
  for source in ('git','worktree'):
   body=z.read(entry[source]['member'])
   assert fp(body)=={k:entry[source][k] for k in ('bytes','sha256')}, (entry['path'],source)
  body=z.read(entry['git']['member'])
  assert hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()==entry['blobId']
  assert body==git('show',entry['commit']+':'+entry['path'])
  assert fp((ROOT/entry['path']).read_bytes())=={k:entry['worktree'][k] for k in ('bytes','sha256')}
 for commit in manifest['commits']:
  body=z.read(commit['raw']['member']);assert body==git('cat-file','commit',commit['commit'])
 section=z.read(manifest['frozenSection']['member'])
 assert section==(OUT/'frozen-m5.md').read_bytes()
 parent=git('show',manifest['frozen']+':docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md')
 assert section==b''.join(parent.splitlines(keepends=True)[176:201])
schema=yaml.safe_load(git('show',manifest['main']+':OPENAPI.yaml'))
ops=load('current-openapi-operations.json');derived=load('current-discovery.json')
actual={operation['operationId']:(method.upper(),path) for path,methods in schema['paths'].items()
 for method,operation in methods.items() if isinstance(operation,dict) and 'operationId' in operation}
assert set(actual)==set(ops)
for op,value in ops.items():assert actual[op]==(value['method'],value['path'])
assert set(r['operationId'] for r in derived['rules'])==set(ops)
selected=load('operation-selection.json');assert len({x['operationId'] for x in selected})==len(selected)
for entry in selected:
 assert entry['status']=='未运行' and actual[entry['operationId']]==(entry['method'],entry['path'])
 assert set(entry['bindingIds'])=={b['bindingId'] for b in derived['bindings'] if entry['operationId'] in b['operationIds']}
tool=load('input/platform-observations.json')['todo']
raw_spec,raw_plan=tool.split('\nSpec:\n',1)[1].split('\nSaved plan:\n',1)
assert raw_spec.strip()==(OUT/'spec.md').read_text(encoding='utf-8').strip()
assert raw_plan==(OUT/'input/platform-savedplan.md').read_text(encoding='utf-8').removesuffix('\n')
current=(OUT/'savedplan.md').read_text(encoding='utf-8')
assert '本轮实际完成并提交' in current and '独立文档原件未取得单列' in current and '禁止本轮新安装' in current
assert '本次执行只交规划工件' not in current
env=load('environment.json');native=load('client-runtime.json')
assert env['opencode']['connected'] is False and native['connected'] is False and native['actualModelRun'] is False
assert all(p['nativeExit']==0 for p in env['probes']) and native['nativeExit']==0
assert '专业工作站版' in env['os']['Caption']
assert all(not x['contentsRead'] for x in env['configs']) and not env['secretValuesReadOrPersisted']
with zipfile.ZipFile(OUT/env['archive']['path']) as z:
 for page in env['officialSources']:
  assert fp(z.read(page['member']))=={k:page[k] for k in ('bytes','sha256')}
 for probe in env['probes']:
  for channel in ('stdout','stderr'):
   assert fp(z.read(probe['name']+'/'+channel))==probe[channel]
frozen=(OUT/'frozen-m5.md').read_text(encoding='utf8')
categories=['正常','越权/撤权','非法状态','幂等','旧revision','事务失败','重放','并发','重启/恢复/Stop']
assert all('| '+c+' |' in frozen for c in categories)
cases=(OUT/'acceptance-matrix.md').read_text(encoding='utf8')
assert all('F'+str(i) in cases for i in range(1,10))
journeys=(OUT/'journeys.md').read_text(encoding='utf8')
assert all(x in journeys for x in ('O-N','P-N','O-G','P-G','N1','N7','G1','G7'))
links=0;files=[]
for path in sorted(OUT.rglob('*')):
 if not path.is_file() or path.suffix=='.zip' or '__pycache__' in path.parts or path.name=='planning-static-verification.json': continue
 body=path.read_bytes();text=body.decode('utf-8');assert not text.startswith('\ufeff'), str(path)
 assert body.endswith(b'\n') and not body.endswith(b'\n\n'), str(path)
 assert all(line==line.rstrip(' \t') for line in text.splitlines()), str(path)
 if path.suffix=='.md':
  for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)',text):
   if re.match(r'(https?://|todo:|doc:)',target):continue
   relative=target.split('#',1)[0];assert (path.parent/relative).exists(),(path,target);links+=1
 files.append({'path':path.relative_to(ROOT).as_posix(),**fp(body)})
result={'productTestsRun':False,'main':manifest['main'],'sourceEntries':len(manifest['entries']),
        'sourceArchiveMembers':manifest['archive']['members'],'allSourceBytesVerified':True,
        'frozenRows':manifest['frozenSection'],'openapiOperations':len(ops),'discoveryRules':len(derived['rules']),
        'discoveryBindings':len(derived['bindings']),'selectedOperations':len(selected),'allSelectedUnrun':True,
        'originalSavedPlanEqualsFullTodosReadback':True,'independentPlanDocOriginalObtained':False,
        'acceptanceCategories':9,'actualClientJourneysPlanned':4,'localLinks':links,'verifiedTextFiles':len(files),
        'files':files,'nativeExit':0}
(OUT/'planning-static-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('files','frozenRows')},ensure_ascii=False))
