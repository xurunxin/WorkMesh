"""从完整回执/原字节归档生成产品索引；历史未知结果不补码。"""
from pathlib import Path
import hashlib,json,re,subprocess,sys,zipfile,time
ROOT=Path(__file__).resolve().parents[3]
BASE=Path(__file__).parent
OUT=BASE/'product-evidence'
MAIN='cfce77546b64c2a8d7d12949261c38e2f666d5ae'
def digest(b):return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def collect_emitted():
    receipt=json.loads((OUT/'run-067.json').read_text(encoding='utf-8'))
    candidates=git('ls-files','--others','--exclude-standard').decode().splitlines()
    members=[]
    archive=OUT/'failed-build-emitted.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name in candidates:
            path=ROOT/name
            sibling=ROOT/(name[:-5]+'.ts' if name.endswith('.d.ts') else name[:-3]+'.ts')
            if not name.startswith(('apps/','packages/')) or not name.endswith(('.js','.d.ts')) or not sibling.is_file():continue
            assert name not in receipt['sourceBefore'],name
            assert receipt['startedUnix']-2<=path.stat().st_mtime<=receipt['endedUnix']+2,name
            assert not path.is_symlink() and path.resolve().is_relative_to(ROOT.resolve())
            b=path.read_bytes();z.writestr(name,b);members.append({'path':name,'absolutePath':str(path.resolve()),**digest(b)})
    write(OUT/'failed-build-emitted.json',{'sourceReceipt':'run-067.json','archive':{'path':archive.name,**digest(archive.read_bytes())},'members':members,'cleanup':None,'note':'编译器越rootDir新生成的未跟踪叶文件；健康integration结束后才逐项清理'})
    print(json.dumps({'preservedEmittedFiles':len(members)}))
def clean_emitted():
    registry=OUT/'failed-build-emitted.json';data=json.loads(registry.read_text(encoding='utf-8'))
    for row in data['members']:
        path=ROOT/row['path'];resolved=path.resolve()
        assert resolved.is_relative_to(ROOT.resolve()) and str(resolved)==row['absolutePath'] and not path.is_symlink()
        assert digest(path.read_bytes())=={k:row[k] for k in ('bytes','sha256')}
        tracked=git('ls-files', '--',row['path']).strip()
        if tracked:
            checkpoint='521e86d90e0d127182d0d46af842fe7463b88576'
            blob=git('show',checkpoint+':'+row['path'])
            assert blob.replace(b'\r\n',b'\n')==path.read_bytes().replace(b'\r\n',b'\n')
            row['checkpointGit']={'commit':checkpoint,'blob':git('rev-parse',checkpoint+':'+row['path']).decode().strip(),**digest(blob)}
            row['trackedAfterInterruption']=True
        path.unlink();row['cleanup']={'operation':'unlink exact verified owned leaf','existedAfter':path.exists(),'exit':0}
    data['cleanup']={'healthyCommandsObservedExitedBeforeCleanup':True,'nativeAction':'Python Path.unlink per registered leaf','recursiveDelete':False,'completedUnix':time.time()}
    write(registry,data);print(json.dumps({'removedEmittedFiles':len(data['members'])}))
def evidence_index():
    runs=[]
    for p in sorted(OUT.glob('run-*.json')):
        r=json.loads(p.read_text(encoding='utf-8'));a=OUT/f'{p.stem}-output.zip';summaries=[];failures=[]
        if a.exists():
            with zipfile.ZipFile(a) as z:
                s=z.read('stdout').decode('utf-8',errors='replace')+'\n'+z.read('stderr').decode('utf-8',errors='replace')
                summaries=[line.strip() for line in s.splitlines() if re.search(r'\b(?:Tests|Test Files)\s+\d|[ℹ#] (?:tests|pass|fail|skipped) \d|\d+ (?:passed|skipped) \(',line)]
                failures=[line.strip() for line in s.splitlines() if re.search(r'\bFAIL\s|error TS\d|failed \(|Startup Error|Error:|→ ',line)][:35]
        runs.append({'receipt':p.name,'argv':r.get('argv'),'nativeExit':r.get('nativeExit'),'status':'exited' if 'nativeExit' in r else r.get('status','unknown'),
            'runtimeSeconds':r.get('runtimeSeconds'),'sourceUnchanged':r.get('sourceUnchanged'),'actualSummaryLines':summaries,'firstFailureLines':failures,
            'archive':r.get('archive'),'countsInterpretation':'逐套件原汇总，含Turbo命中日志；不重复合计缓存/嵌套运行，不由退出码猜数量'})
    write(BASE/'product-check-results.json',{'runs':runs,'historicalUnknownRetained':True,'pendingRunning':[r['receipt'] for r in runs if r['status']!='exited']})
    resources=[json.loads(p.read_text(encoding='utf-8')) for p in sorted(OUT.glob('*-resources.json'))]
    write(BASE/'product-resource-results.json',{'resources':resources,'sharedImagesPreserved':True,'g1d0c3Untouched':True,'retainedRecoveryPath':'C:/Users/xurx/AppData/Local/Temp/workmesh-runner-KEM6VD','historicalMissingCommandReceipts':'旧登记仅有资源ID/status/cleanupExit的，不能补作当时逐命令原件；后续operations记录实际argv/exit/time','processAndScratchEvidence':'run输出ZIP内runnerResource/runnerTestResource/cleanup.json逐事实，不以总exit推算每路径清理'})
    # Preserve redacted service bytes before readable whitespace cleanup; no credential originals.
    logs=[p for p in OUT.glob('*-service.log')]
    archive=OUT/'service-logs-raw.zip';rows=[]
    previous={}
    old_index=OUT/'service-logs-raw-index.json'
    if archive.exists() and old_index.exists():
        metadata=json.loads(old_index.read_text(encoding='utf-8'))
        with zipfile.ZipFile(archive) as old:
            for row in metadata['members']:
                raw=old.read(row['path']);assert digest(raw)==row['raw']
                previous[row['path']]=(row,raw)
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for p in logs:
            current=p.read_bytes()
            if p.name in previous:
                row,b=previous[p.name]
                assert digest(current)==row['readable'],p.name
            else:b=current
            z.writestr(p.name,b)
            clean='\n'.join(line.rstrip() for line in b.decode('utf-8',errors='replace').splitlines()).rstrip()+'\n'
            p.write_text(clean,encoding='utf-8',newline='\n');rows.append({'path':p.name,'raw':digest(b),'readable':digest(p.read_bytes())})
    write(OUT/'service-logs-raw-index.json',{'archive':{'path':archive.name,**digest(archive.read_bytes())},'members':rows,'redactedBeforeArchive':True})
def sources():
    head=git('rev-parse','HEAD').decode().strip()
    names=set(git('diff','--name-only',MAIN).decode().splitlines())|set(git('ls-files','--others','--exclude-standard').decode().splitlines())
    names=sorted(n for n in names if not n.startswith(('docs/plan/','ci-logs/')) and (ROOT/n).is_file())
    entries=[];archive=BASE/'product-source-snapshot.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for n in names:
            b=(ROOT/n).read_bytes();z.writestr('worktree/'+n,b)
            row={'path':n,'worktree':digest(b),'head':head,'gitHead':None,'gitMain':None}
            for label,ref in [('gitHead',head),('gitMain',MAIN)]:
                proc=subprocess.run(['git','show',ref+':'+n],cwd=ROOT,capture_output=True)
                if proc.returncode==0:
                    blob=git('rev-parse',ref+':'+n).decode().strip();z.writestr(label+'/'+n,proc.stdout);row[label]={'commit':ref,'blob':blob,**digest(proc.stdout)}
            row['gitWorktreeBytesEqual']=row['gitHead'] is not None and row['gitHead']['sha256']==row['worktree']['sha256']
            entries.append(row)
    write(BASE/'product-source-manifest.json',{'main':MAIN,'observedHead':head,'scope':'本批产品/协议/CI/测试变更；规划和日志排除且单独artifact索引。head未提交增量与工作树明确双列','archive':{'path':archive.name,**digest(archive.read_bytes())},'entries':entries})
def operations():
    controlled=json.loads((BASE/'operation-decisions.json').read_text(encoding='utf-8'))
    runtime=json.loads((BASE/'product-consumer-inspection.json').read_text(encoding='utf-8'))
    output=[]
    sdk=(ROOT/'packages/agent-sdk/src/index.ts').read_text(encoding='utf-8')
    # Native API logs are observations, not inferred successes from tool registration.
    receipts=[];requests={};observations=[]
    for p in sorted(OUT.glob('run-*.json')):
        r=json.loads(p.read_text(encoding='utf-8'))
        if r.get('nativeExit')==0 and any(v in r.get('argv',[]) for v in ['test:integration','test:integration:api']):receipts.append(p)
    for p in receipts[-2:]:
        with zipfile.ZipFile(OUT/f'{p.stem}-output.zip') as z:
            for line in z.read('stdout').decode('utf-8',errors='replace').splitlines():
                start=line.find('{')
                if start<0:continue
                try:entry=json.loads(line[start:])
                except ValueError:continue
                identity=(p.name,entry.get('reqId'))
                if entry.get('req'):requests[identity]=entry['req']
                if entry.get('res') and identity in requests:
                    req=requests[identity];observations.append({'receipt':p.name,'requestId':entry['reqId'],'method':req['method'],'path':req['url'].split('?')[0],'status':entry['res']['statusCode']})
    test_families={'规划':['apps/api/integration/stage2-collaboration.integration.test.ts','apps/api/integration/stage0.integration.test.ts'], '评论':['apps/api/integration/stage0.integration.test.ts','apps/api/integration/route-policy-authorization.integration.test.ts'],'文档':['apps/api/integration/documents.integration.test.ts'],'Guidance':['apps/api/integration/guidance.integration.test.ts'],'Decision':['apps/api/integration/stage2-collaboration.integration.test.ts'],'Room/Inbox':['apps/api/integration/stage2-collaboration.integration.test.ts'],'Handoff':['apps/api/integration/stage2-collaboration.integration.test.ts'],'子任务':['apps/api/integration/stage2-collaboration.integration.test.ts'],'M1依赖':['packages/conformance/src/execution-recovery.conformance.test.ts']}
    conformance='packages/conformance/src/planning-collaboration.conformance.test.ts'
    source_lines=(ROOT/conformance).read_text(encoding='utf-8').splitlines()
    current_hash=digest((ROOT/conformance).read_bytes())
    actual_run=next(((p,r) for p in sorted(OUT.glob('run-*.json'),reverse=True) if (r:=json.loads(p.read_text(encoding='utf-8'))).get('nativeExit')==0 and r.get('sourceAfter',{}).get(conformance)==current_hash and (conformance.rsplit('/',1)[1] in ' '.join(r.get('argv',[])) or r.get('argv',[])[-1:]==['test:conformance:integration']) and '-t' not in r.get('argv',[])),None)
    pi_calls={}
    def scan_calls(value,member):
        if isinstance(value,dict):
            call=value.get('call')
            if isinstance(call,dict) and isinstance(call.get('name'),str):pi_calls.setdefault(call['name'],[]).append(member)
            for child in value.values():scan_calls(child,member)
        elif isinstance(value,list):
            for child in value:scan_calls(child,member)
    if actual_run:
        with zipfile.ZipFile(OUT/f'{actual_run[0].stem}-output.zip') as z:
            for member in z.namelist():
                # Fixed scenario captures are overwritten by this successful suite;
                # random historical pi files are preserved but not counted as new.
                if '/planning-collaboration/' in member and member.endswith('.json') and any(member.endswith('/'+name) for name in ['review-repair-large-document.json','pi-creation-response-and-restart.json','finite-budget-chain.json','pi-named-planning-tools.json','pi-session-failure-success.json','pi-session-failure-stale.json','pi-session-failure-stop.json','pi-session-failure-revoked.json','pi-session-failure-response_lost.json']):scan_calls(json.loads(z.read(member)),member)
    for old in controlled['operations']:
        op=old['operationId'];policy=next(x for x in runtime['routePolicyManifest'] if x['operationId']==op)
        bindings=[b for b in runtime['agentDiscoveryBindings'] if op in b['operationIds']]
        names=sorted({b['bindingId'][5:] for b in bindings if b['bindingId'].startswith('tool:') and b['bindingId'][5:] in runtime['tools']})
        sdkname=old.get('sdk',{}).get('name')
        runnername=old.get('runner',{}).get('name')
        runneralias={'deleteWorkItemRelation':'workmesh_delete_work_item_relation','postWorkRoomMessage':'workmesh_send_room_message','getAgentSessionContext':'workmesh_get_session_context','getAgentPlan':'workmesh_get_session_plan','listAgentPlanVersions':'workmesh_list_plan_versions','failAgentSession':'workmesh_fail_session','commentOnPlanStep':'workmesh_comment_plan_step','proposePlanAssignment':'workmesh_propose_plan_step_assignment','appendContextDelta':'workmesh_append_context_delta',**{f'get{s.title()}Guidance':f'workmesh_get_{s}_guidance' for s in ['workspace','team','project']},**{f'create{s}Decision':f'workmesh_create_{wire}_decision' for s,wire in [('WorkItem','work_item'),('Project','project'),('Session','session')]},'claimInboxItem':'workmesh_claim_inbox_item','acknowledgeInboxItem':'workmesh_acknowledge_inbox_item'}.get(op,runnername)
        dynamic={'workmesh_get_workspace_guidance','workmesh_get_team_guidance','workmesh_get_project_guidance','workmesh_create_work_item_decision','workmesh_create_project_decision','workmesh_create_session_decision','workmesh_claim_inbox_item','workmesh_acknowledge_inbox_item'}
        runnerpresent=runneralias in runtime['runnerLiteralNames'] or runneralias in dynamic
        humanonly=policy.get('actorKinds')==['human']
        boundary='Human-only；不授Agent、不注册Agent写工具' if humanonly else '按现行资格/资源/feature；manifest不替代命令重验'
        if op in ['inspectExactTargetHandoff','rejectHandoff']:boundary='准确目标安装凭据；当前E不是安装身份'
        if op in ['acknowledgeAgentSession','heartbeatAgentSession','acknowledgeAgentSessionStop','getAgentSessionExecutionResult']:boundary='SDK/MCP及Runner宿主生命周期；不冒Pi用户工具'
        if op in ['createProject','updateProject','createProjectMilestone','deleteMilestone']:boundary+='；C规划职责，Runner固定E资格过滤，注册不意味着可用'
        route=old['rest']['path'];pattern='^'+re.sub(r'\{[^}]+\}|:[A-Za-z_][A-Za-z0-9_]*','[^/]+',route)+'$'
        seen=[r for r in observations if r['method']==old['rest']['method'] and re.match(pattern,r['path'])]
        named_calls=[{'file':conformance,'line':i+1,'names':[name for name in names if re.search(r"['\"]"+re.escape(name)+r"['\"]",line)],'kind':'当前通过套件具名调用及正拒断言，原行全文在源码snapshot'} for i,line in enumerate(source_lines) if ('call(' in line or 'call<' in line or '.callTool(' in line) and any(re.search(r"['\"]"+re.escape(name)+r"['\"]",line) for name in names)] if actual_run else []
        output.append({'operationId':op,'family':old['family'],'rest':old['rest'],'currentPolicy':policy,'sdk':{'name':sdkname,'sourcePresent':bool(sdkname and re.search(r'\b'+re.escape(sdkname)+r'[<(]',sdk))},'mcpActualNames':names,'bindingIds':[b['bindingId'] for b in bindings],'runner':{'frozenName':runnername,'currentName':runneralias if runnerpresent else None,'registration':'源码动态作用域循环' if runneralias in dynamic else '实际literal/宿主','scope':'宿主/身份过滤/有界输入子集' if not runnerpresent else '按实时资格，角色和资源过滤'},'boundary':boundary,'actualHttp':{'observedStatuses':sorted({r['status'] for r in seen}),'count':len(seen),'examples':seen[:6],'meaning':'精确method/path及reqId完成回执，身份/语义断言另见相应源码；无观察不能猜未执行或成功'},'testSources':test_families[old['family']]+['packages/conformance/src/planning-collaboration.conformance.test.ts'],'closureRows':old['tests'],'verification':'实际注册与HTTP完成回执分列；MCP/Pi具体运行只按product-report与closure用例，未逐操作逐身份穷尽91项HTTP×MCP×Pi组合，不用数量冒全验收'})
        output[-1]['actualMcpAssertions']={'receipt':actual_run[0].name if actual_run else None,'calls':named_calls,'unmeasuredOtherCombinations':True}
        output[-1]['actualPiModelCalls']={'receipt':actual_run[0].name if actual_run and runneralias in pi_calls else None,'captureMembers':sorted(set(pi_calls.get(runneralias,[]))),'executedCallCount':len(pi_calls.get(runneralias,[])),'meaning':'模型实际选择调用，与模型实收返回分别见capture results；工具可见列表不计调用'}
    write(BASE/'product-operation-results.json',{'source':'冻结91操作不改写；当前注册实读，Human/安装/宿主边界分列','count':len(output),'operations':output})
    lines=['# M2 逐操作产品结果','', '冻结91操作逐项列出实际消费者。声明/注册检查不代运行；HTTP精确method/path请求回执由最近已通过根集成日志提取，不推测身份。MCP具名调用列给当前通过套件的精确断言源码行，Pi只计固定场景模型实际选择call（可见tools不计）。原实收及未测组合见[整卡报告](product-report.md)和[18行闭合矩阵](product-closure-matrix.md)。源码动态工具名明确标记，不冒literal注册；Human-only SDK字段是冻结目标名，无实际入口时sourcePresent=false，不冒Agent拥有该工具。','', '| operationId | SDK | MCP具名工具 | Runner | HTTP状态／次数；MCP断言行；Pi调用 | 边界 |','| --- | --- | --- | --- | --- | --- |']
    for o in output:lines.append('| '+o['operationId']+' | '+str(o['sdk']['name'])+('' if o['sdk']['sourcePresent'] else '（无Agent SDK入口）')+' | '+(', '.join(o['mcpActualNames']) or '无')+' | '+(o['runner']['currentName'] or '宿主/无Pi工具')+' | '+('/'.join(map(str,o['actualHttp']['observedStatuses'])) or 'API日志无观察')+'；'+str(o['actualHttp']['count'])+'；'+(','.join(str(c['line']) for c in o['actualMcpAssertions']['calls']) or '其它套件/未实测此MCP组合')+'；'+str(o['actualPiModelCalls']['executedCallCount'])+' | '+o['boundary']+' |')
    (BASE/'product-operation-results.md').write_text('\n'.join(lines)+'\n',encoding='utf-8',newline='\n')
def artifacts():
    rows=[]
    for p in sorted(BASE.rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts and (p.name.startswith('product-') or 'product-evidence' in p.parts) and p.name!='product-artifact-manifest.json':rows.append({'path':p.relative_to(ROOT).as_posix(),**digest(p.read_bytes())})
    write(BASE/'product-artifact-manifest.json',{'scope':'产品交付文件与证据，不含自身以避免自引用；冻结规划索引保持历史含义','files':rows})
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='preserve-emitted':collect_emitted()
    elif mode=='clean-emitted':clean_emitted()
    elif mode=='collect':evidence_index();sources();operations();artifacts()
    elif mode=='sources':sources();artifacts()
    else:raise ValueError(mode)
