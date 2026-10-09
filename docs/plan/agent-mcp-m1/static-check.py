"""只验证受控文档、不可变来源和暂存/提交字节；不测试产品。"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import zipfile
from pathlib import Path
import yaml

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
PREFIX = OUT.relative_to(ROOT).as_posix() + '/'
ADR = 'docs/adr/0080-exact-session-execution-result-confirmation.md'
WAIT_ADR = 'docs/adr/0081-pi-execution-wait-continuation.md'
REPORT = PREFIX + 'static-checks.json'
started = time.monotonic()
parser = argparse.ArgumentParser()
parser.add_argument('--prepare-bindings', action='store_true')
parser.add_argument('--staged', action='store_true')
parser.add_argument('--record', action='store_true')
parser.add_argument('--commit')
args = parser.parse_args()
checks = []

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=ROOT)

def load(name):
    return json.loads((OUT/name).read_text(encoding='utf-8'))

def write(name, value):
    (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')

def check(name, condition, detail=None):
    checks.append(dict(name=name, passed=bool(condition), detail=detail))
    if not condition:
        raise AssertionError(name)

def fingerprint(name):
    data = (OUT/name).read_bytes()
    return dict(path=name, bytes=len(data), sha256=digest(data))

def resolve(value, api):
    if isinstance(value, dict):
        if '$ref' in value:
            node = api
            for part in value['$ref'][2:].split('/'):
                node = node[part]
            return dict(sourceRef=value['$ref'], definition=resolve(node, api))
        return {key: resolve(item, api) for key, item in value.items()}
    if isinstance(value, list):
        return [resolve(item, api) for item in value]
    return value

try:
    manifest = load('source-manifest.json')
    main = manifest['main']
    observation = load('platform-observation-current.json')
    saved = (OUT/'savedplan.md').read_bytes()
    visible = observation['visiblePlanPrefix'].encode('utf-8')
    if args.prepare_bindings:
        write('plan-fulltext-binding.json', dict(
            authoritativeSource='本轮用户消息注入的完整当前平台saved copy，不是工具截断读回',
            normalization='plan去掉包裹标签；可读spec/frozen节仅移除段落分隔末尾空行；UTF-8/LF/末尾一个LF；不改正文；原始返回/完整Git字节另存',
            planDocId=observation['planDocId'], version=None, planCreatedAt=None,
            completePlanReadback=False,
            files=[fingerprint(name) for name in ['savedplan.md','implementation.md','current-spec.md','spec.md','steering.md']],
            visiblePrefix=dict(bytes=len(visible),sha256=digest(visible),matchesInjectedFulltext=saved.startswith(visible)),
            truncatedObservation=fingerprint('platform-observation-current.json')))
    check('plan字节一致', saved == (OUT/'implementation.md').read_bytes())
    check('spec字节一致', (OUT/'spec.md').read_bytes() == (OUT/'current-spec.md').read_bytes())
    check('平台前缀非全文', saved.startswith(visible) and len(saved)>len(visible) and observation['version'] is None and observation['planCreatedAt'] is None and observation['completePlanReadback'] is False)
    spec = observation['returned']['content'][0]['text'].split('\nSpec:\n',1)[1].split('\n\nSaved plan:\n',1)[0]
    check('完整Spec来源一致', (spec.rstrip()+'\n').encode() == (OUT/'current-spec.md').read_bytes())
    binding = load('plan-fulltext-binding.json')
    check('全文绑定准确', all(fingerprint(item['path'])==item for item in binding['files']) and binding['truncatedObservation']==fingerprint('platform-observation-current.json'))
    remote = load('main-observation-current.json')
    check('真正main观察', remote['args']['args']==['ls-remote','origin','refs/heads/main'] and remote['returned']['content'][0]['text'].strip().endswith(main+'\trefs/heads/main'))
    history = load('history/candidate-69-manifest.json')
    historical_zip = OUT/'history'/history['archive']['path']
    check('历史ZIP原字节', historical_zip.stat().st_size==history['archive']['bytes'] and digest(historical_zip.read_bytes())==history['archive']['sha256'])
    with zipfile.ZipFile(historical_zip) as old:
        check('历史ZIP完整成员', len(old.namelist())==len(history['entries'])*2 and len(set(old.namelist()))==len(old.namelist()))
        for item in history['entries']:
            original = git('show',history['head']+':'+item['path'])
            check('历史Git:'+item['path'], old.read(item['git']['member'])==original and git('rev-parse',history['head']+':'+item['path']).decode().strip()==item['gitBlobOid'])
            for kind in ['git','worktree']:
                record=item[kind]; raw=old.read(record['member'])
                check('历史独立指纹:'+kind+':'+item['path'], len(raw)==record['bytes'] and digest(raw)==record['sha256'])
        for name in ['static-first-failure.json','static-link-failure.json','platform-observation.json']:
            check('旧首败/返回不改:'+name, (OUT/name).read_bytes()==old.read('worktree/'+PREFIX+name))
    for sha, item in manifest['commits'].items():
        raw = git('cat-file','commit',sha)
        lines = raw.decode().splitlines()
        check('commit对象:'+sha, digest(raw)==item['commitObjectSha256'] and next(line[5:] for line in lines if line.startswith('tree '))==item['tree'] and [line[7:] for line in lines if line.startswith('parent ')]==item['parents'])
    check('M0双父及同tree', manifest['commits'][main]['parents']==['69085317c88d84b702af727dc0ac7152589626d8','883d279d3b5978680672a6c1d7364d421d0afd10'] and manifest['commits'][main]['tree']==manifest['commits']['883d279d3b5978680672a6c1d7364d421d0afd10']['tree'])
    archive = (OUT/'source-snapshot.zip').read_bytes()
    check('ZIP自身hash', len(archive)==manifest['archive']['bytes'] and digest(archive)==manifest['archive']['sha256'])
    with zipfile.ZipFile(OUT/'source-snapshot.zip') as source_zip:
        check('成员完整且唯一', len(manifest['entries'])==217 and len(source_zip.namelist())==217 and set(source_zip.namelist())=={item['member'] for item in manifest['entries']})
        sources = {}
        for item in manifest['entries']:
            data = source_zip.read(item['member'])
            original = git('show',item['head']+':'+item['path'])
            check('全文:'+item['member'], data==original and len(data)==item['bytes'] and digest(data)==item['sha256'] and git('rev-parse',item['head']+':'+item['path']).decode().strip()==item['gitBlobOid'])
            if item['head']==main:
                sources[item['path']] = data
                if 'workingTree' in item:
                    working = (ROOT/item['path']).read_bytes()
                    check('产品原字节未改:'+item['path'], digest(working)==item['workingTree']['sha256'] and len(working)==item['workingTree']['bytes'])
        frozen_source = source_zip.read(manifest['frozen']+'/docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md').decode()
        raw_frozen = frozen_source[frozen_source.index('## M1：'):frozen_source.index('## M2：')].encode()
        frozen = raw_frozen.rstrip()+b'\n'
        check('冻结M1原节字节', len(raw_frozen)==manifest['originalM1']['extractedOriginalBytes'] and digest(raw_frozen)==manifest['originalM1']['extractedOriginalSha256'])
        check('冻结M1精确全文', frozen==(OUT/'frozen-M1.md').read_bytes() and digest(frozen)==manifest['originalM1']['sha256'])
    api = yaml.safe_load(sources['OPENAPI.yaml'].decode())
    operations = load('operation-decisions.json')['operations']
    check('当前42及新增1唯一', len(operations)==43 and len({item['operationId'] for item in operations})==43)
    nine = {'normal','authority','state','idempotency','revision','transaction','replay','concurrency','restart'}
    for item in operations:
        check('九类适用性:'+item['operationId'], set(item['nineClassApplicability'])==nine and all(item['nineClassApplicability'].values()))
        for evidence in item['mainEvidence']:
            check('准确源码锚点:'+item['operationId']+':'+evidence['path'], evidence['head']==main and evidence['anchor'] in sources[evidence['path']].decode().splitlines()[evidence['line']-1] and git('rev-parse',main+':'+evidence['path']).decode().strip()==evidence['gitBlobOid'])
        if item['currentContract'] is not None:
            current = api['paths'][item['rest']['path']][item['rest']['method'].lower()]
            check('当前operationId:'+item['operationId'], current['operationId']==item['operationId'])
            check('全参数响应:'+item['operationId'], item['currentContract'].get('parameters',[])==resolve(current.get('parameters',[]),api) and item['currentContract']['responses']==resolve(current.get('responses',{}),api))
        else:
            check('新增合同未冒已有', item['operationId']=='getAgentSessionExecutionResult' and item['rest']['path'] not in api['paths'])
    required = {'listAgentSessions','getAgentSession','getAgentSessionContext','getAgentPlan','listAgentPlanVersions','listApprovals','getApproval','listLeases','heartbeatLease','renewLease','releaseLease','listRecoveryItems','getRecoveryItem','acknowledgeAgentSessionStop','getAgentSessionExecutionResult'}
    check('完整M1操作范围', required <= {item['operationId'] for item in operations})
    check('Proposed ADR未冒验收', 'Proposed。' in (ROOT/ADR).read_text(encoding='utf-8'))
    check('等待Proposed ADR未冒验收', 'Proposed。' in (ROOT/WAIT_ADR).read_text(encoding='utf-8'))
    security=(OUT/'security-contract.md').read_text(encoding='utf-8')
    migration=(OUT/'migration-contract.md').read_text(encoding='utf-8')
    lifecycle=(OUT/'lifecycle.md').read_text(encoding='utf-8')
    wait=(OUT/'wait-contract.md').read_text(encoding='utf-8')
    ddl=(OUT/'schema-proposal.sql').read_text(encoding='utf-8')
    verification=(OUT/'verification.md').read_text(encoding='utf-8')
    check('不再任意Token证明或零迁移', '归属只取原 complete/stopAck' in security and '归属通过目标历史' not in security and '无迁移' not in security and '原 Token 被 refresh 删除不影响' in security)
    check('来源在原事务与Pi内层分离', all(word in migration for word in ['actor.credentialHash','locateAgentSessionAuthority','lockExecutionInstallationAuthorities','unproven','finishSessionInTransaction','过期','全回滚']))
    check('SQL仅提案且结构具体', all(word in ddl for word in ['execution_source_shape','IS TRUE','execution_waits_enabled','workbench_wait_one_pending_session','source_attempt_id','trigger_prompt_id','continuation_turn_id']) and 'DELETE CASCADE' not in ddl)
    check('等待完整状态/失败合同', all(word in lifecycle for word in ['WAIT_REQUESTED','externalEffectsReconciled','RUNNER_ABORTED','paused','pending','claim','credential','start','stopAck','三十秒']) and all(word in wait for word in ['executionWaits','execution_waits_enabled','Human','promptId','pending','互斥']))
    check('两个block真实正拒/恢复用例映射', all(word in verification for word in ['M1-ORIGIN-DOUBLE-C','M1-ORIGIN-DOUBLE-NATIVE','M1-WAIT-APPROVAL','M1-WAIT-INPUT','M1-WAIT-BLOCKED','M1-WAIT-CONTROL','M1-WAIT-RACE','M1-WAIT-RESTART','未运行']))
    files = sorted([path for path in OUT.rglob('*') if path.is_file()]+[ROOT/ADR,ROOT/WAIT_ADR])
    missing_links = []
    for path in files:
        if path.suffix=='.md':
            text = path.read_text(encoding='utf-8')
            for target in re.findall(r'\]\(([^)]+)\)',text):
                if ':' in target or target.startswith('#'):
                    continue
                target = target.split('#',1)[0]
                if target and not (path.parent/target).is_file():
                    missing_links.append([path.name,target])
        if path.suffix in {'.md','.json','.py','.sql'}:
            text = path.read_text(encoding='utf-8')
            check('空白:'+path.name, not any(line.endswith((' ','\t')) for line in text.splitlines()))
    check('相对文档链接', not missing_links, missing_links)
    tracked = git('diff','--name-only',main).decode().splitlines()
    untracked = git('ls-files','--others','--exclude-standard').decode().splitlines()
    changed = sorted(set(tracked+untracked))
    check('仅文档边界', bool(changed) and all(path.startswith(PREFIX) or path in {ADR,WAIT_ADR} for path in changed), changed)
    node_script = "import {classifyChanges,readWorkspaces} from './scripts/ci-policy.mjs';console.log(JSON.stringify({runtime:process.version,execPath:process.execPath,selection:classifyChanges(JSON.parse(process.argv[1]),readWorkspaces())}));"
    node = json.loads(subprocess.check_output(['node','--input-type=module','-e',node_script,json.dumps(changed)],cwd=ROOT))
    check('CI实际full且全部必需', node['selection']['mode']=='full' and all(node['selection']['checks'].values()), node)
    check('非服务静态环境', not any(name.endswith('.log') for name in changed))
    tested = []
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        if relative==REPORT:
            continue  # 自身回执不参与自引用hash；其余全部逐文件绑定。
        data = path.read_bytes()
        row = dict(path=relative,workingTreeBytes=len(data),workingTreeSha256=digest(data))
        if args.staged or args.commit:
            ref = args.commit+':'+relative if args.commit else ':'+relative
            staged = git('show',ref)
            check('受测与Git字节:'+relative, data==staged or data.replace(b'\r\n',b'\n')==staged)
            row.update(gitBlobOid=git('rev-parse',ref).decode().strip(),gitBlobBytes=len(staged),gitBlobSha256=digest(staged),relation='identical' if data==staged else 'CRLF')
        tested.append(row)
    if args.staged:
        git('diff','--cached','--check')
        check('暂存diff空白', True)
    if args.commit:
        git('diff','--check',main,args.commit)
        receipt = load('static-checks.json')
        check('提交与静态回执受测文件一致', tested==receipt['testedFiles'])
        check('静态回执blob一致', git('show',args.commit+':'+REPORT)==(OUT/'static-checks.json').read_bytes())
    result = dict(status='passed',kind='真实静态文档核验；无产品运行',command=['python',PREFIX+'static-check.py',*sys.argv[1:]],exitCode=0,runtimeSeconds=round(time.monotonic()-started,3),python=sys.version,pythonExecPath=sys.executable,yaml=yaml.__version__,sourceMain=main,sourceMembers=217,existingOperations=42,proposedOperations=1,checkCount=len(checks),failed=0,skipped=0,productTests='未运行',requiredCI='未运行/未查询本PR',platformIndependentReview='两项blocking待平台另一Agent复审；本轮无内部独审',chiefConfirm='未收到',ciClassification=node,checks=checks,testedFiles=tested,reportSelfHash='不参与；提交后单独核回执blob一致',resources=dict(containers=[],images=[],volumes=[],networks=[],services=[],backgroundProcesses=[],retainedPaths=[PREFIX,ADR,WAIT_ADR],cleanupActions=[]))
    if args.record:
        write('static-checks.json',result)
    print(json.dumps({key:result[key] for key in ['status','exitCode','runtimeSeconds','checkCount','sourceMembers','existingOperations','proposedOperations','productTests']},ensure_ascii=False))
except Exception as error:
    failure=dict(status='failed',exitCode=1,runtimeSeconds=round(time.monotonic()-started,3),command=['python',PREFIX+'static-check.py',*sys.argv[1:]],error=str(error),checks=checks)
    name='static-failure-current.json'
    number=1
    while (OUT/name).exists():
        number+=1
        name=f'static-failure-current-{number}.json'
    write(name,failure)
    print(json.dumps(dict(status='failed',exitCode=1,error=str(error),fullReceipt=name),ensure_ascii=False))
    sys.exit(1)
