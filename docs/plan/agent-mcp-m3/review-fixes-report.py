"""成果独审三 blocking 的实际修复回执；完整保全旧报告，不用新绿色覆盖旧源。"""
from pathlib import Path
import hashlib,json,re,subprocess,sys,zipfile
HERE=Path(__file__).parent;ROOT=HERE.resolve().parents[2]
BASE='c8e2632d36e15b43d3cb1ec2ef468680dad31e01'
sys.stdout.reconfigure(encoding='utf-8')
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def sha(data):return hashlib.sha256(data).hexdigest()
def read(name):return json.loads((HERE/name).read_text(encoding='utf-8'))
def write(name,value):(HERE/name).write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
history=HERE/'review-fixes-history.zip'
names=['product-report.md','product-check-index.json','product-operation-matrix.json','product-operation-matrix.md',
 'product-acceptance-matrix.json','product-acceptance-matrix.md','product-recovery-matrix.json','product-recovery-matrix.md',
 'product-source-verification.json','product-delivery-receipt.json','product-static-verification.json',
 'product-test-source-bindings.json','product-resources.json','product-process-observation.json','product-lock-observations.json']
if not history.exists():
    rows=[]
    with zipfile.ZipFile(history,'w',zipfile.ZIP_DEFLATED) as z:
        for name in names:
            path='docs/plan/agent-mcp-m3/'+name;data=git('show',BASE+':'+path)
            z.writestr(name,data);rows.append({'path':path,'member':name,'commit':BASE,'blob':git('rev-parse',BASE+':'+path).decode().strip(),'sha256':sha(data),'bytes':len(data)})
    write('review-fixes-history.json',{'archive':history.name,'sha256':sha(history.read_bytes()),'files':rows,'boundary':'从准确Git提交完整读取的上一候选原件；不是本轮产品测试。旧源码双字节ZIP另由product-sources.py存入内容寻址history。'})
if '--preserve' in sys.argv:
    print(json.dumps({'baseline':BASE,'historyFiles':len(names),'exit':0}));sys.exit(0)
index=read('product-check-index.json');old=json.loads(git('show',BASE+':docs/plan/agent-mcp-m3/product-check-index.json'))
old_ids={r['id'] for r in old['receipts']};new=[r for r in index['receipts'] if r['id'] not in old_ids]
def output(r):
    with zipfile.ZipFile(HERE/r['rawArchive']) as z:text=z.read('stdout.bin').decode('utf-8','replace')+'\n'+z.read('stderr.bin').decode('utf-8','replace')
    return re.sub(r'\x1b\[[0-9;]*m','',text)
by_id={r['id']:r for r in index['receipts']}
unit=by_id[index['required']['test']];integration=by_id[index['required']['test:integration']]
binding={r['id']:r for r in read('product-test-source-bindings.json')['rows']}
required=[by_id[r] for r in index['required'].values()]
ready=all(r['id'] not in old_ids and r['exit']==0 and binding[r['id']]['completeUnchangedFinalSource'] for r in required)
counts={'unitPassed':sum(map(int,re.findall(r'\bTests\s+(\d+) passed',output(unit)))),
 'unitSkipped':sum(map(int,re.findall(r'\bTests[^\n]*?\| (\d+) skipped',output(unit)))),
 'apiDeliveryTests':re.findall(r'stage3-delivery\.integration\.test\.ts \((\d+) tests',output(integration)),
 'workerProviderTests':re.findall(r'stage3-provider\.integration\.test\.ts \((\d+) tests',output(integration)),
 'm3ConformanceTests':re.findall(r'delivery-recovery\.conformance\.test\.ts \((\d+) tests',output(integration))}
observations=[r['observation'] for r in read('product-lock-observations.json')['observations'] if r['receipt']==integration['id']+'.json' and r['exit']==0]
context=[r['m3ContextExhaustion'] for r in observations if 'm3ContextExhaustion' in r]
waits=[r['m3AuthorityWait'] for r in observations if 'm3AuthorityWait' in r]
current_source=read('product-source-manifest.json')
rows=[]
for r in new:rows.append({k:r[k] for k in ['id','argv','exit','elapsedSeconds','runtime','receipt','rawArchive','archiveSha256','summaries','failures','changedSourceDuringCommand']})
value={'baselineCommit':BASE,'mainObservedThisTurn':'ef4cb5e1458d911d98433c443dba46e6c224caa0','productSourceFiles':len(current_source['files']),
 'currentRequiredPassedAndFullyBound':ready,'counts':counts,'currentIntegration':integration['id'],'newReceipts':rows,
 'actualCurrentLockWaits':waits,'actualContextExhaustion':context,
 'boundary':'全量before/after指纹只证明命令起止字节相同；具体执行以argv/完整输出的套件名称为准。旧首败及未完整源绑定回执不覆盖；真实provider账号/PR CI/正式复审未完成。'}
write('review-fixes-evidence.json',value)
table='| 命令 | 回执 | exit | 实际统计／cache／skip |\n| --- | --- | --- | --- |\n'+'\n'.join('| '+r['argv'][-1]+' | ['+r['id']+']('+r['receipt']+') | '+str(r['exit'])+' | '+'; '.join(r['summaries']).replace('|','／')+' |' for r in required)
fail='\n'.join('- ['+r['id']+']('+r['receipt']+')：exit '+str(r['exit'])+'；'+ '; '.join(r['failures'][:3]) for r in new if r['exit']!=0) or '本轮无首败。'
text=f'''# M3 成果独审三项 blocking 修复

状态：{'本轮全部必需检查 exit 0 且最终源码起止绑定一致，停 review 供正式复审' if ready else '仍有检查／来源绑定未齐全，不能称完整修复交付'}。不直接 PR CI、合入或 Done。主力交付入口为本报告与 [整体产品报告](product-report.md)。

开工 Git 候选 `{BASE}`；本轮平台只读实际 main `ef4cb5e1458d911d98433c443dba46e6c224caa0`。最终源码共 {len(current_source['files'])} 文件，Git blob 与 Windows 运行 bytes 分列见 [源清单](product-source-manifest.json)、[提交后核验](product-source-verification.json)。元数据提交不冒新的产品运行。上轮报告、矩阵、核验全文从精确 Git 保存在 [历史原件 ZIP 索引](review-fixes-history.json)；原旧源码 ZIP、unknown、首败和缺口保持。

## 三项修复及准确源码

1. `apps/worker/src/provider-actions.ts`：在既有完整 `prepareMutation` 锁事务内取 `r.default_branch AS repository_default_branch`，branch 的 `payload.name === facts.repository_default_branch`、commit 的 `payload.branch === facts.repository_default_branch`、openPR 的 `payload.headBranch === facts.repository_default_branch` 及 merge／CI 的 `pr.head_branch===facts.repository_default_branch` 均拒绝。每次 HTTP guard 重读；claim 的旧默认分支不再作仓库写发送决策，剩余引用仅为 fake 分支夹具的 seedRepository 引导，不作写许可判据。PG 实际观察五 kind 默认分支更新先提交，仓库写 HTTP 0；commit 第一条 tree 已许可并进入 HTTP 后，在真实下一 guard 锁等待中更新默认分支，写总数保持 1。原 head／checks／reviews／approval／context 门禁未减。
2. `packages/db/src/principal-team-authority.ts`：共享谓词 `authority_principal.kind='human' AND authority_principal.is_active`，并要求 `authority_principal.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships authority_membership ... authority_membership.team_id=${{teamSql}} ... authority_membership.actor_id=authority_principal.id)`。Worker、`apps/api/src/delivery/provider-action-query.ts`、review parent predicate 与 `assertReviewRepositoryScope` 共同消费；显式创建和 replay 已用同一校验器。准确 workspace／Team／principal，无 Human 角色扩张；省略 repositoryIds 的 M2 合同保持。真实 PG 成员删除先提交 HTTP 0，第一条许可后删除成员阻止第二条写；Native HTTP／MCP／Pi action 隐藏、review 创建／原 key 重放／子仓库读拒绝，恢复后原回执且不重复 child。API 另保 admin 无成员合法正对照。
3. `apps/worker/src/provider-actions.ts`：领取 CTE 由旧行生成 `(action.kind='resolve_repository_context' AND action.attempt_count>=8 AND action.result IS NULL) AS exhausted_context`；不再用旧 attempt 过滤永久丢弃过期动作。`if (checkpoint)` 本地 finish 优先；随后 `if (action.exhausted_context)` 通过完整锁及原 worker／attempt／DB 毫秒 claimed_at／status CAS，`await deadLetter(tx, action, 'PROVIDER_ACTION_RETRY_EXHAUSTED')`，零 provider 构造与调用。新 attempt7→8 是最后一次允许读，旧8→8 是耗尽重领。查询 `exhaustedContext` 派生 `human_reconcile / scheduled=false / nextQueryAt=null`，REST/Zod/OpenAPI 增加同一稳定 code。零迁移、零新字段／状态／event。

## 实际验证、首败及适用边界

{table}

当前完整套件：API delivery {', '.join(counts['apiDeliveryTests'])}，Worker provider {', '.join(counts['workerProviderTests'])}，M3 conformance {', '.join(counts['m3ConformanceTests'])}；单元 {counts['unitPassed']} passed／{counts['unitSkipped']} skipped。缓存与数量以各条原日志为准，不把 cache 回放称重新执行。M0／M1／M2 同组合回归，三 fake 完整链、实际 RustFS 上传下载、health 精确 Human 批准及本机 GitHub／Gitea HTTP adapter 都由当前完整 integration 原输出确认。

PG 锁观察 {len(waits)} 条（当前完整 integration），含 blocker／waiting PID、pg_locks、提交次序；context 第八次领取崩溃测试 {len(context)} 条默认真实 60 秒跨期观察，旧 generation fail 不覆盖重领，终态只一条 dead-letter 事实，沿原事务写 outbox，provider 0。合法 context checkpoint 在上限仅本地完成且旧 unknown 不改写。新的耗尽跨默认租期主夹具使用 GitHub 标签、provider 不构造；未单独再跑 fake／Gitea 的同一耗尽组合，不冒三个真实账号。原十八行 checkpoint／纯读重试按标签各运行，来源及限制在 [十八恢复行](product-recovery-matrix.md)。

Pi 配置 LLM 入口要求 admin，测试在管理员准备后、Runner 准入前恢复原 principal member 身份；模型第一条请求已准入后撤销成员，工具真实 API 拒绝响应后恢复，使模型实际接收带 code／correlationId 的拒绝结果；不是模拟成功或放宽产品权限。准确旧回执 key 从持久记录取回，经 REST 验 replay，Pi 新创建与查询／子仓库读由模型实收；不把每次模型新调用冒原 key replay。三个拒绝 HTTP 状态、恢复正对照与 child 数量见各 run ZIP 的 `*-principal-membership.json`。

本轮首败保全（完整 stdout/stderr 在对应 ZIP）：

{fail}

首轮 Worker GitHub PR GET 列表夹具返回对象导致 `existing.find` 错误，修正为原 API 数组 `[]`；Pi 夹具先误改原 principal 角色导致配置 admin 门禁拒绝，再错误更换 principal 引发既有 installation／conversation 绑定拒绝，均保首败。恢复夹具保持同一个原 principal，在明确 DB 授权测试条件下切角色／membership；拒绝响应路径断言也保原首败，不减少断言。原 source before／after 区分执行中变化的早期回执，最新源以无变完整运行绑定为准。

现有 Windows 单元两个 Linux 实机 skip，以及 integration 的 live MiniMax／retention upgrade／recovery 三环境 skip 来源与不适用理由保存在 [整体报告](product-report.md)。定向 `-t` 过滤 skip 另计；全部必需 exit 0 不把 skip 称通过。没有真实 provider 账号、秘密或外发授权，不冒账号整链支持；Gitea 多文件 commit／CI retry 仍不支持。

## 整体交付与收尾

[四十操作](product-operation-matrix.md)、[原九类](product-acceptance-matrix.md)、[十八恢复行](product-recovery-matrix.md)、[准确命令／runtime／原输出](product-check-index.json)、[逐命令来源绑定](product-test-source-bindings.json)、[修复证据](review-fixes-evidence.json)、[资源逐 owner／path 保全清理](product-resources.json)、[最后进程观察](product-process-observation.json)。历史完整中文方案及冻结全文保持原件，不借旧检查代新组合。

独有临时 PostgreSQL／Redis／RustFS 的 label、ID、端口、准备和清理 nativeExit 逐项保存；所有健康检查轮询至退出后才收尾。共享镜像、store、node_modules、当前恢复目录及 G1D0C3 拒目标保留；不递归删除 Windows 目录。仅 Todos＋仓库记录，不伪真实 WorkMesh 远端状态。正式独立成果复审、最新 PR Required CI 和实际 Done/main 未完成；本轮停 review。
'''
(HERE/'review-fixes-report.md').write_bytes(text.rstrip().encode()+b'\n')
print(json.dumps({'newReceipts':len(new),'ready':ready,'counts':counts,'lockWaits':len(waits),'contextExhaustion':len(context)},ensure_ascii=False))
if '--final' in sys.argv and not ready:sys.exit('当前必需检查或最终来源绑定未齐全')
