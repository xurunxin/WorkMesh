"""核完整运行源码原件、输出及本轮交付；不把 Git 字节当已运行字节。"""
from pathlib import Path
from io import BytesIO
import hashlib,json,re,subprocess

root=Path(__file__).resolve().parents[4]
out=root/'docs/plan/agent-mcp-m4/execution'
sources={};outputs=0;receipts=0;legacy=[];available={}
for file in sorted((out/'checks').glob('*/receipt.json')):
    value=json.loads(file.read_text(encoding='utf-8'));receipts+=1
    for kind in ['stdout','stderr']:
        raw=(file.parent/(kind+'.txt')).read_bytes()
        assert len(raw)==value[kind]['bytes'] and hashlib.sha256(raw).hexdigest()==value[kind]['sha256'],file
        outputs+=1
    for phase in ['before','after']:
        for row in value[phase]:
            if 'exactBytesSource' not in row:
                legacy.append({'receipt':file.relative_to(out).as_posix(),'phase':phase,**row});continue
            ref=row['exactBytesSource'];key=ref.get('gitBlob') or ref['path']
            expected=(row['bytes'],row['sha256'])
            assert key not in sources or sources[key]==expected,key
            sources[key]=expected
git_objects=sorted(key for key in sources if '/' not in key)
result=subprocess.run(['git','cat-file','--batch'],cwd=root,input=('\n'.join(git_objects)+'\n').encode(),capture_output=True,check=True)
stream=BytesIO(result.stdout)
for key in git_objects:
    header=stream.readline().decode().strip().split()
    assert header[:2]==[key,'blob'],key
    raw=stream.read(int(header[2]));assert stream.read(1)==b'\n'
    assert (len(raw),hashlib.sha256(raw).hexdigest())==sources[key],key
    available[sources[key]]={'gitBlob':key}
for key,expected in sources.items():
    if '/' not in key:continue
    path=(root/key).resolve();assert path.is_relative_to(out/'source-objects'),key
    raw=path.read_bytes();assert (len(raw),hashlib.sha256(raw).hexdigest())==expected,key
    available[expected]={'path':key}
for directory in ['source-objects','evidence-objects']:
    for path in (out/directory).iterdir():
        if path.is_file():
            raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==path.name,path
            if directory=='source-objects':available[(len(raw),path.name)]={'path':path.relative_to(root).as_posix()}
missing=[];located=[]
for row in legacy:
    exact=available.get((row['bytes'],row['sha256']))
    if exact:located.append({**row,'laterLocatedExactBytes':exact})
    else:missing.append(row)
env=json.loads((root/'.tmp/m4-4adc5e39/environment.json').read_text(encoding='utf-8'))
secrets=[value.encode() for key,value in env.items() if len(value)>=16 and any(token in key.upper() for token in ['TOKEN','PASSWORD','SECRET','MASTER_KEY','DATABASE_URL'])]
status=subprocess.run(['git','status','--porcelain=v1','-z','--untracked-files=all'],cwd=root,capture_output=True,check=True).stdout.decode().split('\0')
files=[];secret_findings=[];test_literals=[]
baseline_examples={
    '4f3396b97d67976afb99e5ec6678e97f2190b8f7dc668073165d900a907b4e09':'apps/web/app/lib/mcp-onboarding.test.ts',
    '94b9e7b104fd22b545a747e1f49c7f21826f30ce11fab5ca6eea58fe061cd0b3':'apps/web/app/connect/page.test.tsx',
}
for entry in status:
    if not entry:continue
    name=entry[3:];path=root/name
    if not path.is_file():continue
    if name.startswith('ci-logs/'):
        original=subprocess.run(['git','show',f'HEAD:{name}'],cwd=root,capture_output=True,check=True).stdout
        assert path.read_bytes()==original,'历史同名运行输出必须保全后恢复'
        continue
    raw=path.read_bytes()
    if any(secret in raw for secret in secrets):secret_findings.append(name)
    if re.search(rb'wm[ips]_[A-Za-z0-9_-]{24,}',raw):
        example=baseline_examples.get(path.name) if '/source-objects/' in name else None
        if example:
            original=subprocess.run(['git','show',f'c2b3d363c037157df13beb82799d99d07a9b7db8:{example}'],cwd=root,capture_output=True,check=True).stdout
            # 仅按完整基线测试源码确认字面示例；运行字节原件不作规范化。
            assert raw.replace(b'\r\n',b'\n')==original,example
            test_literals.append({'path':name,'baselineTest':example,'rawSha256':hashlib.sha256(raw).hexdigest(),'baselineGitBlob':hashlib.sha1(b'blob '+str(len(original)).encode()+b'\0'+original).hexdigest(),'classification':'原基线凭据检测测试的字面示例；非环境或运行凭据，保留完整源码原件'})
        else:secret_findings.append(name)
    if name.startswith('docs/plan/agent-mcp-m4/execution/') and name.endswith(('delivery-current.json','delivery-check-current.json','staged-byte-preservation.json')):continue
    files.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'workingTreeBlob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()})
assert not secret_findings,{'secretPathsOnly':secret_findings}
report={'headBeforePlatformCommit':subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,check=True).stdout.decode().strip(),'files':files,'excludedSelfManifestPaths':['docs/plan/agent-mcp-m4/execution/delivery-current.json','docs/plan/agent-mcp-m4/execution/delivery-check-current.json','docs/plan/agent-mcp-m4/execution/staged-byte-preservation.json'],'selfReferencePolicy':'清单不含自身及依赖清单/暂存状态的最终核验结果，避免循环hash；准确新 head 由平台提交回执绑定。Git 会按属性规范化其他产品文件，workingTreeBlob 与提交 blob 分列，不声称相同。'}
(out/'delivery-current.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
checks={'completeReceipts':receipts,'verifiedRawOutputs':outputs,'uniqueRuntimeSourceObjects':len(sources),'gitBlobsVerifiedFull':len(git_objects),'casObjectsVerifiedFull':len(sources)-len(git_objects),'legacyWithoutOriginalByteRef':len(legacy),'laterLocatedByExactRecordedHash':len(located),'missingLegacyExactBytes':missing,'legacyByteReferenceLimitation':'早期回执没有 exactBytesSource；按原长度/hash 逐字节定位后续真正保全对象，不称原命令当时已归档，不从 Git 规范化字节猜原运行字节；未定位原件完整列出。','privateSecretFindings':0,'deliveryFiles':len(files),'fullReferencedBytesRead':True,'partialInterruptedCommands':'无 receipt 的 interruption 保持缺失，不算完成命令。'}
checks['baselineTestCredentialLiterals']=test_literals
(out/'delivery-check-current.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({key:value for key,value in checks.items() if key!='missingLegacyExactBytes'}|{'missingLegacyExactByteRecords':len(missing)}))
