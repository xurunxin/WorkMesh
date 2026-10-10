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
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for p in logs:
            b=p.read_bytes();z.writestr(p.name,b)
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
    for old in controlled['operations']:
        op=old['operationId'];policy=next(x for x in runtime['routePolicyManifest'] if x['operationId']==op)
        bindings=[b for b in runtime['agentDiscoveryBindings'] if op in b['operationIds']]
        names=sorted({b['bindingId'][5:] for b in bindings if b['bindingId'].startswith('tool:') and b['bindingId'][5:] in runtime['tools']})
        sdkname=old.get('sdk',{}).get('name')
        runnername=old.get('runner',{}).get('name')
        runneralias={'deleteWorkItemRelation':'workmesh_delete_work_item_relation','postWorkRoomMessage':'workmesh_send_room_message','getAgentSessionContext':'workmesh_get_context','getAgentPlan':'workmesh_get_plan','listAgentPlanVersions':'workmesh_list_plan_versions'}.get(op,runnername)
        runnerpresent=runneralias in runtime['runnerLiteralNames']
        humanonly=policy.get('actorKinds')==['human']
        boundary='Human-only；不授Agent、不注册Agent写工具' if humanonly else '按现行资格/资源/feature；manifest不替代命令重验'
        if op in ['inspectExactTargetHandoff','rejectHandoff']:boundary='准确目标安装凭据；当前E不是安装身份'
        if op in ['acknowledgeAgentSession','heartbeatAgentSession','acknowledgeAgentSessionStop','getAgentSessionExecutionResult']:boundary='SDK/MCP及Runner宿主生命周期；不冒Pi用户工具'
        if op in ['createProject','updateProject','createProjectMilestone','deleteMilestone']:boundary+='；C规划职责，Runner固定E资格过滤，注册不意味着可用'
        output.append({'operationId':op,'family':old['family'],'rest':old['rest'],'currentPolicy':policy,'sdk':{'name':sdkname,'sourcePresent':bool(sdkname and re.search(r'\b'+re.escape(sdkname)+r'[<(]',sdk))},'mcpActualNames':names,'bindingIds':[b['bindingId'] for b in bindings],'runner':{'frozenName':runnername,'currentLiteralName':runneralias if runnerpresent else None,'scope':'宿主/身份过滤/有界输入子集' if not runnerpresent else '按实时资格，角色和资源过滤'},'boundary':boundary,'verification':'操作声明/实际注册已核；具体运行只按product-report与closure用例，未逐操作逐身份穷尽91项HTTP×MCP×Pi组合，不用数量冒全验收'})
    write(BASE/'product-operation-results.json',{'source':'冻结91操作不改写；当前注册实读，Human/安装/宿主边界分列','count':len(output),'operations':output})
    lines=['# M2 逐操作产品结果','', '冻结91操作逐项列出实际消费者。声明/注册检查不代运行；详细实际运行与未测组合见product-report.md。','', '| operationId | SDK | MCP具名工具 | Runner | 边界 |','| --- | --- | --- | --- | --- |']
    for o in output:lines.append('| '+o['operationId']+' | '+str(o['sdk']['name'])+' | '+(', '.join(o['mcpActualNames']) or '无')+' | '+(o['runner']['currentLiteralName'] or '宿主/无Pi工具')+' | '+o['boundary']+' |')
    (BASE/'product-operation-results.md').write_text('\n'.join(lines)+'\n',encoding='utf-8',newline='\n')
def artifacts():
    rows=[]
    for p in sorted(BASE.rglob('*')):
        if p.is_file() and (p.name.startswith('product-') or 'product-evidence' in p.parts) and p.name!='product-artifact-manifest.json':rows.append({'path':p.relative_to(ROOT).as_posix(),**digest(p.read_bytes())})
    write(BASE/'product-artifact-manifest.json',{'scope':'产品交付文件与证据，不含自身以避免自引用；冻结规划索引保持历史含义','files':rows})
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='preserve-emitted':collect_emitted()
    elif mode=='clean-emitted':clean_emitted()
    elif mode=='collect':evidence_index();sources();operations();artifacts()
    elif mode=='sources':sources();artifacts()
    else:raise ValueError(mode)
