"""仅捕获完整规划来源和安全环境元数据；不运行产品、不安装、不读取凭据正文。"""
from pathlib import Path
import datetime, hashlib, json, os, platform, re, subprocess, urllib.request, zipfile
import yaml

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = '87f88b89297c5c1e346f7ef99118c410f4b4a905'
FROZEN = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'

def fp(data):
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def git(*args, data=None):
    return subprocess.check_output(['git', *args], cwd=ROOT, input=data)

def write(name, value):
    target = OUT / name
    assert target.resolve().is_relative_to(OUT.resolve())
    target.parent.mkdir(parents=True, exist_ok=True)
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2)
    target.write_text(text.rstrip() + '\n', encoding='utf-8', newline='\n')

def zip_bytes(name, members):
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for member, data in sorted(members.items()):
            info = zipfile.ZipInfo(member, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    return {'path': name, **fp(target.read_bytes()), 'members': len(members)}

def tree(commit):
    result = {}
    for row in git('ls-tree', '-rz', commit).split(b'\0'):
        if row:
            meta, path = row.split(b'\t', 1)
            mode, kind, oid = meta.decode().split()
            if kind == 'blob': result[path.decode()] = oid
    return result

def source_capture():
    trees = {commit: tree(commit) for commit in (MAIN, FROZEN)}
    frozen = ['docs/plan/backend-agent-mcp-priority/' + n + '.md' for n in
              ('README', 'coverage-matrix', 'operation-index', 'branch-separation', 'batches-and-acceptance', 'sources', 'review')]
    exact = {'AGENTS.md','CONTEXT.md','AGENT_PROTOCOL.md','OPENAPI.yaml','SCHEMA.sql',
             'package.json','pnpm-lock.yaml','turbo.json','vitest.config.ts','.gitattributes',
             '.github/workflows/ci.yml','docker-compose.yml','docker-compose.lite.yml',
             'docs/agent-runner.md','docs/agent-integration.md','docs/agent-tool-permissions.md',
             'docs/AGENT_COLLABORATION_CLIENT_PROFILE.md','docs/route-policy-matrix.md',
             'apps/api/src/server.ts','apps/api/src/commands.ts','apps/api/src/agent-connections.ts','apps/api/src/work-item-executors.ts',
             'apps/api/src/live-read-authorization.ts','apps/api/src/collaboration/routes.ts',
             'apps/api/src/workbench/routes.ts','apps/api/src/workbench/commands.ts',
             'apps/worker/src/outbox.ts','apps/worker/src/agent-webhook.ts','apps/worker/src/provider-actions.ts',
             'apps/worker/src/artifact-uploads.ts','apps/worker/src/index.ts',
             'scripts/ci-policy.mjs','scripts/ci-policy.test.mjs','scripts/validate-ci.mjs',
             'scripts/require-integration-env.mjs','scripts/run-ci-source.mjs',
             'scripts/verify-raw-evidence-archive.mjs','scripts/ci-bootstrap/package.json','scripts/ci-bootstrap/package-lock.json'}
    prefixes = ('docs/adr/','packages/contracts/src/','packages/agent-sdk/src/',
                'packages/domain/src/','packages/db/src/','packages/config/src/',
                'packages/git-provider/src/','packages/artifact-storage/src/',
                'packages/conformance/src/','apps/mcp/src/','apps/agent-runner/src/',
                'apps/agent-runner/skills/','apps/api/src/agent/','apps/api/src/authz/',
                'apps/api/src/delivery/','apps/api/src/workbench/','packages/db/migrations/v1/')
    reports = {'README.md','security-contract.md','compatibility.md','scope-compatibility.md',
               'lifecycle.md','wait-contract.md','operation-decisions.json','product-discovery-decisions.json',
               'product-operation-results.md','product-operation-results.json','product-operation-matrix.md',
               'product-acceptance-matrix.md','product-recovery-matrix.md','product-report.md',
               'review-fixes-report.md','product-pr-ci-report.md','product-ci418-report.md',
               'product-review-repair-report.md','product-review-repair-commit-binding.json',
               'product-source-manifest.json','product-source-verification.json','product-test-source-bindings.json',
               'product-first-failures.md','product-check-index.json','product-process-observation.json',
               'product-resources.json','product-ci418-archive-index.json','product-ci418-results.json',
               'worker-recovery.md','worker-authority.md','review-replay.md','review-response.md'}
    package_paths = [p for p in trees[MAIN] if p.endswith(('package.json','tsconfig.json','tsconfig.build.json','vitest.integration.config.ts'))
                     and p.startswith(('packages/conformance/','apps/agent-runner/','apps/mcp/'))]
    selected = [(FROZEN,p) for p in frozen] + [(MAIN,p) for p in sorted(trees[MAIN])
        if p in exact or p in package_paths or p.startswith(prefixes)
        or (p.startswith(tuple('docs/plan/agent-mcp-m'+str(n)+'/' for n in range(4)))
            and len(p.split('/')) == 4 and p.split('/')[-1] in reports)]
    members, entries = {}, []
    for commit,path in selected:
        oid = trees[commit][path]
        data = git('cat-file','blob',oid)
        member = 'members/' + fp(data)['sha256']; members[member] = data
        wt = (ROOT/path).read_bytes(); wt_member = 'members/' + fp(wt)['sha256']; members[wt_member] = wt
        entries.append({'commit':commit,'path':path,'blobId':oid,
                        'git':{'member':member,**fp(data)},'worktree':{'member':wt_member,**fp(wt)},
                        'worktreeSource':'本轮当前工作树字节，不代表历史工作树'})
    batches = git('show',FROZEN+':'+frozen[4])
    lines = batches.splitlines(keepends=True)
    section = b''.join(lines[176:201])
    assert section.startswith('## M5：'.encode()) and section.endswith(b'\n')
    assert section.rstrip(b'\r\n') == batches[batches.index('## M5：'.encode()):batches.index('## 范围问题'.encode())].rstrip(b'\r\n')
    members['frozen/m5-section.md'] = section
    (OUT/'frozen-m5.md').write_bytes(section)
    commits = []
    for commit in (FROZEN,MAIN,'d27cb9be3a19befeae431df08276c9ca94d7dbed'):
        data = git('cat-file','commit',commit); member='commits/'+commit; members[member]=data
        content=data.decode().splitlines()
        commits.append({'commit':commit,'tree':next(l[5:] for l in content if l.startswith('tree ')),
                        'parents':[l[7:] for l in content if l.startswith('parent ')], 'raw':{'member':member,**fp(data)}})
    archive=zip_bytes('input/source-snapshot.zip',members)
    write('source-manifest.json',{'main':MAIN,'frozen':FROZEN,'entries':entries,'commits':commits,'archive':archive,
          'frozenSection':{'startLine':177,'endLine':201,'member':'frozen/m5-section.md',**fp(section)},
          'mainEqualsM3CandidateTree':commits[1]['tree']==commits[2]['tree'],
          'worktreeHead':git('rev-parse','HEAD').decode().strip(),
          'headToMainDiff':git('diff','--name-status',MAIN,'HEAD').decode().splitlines(),
          'frozenToMainDiff':git('diff','--name-status',FROZEN,MAIN).decode().splitlines()})
    schema=yaml.safe_load(git('show',MAIN+':OPENAPI.yaml'))
    operations={}
    for path,methods in schema['paths'].items():
        for method,operation in methods.items():
            if isinstance(operation,dict) and 'operationId' in operation:
                operations[operation['operationId']]={'method':method.upper(),'path':path,
                    'actorKinds':operation.get('x-workmesh-actor-kinds',[]),'feature':operation.get('x-workmesh-feature-key'),
                    'input':operation.get('requestBody'),'parameters':operation.get('parameters',[]),'responses':operation.get('responses')}
    write('current-openapi-operations.json',operations)
    rules_source=git('show',MAIN+':packages/contracts/src/agent-discovery-rules.ts').decode()
    rules=[]; bindings=[]; target=rules
    for line in rules_source.splitlines():
        if 'export const agentDiscoveryBindings' in line: target=bindings
        if line.strip().startswith('{'): target.append(json.loads(line.strip().removesuffix(',')))
    write('current-discovery.json',{'rules':rules,'bindings':bindings,'source':MAIN})
    return {'sourceEntries':len(entries),'archiveMembers':len(members),'operations':len(operations),'rules':len(rules),'bindings':len(bindings)}

def inventory():
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    probes=[]; members={}
    def probe(name,argv):
        before=datetime.datetime.now(datetime.timezone.utc)
        p=subprocess.run(argv,cwd=ROOT,capture_output=True,timeout=30)
        after=datetime.datetime.now(datetime.timezone.utc)
        for channel,data in [('stdout',p.stdout),('stderr',p.stderr)]: members[name+'/'+channel]=data
        probes.append({'name':name,'argv':argv,'nativeExit':p.returncode,'startedAt':before.isoformat(),
                       'endedAt':after.isoformat(),'runtimeSeconds':(after-before).total_seconds(),
                       'stdout':fp(p.stdout),'stderr':fp(p.stderr)})
        return p.stdout.decode('utf-8',errors='replace').strip()
    exe=Path(os.environ['USERPROFILE'])/'.bun/bin/opencode.exe'
    oc=probe('opencode-version',[str(exe),'--version'])
    probe('opencode-run-help',[str(exe),'run','--help'])
    probe('opencode-mcp-help',[str(exe),'mcp','--help'])
    node=probe('node-runtime',['node','-p','JSON.stringify({version:process.version,execPath:process.execPath})'])
    pnpm=probe('pnpm-version',['cmd.exe','/d','/c','pnpm.cmd --version'])
    docker=probe('docker-version',['docker','version','--format','{{.Client.Version}} {{.Server.Version}}'])
    containers=probe('docker-observation',['docker','ps','--format','{{.Names}} {{.Image}}'])
    os_info=probe('os',['powershell.exe','-NoProfile','-Command','[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture | ConvertTo-Json -Compress'])
    candidates=[Path(os.environ['USERPROFILE'])/'.config/opencode/service.json',
                Path(os.environ['USERPROFILE'])/'.config/opencode/opencode.json',
                Path(os.environ['USERPROFILE'])/'.config/opencode/opencode.jsonc',
                Path(os.environ['USERPROFILE'])/'.local/share/opencode/auth.json',
                Path(os.environ['APPDATA'])/'opencode/opencode.json',
                Path(os.environ['APPDATA'])/'opencode/auth.json',
                ROOT/'opencode.json',ROOT/'opencode.jsonc',ROOT/'.opencode/opencode.json']
    for ancestor in [ROOT,*ROOT.parents]:
        candidates.extend(ancestor / suffix for suffix in ('opencode.json','opencode.jsonc','.opencode/opencode.json','.opencode/opencode.jsonc'))
    candidates=list(dict.fromkeys(candidates))
    configs=[]
    for path in candidates:
        exists=path.is_file(); row={'path':str(path),'exists':exists,'contentsRead':False}
        if exists:
            stat=path.stat(); row.update({'bytes':stat.st_size,'mtimeNs':stat.st_mtime_ns,
                 'isSymlink':path.is_symlink(),'owner':'现有用户配置；禁止本任务改写'})
        configs.append(row)
    official=[]
    for name in ('mcp-servers','providers','config','permissions'):
        url='https://opencode.ai/v2/docs/'+name
        before=datetime.datetime.now(datetime.timezone.utc)
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'WorkMesh-M5-planning-readonly'}),timeout=30) as response:
            data=response.read(); final=response.url; modified=response.headers.get('Last-Modified')
        member='official/'+name+'.html'; members[member]=data
        official.append({'url':url,'finalUrl':final,'retrievedAt':before.isoformat(),'lastModified':modified,'member':member,**fp(data)})
    archive=zip_bytes('input/environment-originals.zip',members)
    write('environment.json',{'startedAt':started,'os':json.loads(os_info),
          'opencode':{'path':str(exe),'versionOutput':oc,'binary':fp(exe.read_bytes()),
                      'installed':True,'connected':False,'modelToolRoundTrip':'未运行','selectionSource':'本轮发现及生产者实施建议'},
          'node':json.loads(node),'pnpm':pnpm,'docker':docker,'observedContainers':containers.splitlines(),
          'containersOwner':'全部为其他任务或既有服务；本任务未创建、未使用、未清理',
          'projectNodeModulesInstalled':(ROOT/'node_modules').exists(),
          'piPackagePin':json.loads((ROOT/'apps/agent-runner/package.json').read_text())['dependencies']['@earendil-works/pi-coding-agent'],
          'configs':configs,'loginStatus':'未验证；不读取账号凭据正文、不执行auth或新增登录',
          'newExternalAuthorizationRequiredForSelectedLocalModel':False,
          'selectedLocalModelStatus':'待实现独有loopback受控端点；本轮未启动',
          'credentialNamesOnly':[n for n in os.environ if re.search(r'(^WORKMESH|API_KEY|DATABASE|REDIS|S3|MINIMAX)',n)],
          'secretValuesReadOrPersisted':False,'officialSources':official,'probes':probes,'archive':archive})
    return {'opencode':oc,'node':json.loads(node),'probeCount':len(probes),'officialSources':len(official),'clientConnected':False}

if __name__=='__main__':
    print(json.dumps({'sources':source_capture(),'environment':inventory(),'productTestsRun':False},ensure_ascii=False))
