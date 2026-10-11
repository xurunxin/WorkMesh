"""只验证规划数据/来源/链接；不安装依赖或运行产品。"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
MAIN = 'c2b3d363c037157df13beb82799d99d07a9b7db8'
OLD = '4e144f35759525a8a377acc73ba2f2dbfe02ab67'
REVIEW = OUT/'input/discovery-review'
ADR = ROOT/'docs/adr/0086-optional-agent-domain-read-projections.md'
failures = []
counts = {'json':0,'utf8':0,'localLinks':0,'sourceBlobs':0,'reviewSourceBlobs':0,'operationContracts':0,'proposedRules':0,'proposedBindings':0}
start = time.perf_counter()
start_utc = datetime.now(timezone.utc).isoformat()
def check(condition, message):
    if not condition:
        failures.append(message)
def git(*args):
    return subprocess.run(['git',*args],cwd=ROOT,capture_output=True,check=True).stdout
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
files = sorted([p for p in OUT.rglob('*') if p.is_file()] + [ADR])
for path in files:
    try:
        text = path.read_bytes().decode('utf-8')
        counts['utf8'] += 1
        if path.suffix=='.json':
            json.loads(text)
            counts['json'] += 1
        if path.suffix=='.md':
            for match in re.finditer(r'\[[^\]\n]+\]\(([^)]+)\)',text):
                target = match.group(1).split('#',1)[0]
                if not target or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target):
                    continue
                counts['localLinks'] += 1
                check((path.parent/target).resolve().exists(),f'链接缺失：{path.name} -> {target}')
    except (UnicodeDecodeError,json.JSONDecodeError) as error:
        failures.append(f'文件解析失败：{path}: {error}')
manifest = json.loads((OUT/'input/source-manifest.json').read_text(encoding='utf-8'))
check(not manifest['missingPaths'],'来源有缺失路径')
for record in manifest['records']:
    raw = git('cat-file','blob',record['gitBlob'])
    check(len(raw)==record['gitBytes'] and sha(raw)==record['gitSha256'],f'Git全文指纹不符：{record["path"]}')
    if 'worktreeSha256' in record:
        check(sha((ROOT/record['path']).read_bytes())==record['worktreeSha256'],f'工作树来源发生变化：{record["path"]}')
    counts['sourceBlobs'] += 1
check((OUT/'input/frozen-m4.md').read_bytes()==(OUT/'input/current-main-m4.md').read_bytes(),'冻结M4不相等')
check(len((OUT/'input/frozen-m4.md').read_text(encoding='utf-8').splitlines())==25,'M4原文非完整25行')

todo = json.loads((OUT/'input/todo-readback.json').read_text(encoding='utf-8'))
tool_text = '\n'.join(x['text'] for x in todo['content'] if x['type']=='text')
spec = tool_text.split('Spec:\n',1)[1].split('\nSaved plan:',1)[0].strip()
check((OUT/'spec.md').read_text(encoding='utf-8').strip()==spec,'spec未与完整工具Spec逐字相等')
plan = (OUT/'savedplan.md').read_text(encoding='utf-8').strip()
sync = git('show',f'{OLD}:docs/plan/agent-mcp-m4/platform-sync.md').decode('utf-8')
old = re.search(r'^> (- \*\*`docs/plan/agent-mcp-m4/`.*)$',sync,re.M).group(1)
candidate_plan = git('show',f'{OLD}:docs/plan/agent-mcp-m4/savedplan.md').decode('utf-8').strip()
new = next(line for line in candidate_plan.splitlines() if line.startswith('- **`docs/plan/agent-mcp-m4/`'))
old_plan = candidate_plan.replace(new,old)
prefix = tool_text.split('\nSaved plan:',1)[1]
# 元信息行不是正文；保留工具截断标记之外的精确可见正文。
position = prefix.find('## 上下文')
visible = prefix[position:].split('\n…(truncated)',1)[0].strip()
check(position>=0 and old_plan.startswith(visible),'平台Saved plan可见前缀与用户注入旧全文不一致')
check('本轮仅写入并提交规划文件' in plan,'平台计划未纳本轮限定')

current_todo = json.loads((REVIEW/'todo-review-sync.json').read_text(encoding='utf-8'))
current_text = '\n'.join(x['text'] for x in current_todo['content'] if x['type']=='text')
current_spec = current_text.split('Spec:\n',1)[1].split('\nSaved plan:',1)[0].strip()
check(spec==current_spec,'完整Spec发生变化却未同步')
current_prefix = current_text.split('\nSaved plan:',1)[1]
position = current_prefix.find('## 上下文')
current_visible = current_prefix[position:].split('\n…(truncated)',1)[0].strip()
check(position>=0 and plan.startswith(current_visible),'当前平台可见前缀未与新计划逐字同步')
review_manifest = json.loads((REVIEW/'source-manifest.json').read_text(encoding='utf-8'))
for record in review_manifest['records']:
    raw = git('cat-file','blob',record['gitBlob'])
    check(raw==git('show',f'{MAIN}:{record["path"]}'),'新增来源不属于准确main：'+record['path'])
    check(len(raw)==record['gitBytes'] and sha(raw)==record['gitSha256'],'新增Git全文指纹不符：'+record['path'])
    check(sha((ROOT/record['path']).read_bytes())==record['worktreeSha256'],'新增工作树来源变化：'+record['path'])
    counts['reviewSourceBlobs'] += 1
check(git('merge-base','--is-ancestor',OLD,'HEAD')==b'','旧候选不可达')
check(git('diff','--name-only',OLD,'--','apps','packages','scripts','OPENAPI.yaml','SCHEMA.sql')==b'','本轮修改产品源码或产物')
check(git('diff','--name-only',MAIN,'--','apps','packages','scripts','OPENAPI.yaml','SCHEMA.sql')==b'','产品相对main存在新改动')

decisions = json.loads((OUT/'operation-decisions.json').read_text(encoding='utf-8'))
rules = git('show',f'{MAIN}:packages/contracts/src/agent-discovery-rules.ts').decode('utf-8').splitlines()
api = git('show',f'{MAIN}:OPENAPI.yaml').decode('utf-8')
check(len(decisions['selected'])==19,'选定操作数量不符')
check(len({x['operationId'] for x in decisions['selected']})==19,'重复operation')
for entry in decisions['selected']:
    parsed = json.loads(rules[entry['source']['line']-1].strip().removesuffix(','))
    check(parsed==entry['sourceRule'],f'现行逐项权限谓词不符：{entry["operationId"]}')
    check(re.search(r'operationId:\s*'+re.escape(entry['operationId'])+r'\b',api) is not None,f'接口不存在：{entry["operationId"]}')
    check(entry['planned']['actualStatus']=='未实施/未测',f'planned误标actual：{entry["operationId"]}')
    counts['operationContracts'] += 1
check('Proposed' in ADR.read_text(encoding='utf-8'),'ADR未保待审')

parsed_rules = {}
for line in rules:
    row=line.strip().removesuffix(',')
    if row.startswith('{"operationId":'):
        value=json.loads(row)
        parsed_rules[value['operationId']]=value
delta=json.loads((OUT/'product-discovery-decisions.json').read_text(encoding='utf-8'))
baseline=json.loads((REVIEW/'discovery-baseline.json').read_text(encoding='utf-8'))
common_facts={'credentialMode','sessionKind','role','state','liveAuthority','capabilitiesAllPresent','featureEnabled'}
common=[p for p in parsed_rules['listInitiatives']['predicates'] if p['fact'] in common_facts]
targets={
    'getInitiativeRollup':[('initiativeLinkedProjectScope','NOT_FOUND')],
    'getAutomationRun':[('routeResolvedScope','NOT_FOUND'),('automationRunSessionMatches','NOT_FOUND')],
    'getUsageSummary':[(name,'RESOURCE_SCOPE_DENIED') for name in ['usageSessionMatches','usageAgentMatches','usageProjectMatches','usageFiltersMatchCurrentSession']],
    'streamA2ATaskEvents':[('a2aBindingActive','NOT_FOUND'),('a2aTaskSessionMatches','NOT_FOUND')],
}
check({r['operationId'] for r in delta['rules']}==set(targets),'四投影规则集合不符')
for row in delta['rules']:
    op=row['operationId']
    expected={'operationId':op,'predicates':common+[{'fact':fact,'allowed':[True],'reason':reason} for fact,reason in targets[op]],
              'capabilities':['work:read'],'feature':parsed_rules[op]['feature'],'variants':[],'write':False}
    check(row==expected,'完整新谓词或feature不符：'+op)
    entry=next(e for e in decisions['selected'] if e['operationId']==op)
    check(entry['planned']['discovery']['rule']==row,'操作矩阵未同步拟规则：'+op)
    counts['proposedRules']+=1
old_bindings={b['bindingId']:b for b in baseline['allBindings']}
new_ids=[]
check(len(delta['bindings'])==19,'拟binding数量不符')
for row in delta['bindings']:
    binding_id=row['bindingId']
    if binding_id in old_bindings:
        check(row==old_bindings[binding_id],'旧health/completion身份变体发生变化：'+binding_id)
    else:
        new_ids.append(binding_id)
        op=row['operationIds'][0]
        check(op in {e['operationId'] for e in decisions['selected']},'binding不属于选定操作：'+binding_id)
        expected={'bindingId':binding_id,'operationIds':[op],'execution':'api',
                  'mode':['read-write'] if parsed_rules[op]['write'] else ['read-only','read-write'],
                  'coordination':False,'identityBinding':'explicit_identity_variants','targetParameter':None,'variant':None,
                  'identityVariants':[{'variant':'current_session','credentialMode':[credential],'targetParameter':None,'installationBridgeRequired':False}
                                      for credential in ['agent_session','coordination_connection']]}
        check(row==expected,'新binding身份或mode不符：'+binding_id)
    counts['proposedBindings']+=1
check(sorted(new_ids)==sorted(delta['plannedRegistrationAdditions']) and len(new_ids)==16,'新增拟注册集合不符')
check(set(delta['requiredPreservedBindingIds'])==set(old_bindings),'旧bindings保留集合不符')
check(delta['requiredPreservedPolicyMappings']==baseline['policyMappings'],'旧mapping保留合同不符')
check(delta['historicalRegistryInputUnion']==baseline['historicalRegisteredBindingIds'],'历史registry来源不符')
check(delta['registeredBindingIds']==[],'规划冒实际新注册')
check(delta['registrationEvidence']['status']=='未运行' and delta['registrationEvidence']['readOnlyCaptured']==[] and delta['registrationEvidence']['readWriteCaptured']==[],'注册证据冒已测')
check(all(value is False or value==[] for value in delta['activation'].values()),'activation冒已通过')
check(all(value is False for value in delta['postGenerationAcceptance'].values()),'后生成验证冒已通过')
check(delta['productGeneratorRun'] is False,'规划冒产品生成已运行')
expected_prefix='docs/plan/agent-mcp-m4/'
changed = git('diff','--name-only','HEAD').decode().splitlines()+git('ls-files','--others','--exclude-standard').decode().splitlines()
for path in changed:
    check(path.startswith(expected_prefix) or path=='docs/adr/0086-optional-agent-domain-read-projections.md',f'越出规划文件范围：{path}')
data = {'command':'python -B docs/plan/agent-mcp-m4/validate-plan.py','startUtc':start_utc,
        'endUtc':datetime.now(timezone.utc).isoformat(),
        'runtimeSeconds':time.perf_counter()-start,'exitCode':1 if failures else 0,'counts':counts,'failures':failures,
        'productTestsRun':False,'productGeneratorsRun':False,'independentReview':'原High(blocking)保留，待Chief交接正式复审'}
destination=REVIEW/'planning-validation.json'
# 失败原件独立保存，不让后续修复覆盖。
if failures:
    previous=list(REVIEW.glob('planning-validation-failure-*.json'))
    destination=REVIEW/f'planning-validation-failure-{len(previous)+1}.json'
destination.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(data,ensure_ascii=False))
sys.exit(data['exitCode'])
