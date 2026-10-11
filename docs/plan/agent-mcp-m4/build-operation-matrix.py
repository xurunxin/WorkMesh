"""从精确主线规则逐行解析本批矩阵；planned 不转换为 actual。"""
from pathlib import Path
import json
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
MAIN = 'c2b3d363c037157df13beb82799d99d07a9b7db8'
rule_path = 'packages/contracts/src/agent-discovery-rules.ts'
raw = subprocess.run(['git', 'show', f'{MAIN}:{rule_path}'], cwd=ROOT,
                     check=True, capture_output=True).stdout.decode('utf-8')
rules = {}
for number, line in enumerate(raw.splitlines(), 1):
    stripped = line.strip().removesuffix(',')
    if stripped.startswith('{"operationId":'):
        entry = json.loads(stripped)
        rules[entry['operationId']] = (number, entry)

# 每个 scope/正负例均是已选现行合同的执行判定；权限全文来自 sourceRule。
choices = [
 ('listCycles','Planning','list_cycles','listCycles','当前Team/null集合；签名分页','当前Team current/upcoming/history分页','跨Team、撤grant、关闭Planning'),
 ('listInitiatives','Planning','list_initiatives','listInitiatives','准确Session或WorkItem项目关联；Team-only C不自动含项目','两个关联Initiative分页且仅授权项目可见','跨项目、先list撤Delegation'),
 ('getInitiativeRollup','Planning','get_initiative_rollup','getInitiativeRollup','与list相同linked授权项目；200上限/COSTS','非零completed/health/多币种准确排除另一scope','撤grant后拒绝而非零；Human、201可见上限'),
 ('listSavedViews','SavedView','list_saved_views','listSavedViews','内置＋准确owner/当前Team；非Advanced管理','本人private保存过滤和内置页','另一个owner私有项、跨Team、撤权'),
 ('createSavedView','SavedView','create_saved_view','createSavedView','owner固定current actor；原Team和work:write','同key/body只一个saved_view及event/outbox','异体key冲突、他Team、owner注入不能生效'),
 ('listAdvancedViews','Planning','list_advanced_views','listAdvancedViews','owner/workspace/currentTeam；列表不授管理','三种现行可见范围分页','他owner private、关闭Planning'),
 ('evaluateAdvancedView','Planning','get_advanced_view_results','evaluateAdvancedView','额外resultScope及受支持layout/filter；cost需currency','准确workItem/project/Session结果和cursor','越resultScope、非法filter、混币请求'),
 ('listAutomationRules','Automation','list_automation_rules','listAutomationRules','当前Team/null规则读取；管理Human','规则current version/condition/actions完整','跨Team、撤grant、Agent触发/改版拒绝'),
 ('listAutomationRuns','Automation','list_automation_runs','listAutomationRuns','run.session_id==当前Session；rule/loop过滤','本人run分页/source/trace','另Session、session_id=null、跨Team'),
 ('getAutomationRun','Automation','get_automation_run','getAutomationRun','准确当前Session run/effects；nullTeam不豁免','本人真实Loop target E读run及ordered effects','origin E读target、别人nullTeam run、Stop'),
 ('listLoops','AgentLoops','list_loops','listLoops','workspace/owner/currentTeam现行列表；recent_runs仅元数据','可见Loop/pin/预算与最近运行','private owner、跨Team、feature关闭'),
 ('runLoopNow','AgentLoops','run_loop_now','runLoopNow','automation:manage＋work:write；同Team/admission/no-overlap/预算','合法origin admission后target另接单；同occurrence单事实','停用pin/Loop、竞争容量预算、跨Team/撤权'),
 ('recordUsage','Costs','record_usage','recordUsage','本人Session/Agent/准确项目或projectless；仅work:read','已知/unknown usage及独立币种；命令事实完整','冒他Session/Agent/项目、同key异body、extra Activity禁止'),
 ('getUsageSummary','Costs','get_usage_summary','getUsageSummary','准确本人Session/Agent/项目；totals/buckets同快照','from-inclusive/to-exclusive和known/unknown；合法空','异Session显式过滤、撤权、零记录不能呈免费'),
 ('listTemplates','Template','list_templates','listTemplates','仅当前run执行pin的Template/version/body','Loop target pinned body/hash/version分页','普通E无pin合法空、他owner/pin、停用Template'),
 ('streamA2ATaskEvents','A2A','get_a2a_task_events','getA2ATaskEvents','active绑定task到准确Session；最多扫描200；派生去重','target E单页和无映射页推进checkpoint','另task/session、越bigint、撤权between scan/insert'),
 ('getProjectHealthHistory','Health','get_project_health_history','getProjectHealthHistory','已有准确project execution E；current grant','合法project E分页published/draft合同对照','projectless Loop E、C模式、跨project'),
 ('createProjectHealthUpdate','Health','create_project_health_update','createProjectHealthUpdate','已有agent草拟；source=agent/If-Match；publish需批准','draft与Human精确approval后published','旧revision、未批准publish、非精确project'),
 ('suggestWorkItemCompletion','Completion','suggest_work_item_completion','suggestCompletion','已有准确project/workItem E提案；不transition','合法suggestion＋evidence，工作流保持','越workItem、Agent decide/publish管理拒绝'),
]
projections = {'getInitiativeRollup','getAutomationRun','getUsageSummary','streamA2ATaskEvents'}
existing_adapters = {'getProjectHealthHistory','createProjectHealthUpdate','suggestWorkItemCompletion'}
baseline=json.loads((OUT/'input/discovery-review/discovery-baseline.json').read_text(encoding='utf-8'))
baseline_bindings={row['bindingId']:row for row in baseline['allBindings']}
common_facts={'credentialMode','sessionKind','role','state','liveAuthority','capabilitiesAllPresent','featureEnabled'}
common=[predicate for predicate in rules['listInitiatives'][1]['predicates'] if predicate['fact'] in common_facts]
assert {p['fact'] for p in common}==common_facts
target_checks={
 'getInitiativeRollup':[('initiativeLinkedProjectScope','NOT_FOUND')],
 'getAutomationRun':[('routeResolvedScope','NOT_FOUND'),('automationRunSessionMatches','NOT_FOUND')],
 'getUsageSummary':[(name,'RESOURCE_SCOPE_DENIED') for name in ['usageSessionMatches','usageAgentMatches','usageProjectMatches','usageFiltersMatchCurrentSession']],
 'streamA2ATaskEvents':[('a2aBindingActive','NOT_FOUND'),('a2aTaskSessionMatches','NOT_FOUND')],
}
future_rules={op:{'operationId':op,'predicates':common+[
 {'fact':fact,'allowed':[True],'reason':reason} for fact,reason in target_checks[op]],
 'capabilities':['work:read'],'feature':rules[op][1]['feature'],'variants':[],'write':False}
 for op in target_checks}
future_bindings=[]
for op,domain,tool,sdk,scope,positive,negative in choices:
    binding_id='tool:'+tool
    if op in existing_adapters:
        binding=baseline_bindings[binding_id]
    else:
        assert binding_id not in baseline_bindings,binding_id
        binding={'bindingId':binding_id,'operationIds':[op],'execution':'api',
                 'mode':['read-write'] if rules[op][1]['write'] else ['read-only','read-write'],
                 'coordination':False,'identityBinding':'explicit_identity_variants',
                 'targetParameter':None,'variant':None,'identityVariants':[
                   {'variant':'current_session','credentialMode':[credential],
                    'targetParameter':None,'installationBridgeRequired':False}
                   for credential in ['agent_session','coordination_connection']]}
    future_bindings.append(binding)
future_by_id={binding['bindingId']:binding for binding in future_bindings}
entries = []
for op, domain, tool, sdk, scope, positive, negative in choices:
    number, rule = rules[op]
    entries.append({
      'operationId':op,'domain':domain,'source':{'commit':MAIN,'path':rule_path,'line':number},
      'sourceRule':rule,'current':{'backend':'Human membership查询差异，发现明确阻断' if op in projections else '既有领域合同，目标仍逐次核验',
      'consumer':'SDK/MCP/Runner已有，补具名返回和联用回归' if op in existing_adapters else '具名SDK/MCP/Runner尚待本批适配',
      'productTest':'本批未运行'},
      'planned':{'backend':'待审最小投影修复' if op in projections else '复用现有，不扩权限',
      'sdkMethod':sdk,'mcpTool':tool,'runnerTool':'workmesh_'+tool,
      'readWriteOnly':rule['write'],'scope':scope,'positive':positive,'negative':negative,
      'runtime':'独立Windows测试部署；六域全开及逐域关闭；controlled model/fake provider',
      'actualStatus':'未实施/未测','requiresFormalReview':True},
    })
    entries[-1]['planned']['discovery']={'rule':future_rules.get(op,rule),
        'binding':future_by_id['tool:'+tool],'runtimeRegistrationVerified':False,
        'ruleDisposition':'通过M4增量替换旧Human查询谓词' if op in projections else '保留现行资格规则',
        'backendTargetAuthority':'调用REST按准确当前凭据/Session实时重核；requires_target_check不授权限',
        'regressionCases':['feature关闭(有feature时)','非法Session状态','缺capability','合法身份精确target待核','mode/身份变体一致','旧bindings保留']}
features = {'WORKMESH_BETA_PLANNING','WORKMESH_BETA_TEMPLATES','WORKMESH_EXPERIMENTAL_AUTOMATION',
            'WORKMESH_EXPERIMENTAL_AGENT_LOOPS','WORKMESH_BETA_COSTS','WORKMESH_EXPERIMENTAL_A2A'}
excluded = [{'operationId':op,'sourceLine':number,'feature':rule['feature'],
             'sourceRule':rule,'disposition':'保持Human管理，不新增Agent适配或授权'}
            for op,(number,rule) in rules.items() if rule['feature'] in features and
            op not in {x[0] for x in choices} and all(p['allowed']==['human_session']
            for p in rule['predicates'] if p['fact']=='credentialMode')]
data = {'main':MAIN,'status':'待审设计，非已实现支持表','selected':entries,
        'humanReserved':excluded,'frozenM0Policy':'原operation-decisions.json不修改，本卡增量与现行规则合成',
        'a2aDerivedWrite':'read分类不表示零DB写，保既有delivery去重并最终gate',
        'credentialModeBoundary':'sourceRule逐项列准许模式；Runner额外仅executing E，C走SDK/MCP',
        'notSelected':'F/TA新域、出站、UI、发行、真实provider/外发'}
(OUT/'operation-decisions.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
increment={'source':{'main':MAIN,'reviewedCandidate':'4e144f35759525a8a377acc73ba2f2dbfe02ab67',
                   'status':'Proposed；仅规划，未实施，待正式复审',
                   'commonRuleSource':'listInitiatives','baseline':'input/discovery-review/discovery-baseline.json',
                   'registrationSource':'apps/mcp/src/discovery.ts installDiscovery真实registerTool/registerResource捕获',
                   'activationGate':'正式方案复审闭合、后端合同通过、实际MCP注册捕获齐后才可首次生成；发现回归在生成后运行，不能互为前置'},
           'rules':list(future_rules.values()),'bindings':future_bindings,'registeredBindingIds':[],
           'plannedRegistrationAdditions':[b['bindingId'] for b in future_bindings if b['bindingId'] not in baseline_bindings],
           'preservedExistingSelectedBindings':[b['bindingId'] for b in future_bindings if b['bindingId'] in baseline_bindings],
           'requiredPreservedBindingIds':[b['bindingId'] for b in baseline['allBindings']],
           'requiredPreservedPolicyMappings':baseline['policyMappings'],
           'historicalRegistryInputUnion':baseline['historicalRegisteredBindingIds'],
           'registrationEvidence':{'status':'未运行','readOnlyCaptured':[],'readWriteCaptured':[],
                                   'note':'不把plannedRegistrationAdditions写入实际registeredBindingIds；实现时依真实捕获填充并绑定源码/输入/输出'},
           'activation':{'formalReviewClosed':False,'backendContractPassed':False,'registrationCaptured':False,'evidenceRefs':[]},
           'postGenerationAcceptance':{'discoveryRegressionsPassed':False,'regenerationZeroDiffProved':False,'historicalBindingsPreserved':False},
           'productGeneratorRun':False,'futureRegeneration':'M0->M1->M2->M3->M4；各批冻结输入不回写；两次完整bytes一致并git diff零差异'}
(OUT/'product-discovery-decisions.json').write_text(json.dumps(increment,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
headers = '# 逐操作现行合同与拟补消费者矩阵\n\n全部 planned；当前没有本批产品运行通过。完整角色/状态/capability/feature/凭据谓词逐项原样保存在 [结构化矩阵](operation-decisions.json) 的 sourceRule，来自精确主线解析，不以通用 pending 代审计。\n\n六域默认 feature 均关闭；独立部署全开是已选择的未来目标，当前容器没有被启用。普通 SavedView、Health/Completion 的 feature 为现行 null，不随六域假造新开关。\n\n'
table = '| operationId / 域 | 当前后端与权限边界 | 拟 SDK / MCP（Runner同名加workmesh_） | 允许正例 | 拒绝/兼容对照 |\n| --- | --- | --- | --- | --- |\n'
for row in entries:
    p=row['planned']
    table += f"| `{row['operationId']}` / {row['domain']} | {p['scope']}；{row['current']['backend']} | `{p['sdkMethod']}` / `{p['mcpTool']}` | {p['positive']} | {p['negative']} |\n"
tail = '\nSDK/MCP覆盖sourceRule准许的真实C/E模式；四投影的C scope可能合法为空/隐藏，不给coordination Session挂虚构项目。Runner仅execution/executing E，health/completion沿原更窄credential/role合同。所有写工具只读模式不注册；所有读取每次target核验，pagination/binding不授读权。费用写关闭Activity包装，A2A读派生写不发领域event/outbox。\n\n## 保留Human管理\n\n以下按现行六域规则逐项列出，不因工具数量或enabled转成Agent授权；completion Human decision另沿原稳定域合同。\n\n| operationId | feature | 判定 |\n| --- | --- | --- |\n'
for row in excluded:
    tail += f"| `{row['operationId']}` | `{row['feature']}` | {row['disposition']} |\n"
tail += '\n现行 `createAdvancedView` Human-only、`decideCompletionSuggestion` Human-only 均保留。首轮真实测试须对每个Human保留动作使用Human合法正例与准确Agent拒例；不以没有工具作为REST拒绝证据。外部通知发送不执行，只验证准入拒绝与fake adapter事实。\n\n## 四读新资格与精确bindings\n\n[受控discovery增量](product-discovery-decisions.json)列4项完整新rules、16项新增绑定及3项原样保留的health/completion绑定；[发现合同](discovery-contract.md)解释逐项谓词、未知目标与生成边界。当前sourceRule仍是主线旧事实，planned.discovery.rule才是待实施替换，不覆盖sourceRule。registeredBindingIds为空且registrationEvidence未运行，不是假实测清单；实际捕获前不得启用产品生成。\n'
(OUT/'operation-matrix.md').write_text(headers+table+tail,encoding='utf-8',newline='\n')
print(json.dumps({'选定操作数':len(entries),'Human保留规则数':len(excluded),'新资格规则':len(future_rules),
                 '新增绑定提案':len(increment['plannedRegistrationAdditions']),'实际注册证据':len(increment['registeredBindingIds']),
                 '保留既有selected绑定':len(increment['preservedExistingSelectedBindings'])},ensure_ascii=False))
