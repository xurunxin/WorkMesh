"""只从已结束的真实回执生成中文报告与剩余清单。"""
import collections
from audit import OUT, CURRENT, MAIN, utc, load, write

def main():
    before = load(OUT/'usage-opening.json.gz')
    after = load(OUT/'usage-after.json.gz')
    opening_ids = load(OUT/'audit-opening.json.gz')
    after_ids = load(OUT/'identity-after.json.gz')
    post = load(OUT/'postflight.json')
    validation = load(OUT/'validation-final.json')
    operation = load(OUT/'execution-cleanup-pr217.json')
    review = load(OUT/'retention-review.json')
    assert before['complete'] and after['complete'] and post['protectionChanges'] == 0
    assert validation['result'].startswith('全部通过')
    after_by_path = {r['path']:r for r in after['rows']}
    retained = []
    for row in review['rows']:
        if row['candidate']:
            assert row['path'] not in after_by_path
            continue
        current = after_by_path[row['path']]
        identity = next(r['scan']['identityBytes'] for r in after_ids['rows'] if r['path'] == row['path'])
        retained.append(dict(**{k:v for k,v in row.items() if k not in ('logicalBytes','identityBytes','groups')},
                             logicalBytes=current['logicalBytes'],identityBytes=identity,groups=current['groups']))
    retained.sort(key=lambda r:r['logicalBytes'],reverse=True)
    write('retained-directories.json',dict(recordedAt=utc(),main=MAIN,rows=retained,
        currentBuildProtection=str(CURRENT),physicalNetReleasedBytes=None))
    def groups(snapshot):
        count = collections.Counter()
        for row in snapshot['rows']:
            for name,g in row['groups'].items():
                count[name] += g['logicalBytes']
        return count
    bg, ag = groups(before), groups(after)
    changes = [dict(path=r['path'],changeBytes=r['logicalBytes']-next(x['logicalBytes'] for x in before['rows'] if x['path']==r['path'])) for r in after['rows']]
    write('composition.json',dict(recordedAt=utc(),before=dict(startedAt=before['startedAt'],endedAt=before['endedAt'],
        worktreeCount=before['worktreeCount'],logicalBytes=before['worktreeLogicalBytes'],groups=dict(bg),
        mainLogicalBytes=before['mainRepositorySeparate']['logicalBytes'],worktreeIdentityBytes=opening_ids['globalIdentityBytes'],
        projectIdentityBytes=None,identityReason='开工身份采样只含工作树；主仓库未取身份before，不倒填'),
        after=dict(startedAt=after['startedAt'],endedAt=after['endedAt'],worktreeCount=after['worktreeCount'],
        logicalBytes=after['worktreeLogicalBytes'],groups=dict(ag),mainLogicalBytes=after['mainRepositorySeparate']['logicalBytes'],
        worktreeIdentityBytes=after_ids['worktreeGlobalIdentityBytes'],projectIdentityBytes=after_ids['projectGlobalIdentityBytes']),
        retainedLogicalChanges=changes,logicalRemovedBytes=post['logicalRemovedBytes'],
        volumeBefore=operation['diskBefore'],volumeAfter=operation['diskAfter'],
        volumeFreeChangeBytes=post['volumeFreeChangeBytes'],physicalNetReleasedBytes=None))
    lines = ['# M4/M5六批合入后的第三轮安全清理报告','',
        '本轮已实际回收一个完整旧工作树：第二轮 #60 的 `01a12766-4132-7d8c-a542-dcbfb2008b49`。正式 Git 退出 0，目录与登记均已不存在，逻辑长度 **3,030,837,288 B（3.031 GB）**。其余旧树逐个重核后继续保留具体保护/恢复输入，没有把宽泛“用途未知”当结论。物理净释放无法归因，记为 **null／未知**。','',
        '## 来源、授权与主线','',
        f'开工和紧邻删除分别独立调用平台只读 Git 的 `ls-remote origin refs/heads/main`，原返回均为 `{MAIN}`，时间/输入/原输出见 [开工main](remote-main-opening.json) 与 [删除前main](remote-main-cleanup-pr217.json)。没有用共享 FETCH_HEAD 或陈旧 origin/main。当前工作树从该 main 创建；原 #60 第一轮/第二轮及M4/M5历史数值均仅引用，不冒本轮测量。','',
        '原 #60 第二轮 HEAD `a27c1616ea532a39c609006ccdc4289a1641b21a` 是不可变 merge `996c940eb6c725fdfe408976ff9570997d1d5bdb` 的第二父，对应 PR217；原 branch 也已独立回读相同HEAD。全部原 reflog HEAD 主线可达。准确原会话 cwd/任务、daemon workspace/结束step、当前本卡的新branch，以及#58/#59 Done/#5 review对话共同定位，不凭Done或clean单独裁定。','',
        '继承 [原规则](../cleanup-rules.json)、[机制](../mechanism.md)、[第一轮](../report.md)、[接续](../continuation/report.md)、[第二轮](../followup/report.md)。旧5树#53–57及第二轮4树原回收不重做、不倒填缺口。本轮没有属性/ACL修改、共享store/镜像/卷/业务数据清理、容器变更、远端分支/标签删除、后台timer/daemon或tds修改。','',
        '## 先行保全与实际操作','',
        '先行预检/映射已由平台提交并推送 **`80a490bb0caf6ccc16af24bcb320b45236e4be97`**，远端准确ref独立回读同值；[推送原返回](preflight-push-receipt.json)、[固定提交绑定](preflight-binding.json)。48个先行文件逐一分列Git/Windows长度和SHA256，只接受实际字节证明的LF→CRLF。候选保全复用已合preserve/verify实现，源绑定见 source-manifest 与 supplement，不改历史源码或回执。','',
        '候选12,617个普通文件中，12,616个全为已提交文件，另1个Git管理指针；无dirty/untracked/ignored、嵌套clone、链接/junction、readonly或hardlink。逐path见 [完整映射](mapping-cleanup-pr217.json.gz)：8,881个准确Gitblob已全字节核SHA；现场6,883文件与Git字节一致，5,733文件为精确LF→CRLF，BOM/二进制属性分别保存。新增原件0；22B空ZIP仅兼容原核验接口，没有复制依赖或整树。','',
        '紧邻前刷新活动board、M4/M5/#5恢复对话、437个可见进程和全部81个容器（含停止容器）的名称/挂载，无候选引用；预检48文件运行字节无变化。原新旧任务引用不授删除保护目录权限；M4/M5容器停止与实际合入不解除恢复保护。随后独占读取并重算全部12,617文件SHA，核目录边界、HEAD/remote/status/registration/reflog/链接集合和已推送映射。','',
        '| 调用 | UTC起止 | 原退出 | 结果 |','|---|---|---:|---|']
    for r in operation['calls']:
        label = '逐文件核验' if r['input'][0] == 'python' else 'git worktree remove（准确绝对旧目录）'
        lines.append(f"| {label} | {r['startedAt']} → {r['endedAt']} | {r['exit']} | 原stdout/stderr均保存 |")
    lines += ['', '[实际操作原件](execution-cleanup-pr217.json) 与 [外层工具原返回](execution-tool-receipt.json) 分列子进程原exit和外层exit。只发一次正式 `git worktree remove`，无Force或备用工具；本候选没有链接，未执行junction收尾或递归PowerShell。失败/拒绝目标本轮为0，旧九只读门停和G1/D0/C3历史拒绝没有再次尝试。','',
        f"事后Git登记 **{post['registrationCountBefore']}→{post['registrationCountAfter']}**（含主仓库和根外保护临时worktree），每条剩余登记存在、HEAD可读，无prunable。{post['comparedProtectedPaths']:,}条有本轮开工source路径快照逐项比较，存在性变化0；无source的全历史台账仅保实际after观察，不倒填before。当前构建、主仓库、M4/M5恢复与旧九只读对象父目录另作显式核验，全部保留。见 [事后核验](postflight.json) / protected-after.json.gz。",'',
        '## 当前占用与组成','',
        f"逻辑采样before：{before['startedAt']} → {before['endedAt']}；after：{after['startedAt']} → {after['endedAt']}。不跟任何reparse/junction，普通文件长度包含hardlink名称重复；身份采样另按真实os.stat(device,inode)去重。GB=10^9 B。各采样不是停机一致快照。",'',
        '| 范围 | 开工逻辑 GB | 操作后逻辑 GB |','|---|---:|---:|',
        f"| 本项目工作树 | {before['worktreeLogicalBytes']/1e9:.9f}（{before['worktreeCount']}树） | {after['worktreeLogicalBytes']/1e9:.9f}（{after['worktreeCount']}树） |",
        f"| 主仓库/对象/管理，保护单列 | {before['mainRepositorySeparate']['logicalBytes']/1e9:.9f} | {after['mainRepositorySeparate']['logicalBytes']/1e9:.9f} |",
        f"| 合计 | {(before['worktreeLogicalBytes']+before['mainRepositorySeparate']['logicalBytes'])/1e9:.9f} | {(after['worktreeLogicalBytes']+after['mainRepositorySeparate']['logicalBytes'])/1e9:.9f} |",'',
        '| 工作树组成 | 开工 GB | 操作后 GB |','|---|---:|---:|']
    for name in bg:
        lines.append(f'| {name} | {bg[name]/1e9:.9f} | {ag[name]/1e9:.9f} |')
    lines += ['', f"工作树全局文件身份去重长度：开工 **{opening_ids['globalIdentityBytes']:,} B**，事后 **{after_ids['worktreeGlobalIdentityBytes']:,} B**；事后整个项目含主仓库跨目录去重长度 **{after_ids['projectGlobalIdentityBytes']:,} B**。主仓库开工身份基线未取，项目全局before为null；不从事后结果倒填。身份长度仍非物理占用，也没有按相同内容去重不同文件身份。",'',
        f"本次目录中约2.997GB为已合证据检出副本，另约23.195MB源码和10.521MB已提交ci-logs；没有删除旧保护依赖/缓存。逻辑总量变化与精确候选长度的差值来自本轮当前目录增长及主仓库变化，逐树变化见 composition.json，不将它们全部归因到某一种Git或系统写入。",'',
        f"C卷紧邻操作前可用 **{operation['diskBefore']['FreeSpace']:,} B**，操作后 **{operation['diskAfter']['FreeSpace']:,} B**，卷级增加 **{post['volumeFreeChangeBytes']:,} B**。共享块、NTFS分配/压缩、并发写入和系统活动无法隔离，可归因 `physicalNetReleasedBytes=null`；逻辑回收与卷变化均不冒物理净释放。",'',
        '## 剩余全部工作树与具体解除条件','',
        '以下为本轮逐树实读后的保留结论。每条精确历史source路径、当前head/status/ignored/链接/readonly/嵌套及当前任务来源可从 retention-review.json、audit-opening.json.gz、retained-directories.json追溯；并非沿用旧用途未知停止。涉及明确保护例外时，整个父树留存，不拆子文件绕过。','',
        '| workspace目录末段 / 任务 | 逻辑 GB | 身份长度 GB | 本轮保留理由 / 解除条件 |','|---|---:|---:|---|']
    for r in retained:
        name = r['path'].split('\\')[-1]
        lines.append(f"| `{name}` / #{r['todo']} | {r['logicalBytes']/1e9:.6f} | {r['identityBytes']/1e9:.6f} | {r['reason']}；解除：{r['releaseCondition']} |")
    for key in ('m5','m4'):
        data = load(OUT/f'recovery-{key}-current.json.gz')
        lines += ['', f"本轮{key.upper()}准确恢复根 `{data['path']}`：逻辑{data['logicalBytes']:,} B，身份长度{data['identityBytes']:,} B。原{key.upper()}历史样本只作来源，不能拿来冒实时物理占用；恢复原件/私有配置/首败与未映射输入保护保持，不以停止/已合整体丢弃。"]
    lines += ['', '集中例外：旧第一轮#60仍为9个精确readonly Git夹具对象（696B），影响整个2.998GB父树；本轮未改属性、未发删除，仍是准备期安全门停，不是新增自动审批拒绝。M4/M5恢复、#9/#16后续UI、#21checkpoint、#5待审及两历史dirty恢复树需逐path持久替代和准确消费解除。旧38/36/2、RAW/trace精确保留需原明确解除依据。G1/D0/C3拒绝及父目录本轮禁止重试，不请求同一许可，不把这些例外阻止已证明安全的本次回收。','',
        '## 规则触发、实际检查与关口','',
        '已合规则本轮实际触发：开工只读盘点→逐树保留理由复核→将PR217已结束旧构建登记一个精确候选→先行保全提交推送→独立main/引用/字节门禁→正式回收→操作后盘点与剩余台账。当前本轮目录在台账永久本轮保护；最终准确合入并退出后才登记未来候选，没有设timer/daemon或自动删除。','',
        f"实际检查：两次原只读盘点complete=true/扫描errors=0；5个精确路径安全拒例；Python AST/JSON/GZIP/ZIP全成员CRC解析，{validation['verifiedGitBlobs']:,}Gitblob原字节SHA与{validation['mappedRuntimeFiles']:,}运行文件变换重核，12,617执行前独占读/SHA；两份PowerShell Parser exit0；先行48文件源码绑定、实时引用、正式Git、完整登记健康与保护核验全部实跑通过。diff --check用原工具回执另保，不冒仅启动即完成。",'',
        '保留首败：首次摘要读取把dict当list造成KeyError；身份审计首版Windows DirEntry缓存inode=0触发AssertionError，改为普通文件os.stat实读后完整重跑；猜名读取两份不存在ADR及M4 resource-inventory.json如实缺失，后定位真实ADR目录/资源清单并补准确绑定。原工具JSONL物理行/输入/返回在tool-receipts-preflight及final，不重写历史退出、不将这些读取/准备失败冒自动审批拒绝或删除失败。','',
        '没有产品功能、数据库迁移、API/事件或安全策略变更；依本任务明确范围没有跑无关lint/typecheck/unit/integration/E2E。本轮平台工具未提供WorkMesh MCP，未伪造Project/WorkItem/Session操作；未新建规格/ADR/计划，实际范围沿本卡已保存spec及已合清理规则，操作证据和限制在本分支报告。','',
        '本轮尚未正式独审或取得最终新head的RequiredCI，当前分支workflow查询无run。先行提交只是保全关口，不是最终验收；旧PR216/217/M4/M5审查与CI不可证明本轮候选。不宣称已经合入main或Done，后续保持正式独审＋准确最新head RequiredCI后的条件合入路线。','',
        '在变更评审里打开本 report.md 的预览可直接阅读。按 mapping-cleanup-pr217.json.gz 的path查准确Gitblob，重算GitSHA与记录的WindowsLF/CRLF/BOM即可复核；原Windows长度/哈希已在删除前两次实核。GZIP是Python标准库可读JSON；实际操作/主线/推送原件和所有剩余解除条件均在本目录，历史report/continuation/followup未覆盖。','',
        '限制与规格差异：物理净释放未知；采样不是全机一致快照；没有全局历史恢复registry/所有OS handles；主仓库开工身份去重基线未取；剩余19个工作树包含本轮当前树及18个旧树。安全授权内的一个完整候选已实际回收，其余例外没有被宽泛授权自动放行。','']
    dest = OUT/'report.md'
    with dest.open('x',encoding='utf-8',newline='\n') as stream:
        stream.write('\n'.join(lines))
    print(dict(report=str(dest),remainingWorktrees=len(retained),logicalRemovedBytes=post['logicalRemovedBytes']))

if __name__ == '__main__':
    main()
