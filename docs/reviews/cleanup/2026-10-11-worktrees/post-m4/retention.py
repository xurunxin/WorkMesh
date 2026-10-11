"""刷新每树具体保留边界和解除条件；不解除保护，不发删除。"""
import json
from audit import OUT, BASE, CURRENT, ROOT, MAIN, utc, sha, load, write, call, scan

def main():
    audit = load(OUT / 'audit-opening.json.gz')
    results = []
    for r in audit['rows']:
        path = r['path']
        name = path.split('\\')[-1]
        old = r['historical']
        todo = old['todo'] if old else 59 if name == '01a127d4-e047-7e57-81c2-3d054851fc88' else 60
        source = '../followup/report.md；../followup/retention-review.json及本轮audit-opening.json.gz'
        if name == '01a12766-4132-7d8c-a542-dcbfb2008b49':
            reason = '第二轮#60已合PR217，现场全部Git可恢复、无链接/未提交/活动或恢复引用；本轮安全候选'
            condition = '先行提交推送与紧邻前完整门禁通过才执行'
        elif name == CURRENT.name:
            reason = '本轮当前构建及全部依据，永久本轮保护'
            condition = '本轮最终准确独审、RequiredCI、实际合入并退出后，仅登记下一轮候选'
            source = 'todo-mfKRDbW2TwlSuLxBxCoU-.json；当前cwd与branch'
        elif name == '01a126be-7aba-7b1d-a57a-f58317f89a67':
            reason = '仍有9个只读Git夹具对象，共696 B；现场整体2.998GB，先前安全门停，未尝试删除'
            condition = '只对精确9path另作属性边界裁定，且补完整现场保全与实时门禁；不自动重试'
            source = '../followup/blocked-cleanup-old.json；../followup/readonly-boundary.json；本轮readonly逐path实读'
            assert len(r['scan']['readonly']) == 9 and sum(p['bytes'] for p in r['scan']['readonly']) == 696
        elif name == '01a1264e-bd35-76d4-b328-03e9b91301f3':
            reason = '#58已Done/PR218合入；.tmp/m5-runtime恢复原件、首败、私有配置/DB及未映射DLL保护仍有效'
            condition = '逐path最小持久替代与恢复消费解除；当前授权不解除原恢复保护，不能整体或拆子路径删除'
            source = 'todo-OHtiaCWGLuE1ZKuaYcslS.json；docs/plan/agent-mcp-m5/product-resources-current.md/product-cleanup.json'
        elif name == '01a127d4-e047-7e57-81c2-3d054851fc88':
            reason = '#59已Done/PR219合入；.tmp/m4-4adc5e39恢复原件/私有配置/DB与卷镜像仍保护'
            condition = '逐path持久来源与恢复消费解除的精确裁定；容器停止/已合不能替代；本轮不拆树'
            source = 'todo-iCMNjXqZQLp65ZUMZg0nr.json；docs/plan/agent-mcp-m4/execution/resources.json/cleanup-current.json/resource-inventory-current.json'
        elif todo in (10,18,17,52):
            reason = 'G1/D0/C3历史拒绝或其保护父目录/原拒绝审计，永久本轮保护'
            condition = '不得重试、换工具、改属性/ACL或父删；本轮不请求重复许可'
        elif isinstance(todo,str) and todo.startswith(('5 ','8 ')):
            reason = '本轮status仍有历史未提交差异；属于明确恢复输入；#5仍review，不能丢本机成果'
            condition = '逐项必要成果持久保全且准确恢复消费解除；保留整个目录，不仅凭HEAD可达'
            assert r['status']['stdout']
        elif todo == 5:
            reason = '#5仍review，HEAD尚非main祖先，三OS/Windows第二用户/macOS门禁与恢复输入仍在'
            condition = '原任务完成且本机恢复引用准确解除，再登记；不能代跑原验收或删当前待审树'
            source += '；todo-ti53hOGbvnBNrvjXXveGO.json；conversation-ti53hOGbvnBNrvjXXveGO.json'
        elif str(todo).startswith('21'):
            reason = '#21已closed但两个HEAD仍非main祖先；首面checkpoint/未合UI恢复仍明确保护'
            condition = '用户明确后续UI消费范围，必要原件完整保全并解除准确恢复引用'
            source += '；todo-2j2sxT5wJ-l001efH_meJ.json'
        elif todo in (9,16):
            reason = '后端已Done/main可达；用户裁定保留后续UI/验收恢复，当前无明确解除依据'
            condition = '逐项UI/验收原件持久替代与后续恢复消费解除的精确裁定'
            source += '；todo-0BkezbmWV6k8vwrlSNuF_.json' if todo == 9 else '；todo-kjOs4t_DtMyrkHTBFmpQ5.json'
        else:
            reason = '旧38node_modules/36.turbo/2typecache及RAW/trace精确保护仍存在；本轮核现有source路径与ignored'
            condition = '逐项原精确保护解除依据；不能凭Done/main可达或年龄整体删除，也不拆子路径'
            assert any(p['existsNow'] for p in r['protectionMatches'])
        results.append(dict(path=path,todo=todo,head=r['head']['stdout'].strip(),mainAncestor=r['ancestor']['exit']==0,
            dirty=bool(r['status']['stdout']),logicalBytes=r['scan']['logicalBytes'],identityBytes=r['scan']['identityBytes'],
            groups=r['scan']['groups'],reason=reason,releaseCondition=condition,source=source,
            presentExactHistoricalProtection=sum(p['existsNow'] for p in r['protectionMatches']),
            inheritedReason=old['reason'] if old else None,candidate=name=='01a12766-4132-7d8c-a542-dcbfb2008b49'))
    write('retention-review.json',dict(recordedAt=utc(),main=MAIN,rows=results,
        scope='原拒目标不尝试；非拒目录逐个重核实际Git/dirty/ignored、当前任务、保护/恢复输入，当前无解除事实继续留存。'))
    # 准确M4资源清单；保留前次猜名缺失观察，不冒原路径存在。
    p = CURRENT / 'docs/plan/agent-mcp-m4/execution/resource-inventory-current.json'
    rel = str(p.relative_to(CURRENT)).replace('\\','/')
    blob = call(CURRENT,'rev-parse',MAIN+':'+rel)['stdout'].strip()
    data = call(CURRENT,'show',MAIN+':'+rel)['stdout'].encode()
    runtime = p.read_bytes()
    assert runtime == data or runtime == data.replace(b'\n',b'\r\n')
    write('source-manifest-supplement.json',dict(recordedAt=utc(),path=rel,gitBlob=blob,gitSha256=sha(data),
        windowsSha256=sha(runtime),windowsBytes=len(runtime),gitBytes=len(data),
        note='source-manifest.json中的resource-inventory.json猜名缺失保留；此项才是实际main来源。'))
    for key,private in [('m5',ROOT/'01a1264e-bd35-76d4-b328-03e9b91301f3'/'.tmp/m5-runtime'),
                        ('m4',ROOT/'01a127d4-e047-7e57-81c2-3d054851fc88'/'.tmp/m4-4adc5e39')]:
        started = utc()
        snapshot = scan(private)
        snapshot.pop('identities')
        snapshot.update(path=str(private),startedAt=started,decision='恢复目录保留；不随停止/已合自动解除')
        write('recovery-'+key+'-current.json.gz',snapshot)
    print(dict(retainedRows=len(results),safeCandidates=sum(r['candidate'] for r in results)))

if __name__ == '__main__':
    main()
