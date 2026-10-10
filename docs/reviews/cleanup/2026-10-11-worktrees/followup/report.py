"""依据已经结束的真实回执生成中文交付报告，不填未来检查或HEAD。"""
import collections
from common import *

def main():
    post=load(OUT/'postflight.json'); pre=load(OUT/'preflight.json')
    before=load(OUT/'usage-opening.json.gz'); after=load(OUT/'usage-after.json.gz')
    retained=load(OUT/'retained-directories.json')['rows']; receipts={r['key']:r for r in post['successReceipts']}
    binding=load(OUT/'preflight-binding.json'); blocked=load(OUT/'blocked-cleanup-old.json')
    lines=['# 旧工作树与重复构建残留接续清理报告','',
           f"本轮已实际完整回收 **4 个旧工作树，普通文件逻辑长度 {post['logicalRemovedBytes']:,} B（{post['logicalRemovedBytes']/10**9:.9f} GB / {post['logicalRemovedBytes']/2**30:.9f} GiB）**。四个正式 `git worktree remove` 均 exit0，目录和登记均不存在；原 junction 本体及普通空目录按先行声明收尾。旧 #60 在只读夹具对象门禁停止，未发删除；其它明确保护继续保留。",'',
           f"本次开工采样 22 树 {before['worktreeLogicalBytes']/10**9:.3f} GB，操作后采样 18 树 {after['worktreeLogicalBytes']/10**9:.3f} GB。**整体仍上升**：活动 #58 同期增大 4.496 GB，本轮当前交付增大约 0.026 GB；不是删除失败，也不是可归因物理释放口径。C 卷读数、目标逻辑长度与总体逻辑分别列示。",'',
           '## 来源、授权与真正主线','',
           f"当前构建：`{CURRENT}`；机器范围仅 DarkFlame 本机 WorkMesh。开工和每目标删除前分别读取真正 `refs/heads/main`，四次紧邻前均返回 `{MAIN}`；原输入/返回/UTC 范围见 `remote-main-*.json`。逐完成 HEAD、全部 HEAD reflog、依赖历史锁与成果按 immutable SHA 核可达；没有用共享 FETCH_HEAD 或 origin/main 判断。",'',
           '用户本轮新增清理指令允许处理新的精确候选；旧回合“删除已执行、不再新增删除”不约束本轮。原 G1/D0/C3 被拒精确目标及保护父目录仍禁止。四个前轮用途未映射目录已追到准确会话/任务，不能从目录年龄、Done 或 clean 推导可删。', '',
           '本轮源码/证据均位于 `docs/reviews/cleanup/2026-10-11-worktrees/followup/`。旧 [report](../report.md)、[continuation/report](../continuation/report.md)、historical/protected 来源、#53–57 原成功/缺口均原样保留，不重做、不补造。消费已合规则和只读盘点入口，未重建已移除 WORKMESH_PRD。沿本批已批准 Todos＋仓库例外记录，没有伪造 WorkMesh Project/WorkItem 或 Session 活动。','',
           '## 准确归属与实际逐目标结果','',
           '| 候选 / 任务 | 绝对目录末段 | 完成 HEAD | 逻辑 B | Git exit | junction / 空目录收尾 | 结果 |',
           '|---|---|---|---:|---:|---:|---|']
    for c in pre['candidates']:
        r=receipts[c['key']]; kinds=collections.Counter(x.get('kind') for x in r['calls'])
        junctions=sum(x.get('kind','').startswith('先行声明') for x in r['calls'])
        empties=sum(x.get('kind','').startswith('已证明普通空目录') for x in r['calls'])
        git_exit=next(x['exit'] for x in r['calls'] if x['input'][0]=='git')
        lines.append(f"| {c['key']} / #{c['todo']} | `{Path(c['path']).name}` | `{c['head']}` | {c['logicalBytes']:,} | {git_exit} | {junctions} / {empties} | 完整移除，目录/登记不存在 |")
    lines += ['',f'上述目录均位于 `{ROOT}`。两个早期 G1 位于 `01a115ed…` / `01a11661…`，与原被拒 G1 的 `01a116f7…` 父目录及其子目标无保护交叉；没有通过换目录名称绕拒绝。', '',
              'build-provenance.json 保存最小会话 metadata（cwd/git/时间）、原任务全文及 daemon workspace/step 安全原行/行号/哈希，定位前两树为 #18 G1 早期规划/构建，后两树为 #31 升级的两次构建。当前 todo 元数据、结束/恢复对话和 Git 祖先链共同确认用途；旧任务正文只用于定位，不能代当前授权。g1-plan 是 PR194 第二父；g1-build 是主线可达早期 checkpoint，其旧远端分支当前无返回，不把缺失 ref 当删除理由。两升级树 HEAD 本来就是 PR204 主线，未新增产品成果 PR；#31 当前 done 与原结束记录另存。', '',
              f"先行预检和保全 **已提交并成功推送 `{binding['commit']}`**，远端分支已回读该完整 SHA。原 push 输入/返回和 JSONL 物理行见 preflight-push-receipt.json / tool-receipts-preflight-pushed.json.gz。57 个先行文件全部绑定；6 个文本 Git→Windows LF/CRLF 变换逐字节证明，ZIP/GZIP 全部原字节相同。执行时再按准确提交重读 mapping/ZIP 与现场逐字节核对。",'',
              'execution-*、operation-journal-*、verification-*、residual-* 保存完整实际调用、输入/输出、UTC、原退出码/每目标结果及磁盘读数。Git/Python/外层工具真实 exit 与 PowerShell cmdlet 归一结果分列：Remove-Item 的 0/1 是即时成功/终止异常，没有独立 OS 进程 exit。每次只有一个固定候选；旧成功不重复调用，旧停止/拒绝不重试。', '',
              '## 逐文件保全、链接与共享边界','',
              '4 份 mapping 共 **108,906 个普通文件**，逐 path 保长度、Windows SHA、属性/nlink/fileId、准确 Git blob 或 ZIP member、或已证历史锁/逐包 metadata/源码构建输入。8,909 个 Git blob 实际原字节另列；Git 与运行字节、LF/CRLF/混合换行/BOM 分列。7 个 tracked 混合换行现场变体另保 ZIP 原件，不以 clean status 声称字节相同。所有用于放行的新 ZIP 成员已完整读回核 CRC/SHA。', '',
              '必要新增可执行候选档案 **485,161 B**。177 个新证据独立 hash 与已合 148,513 ZIP 成员索引及本轮 Git 原字节核查均无匹配，见 reuse-review.json；tracked 源码/文档直接复用 Git，不复制整树或依赖。准备期 empty/partial ZIP 和停止目标的中途档案仍保原件，明确不用于放行；旧四份坏 ZIP 保历史，不从它们虚构可用成员。', '',
              '两个 G1 各 609 个安装包 metadata 绑定实际主线可达历史锁，packageManager 为 pnpm9.15.4；每依赖文件仍保原长度/哈希，生成 shim、virtual store 和构建输出只承诺功能性重建，不承诺缓存时间/绝对路径/非确定字节重现。X:\\packages\\.pnpm-store\\v3 是原安装来源配置，未遍历或删除共享 store。`.turbo` 输出、实际 trace/安装输入另保全。', '',
              '四个候选全部普通文件 nlink=1、readonly=0。两个 G1 合计 3,836 个 junction，解析目标全在各自树内，原 reparse buffer/tag/hash 持久保存；两个升级树无链接。实际 Git/PowerShell 版本与已合本机链接 fixture 相同，git.exe SHA 亦吻合原证据。只有 Git 正式成功、残留普通文件/新 clone 为0且仅原 junction 时，才非递归 LiteralPath unlink 本体并删除逐项已证空目录。未跟链接、未发属性/ACL修改或Force命令、未触共享资源。', '',
              '每个删除前刷新 board、#58/#5 当前恢复对话、可见进程/执行路径，以及所有容器（包括停止容器）的名称/挂载。容器数量在 77–84 间正常变化，各目标引用命中0；未读取 Env、停止或清理 Docker。没有全局历史 build/recovery registry 或全部 OS handles；该边界如实披露，不能用此次已定位四树的联合证明放行其它未知或明确保护目标。', '',
              '## 本轮停止目标与具体例外','',
              f"旧 #60：`{blocked['path']}`，最终 HEAD `8fe64ea658c852267d8f443dff14a4fac94b9e92`，PR216 第二父且主线可达；普通文件逻辑 {blocked['logicalBytes']:,} B。三个受控链接夹具裸仓库已独立检查（原 refs/HEAD 返回照存），但遇到 **9 个只读 Git object，共696 B**，逐 path/属性/哈希见 blocked-cleanup-old.json。",'',
              '这是本轮准备期安全门失败，**不是自动审批拒绝，也不是已尝试删除失败**。整个目录保留，现场完整保全未通过，不把主线成果可达冒成全部现场均保全。原同版 Git mingw_unlink 存在首次删除失败后 _wchmod 分支，见 readonly-boundary.json 的主线原源码绑定；当前没有这些只读对象必然不经属性调整分支的证明。未手动改属性，未发正式删除，不通过父删/拆批/换工具绕过。', '',
              '建议后续仅对这9个夹具对象的属性处理边界作精确裁定，影响范围为整个旧 #60 约2.998 GB；裁定前保持停止。即使后续允许，也须先补完整必要现场保全、推送和全部实时门禁，不能自动扩到原 G1/D0/C3 拒绝或其它只读/保护目标。', '',
              '## 全部占用、组成与卷空间','',
              f"采样区间：before {before['startedAt']} → {before['endedAt']}；after {after['startedAt']} → {after['endedAt']}。不跟链接，普通文件逻辑长度含 hardlink 重复计数；活动采样不是停止全机的一致快照。GB=10^9 B，GiB=2^30 B。",'',
              '| 范围 | 开工逻辑 GB | 操作后逻辑 GB |', '|---|---:|---:|',
              f"| 本项目工作树 | {before['worktreeLogicalBytes']/10**9:.9f}（22树） | {after['worktreeLogicalBytes']/10**9:.9f}（18树） |",
              f"| 主仓库及 Git 管理/对象，单列保护 | {before['mainRepositorySeparate']['logicalBytes']/10**9:.9f} | {after['mainRepositorySeparate']['logicalBytes']/10**9:.9f} |",
              f"| 合计 | {(before['worktreeLogicalBytes']+before['mainRepositorySeparate']['logicalBytes'])/10**9:.9f} | {(after['worktreeLogicalBytes']+after['mainRepositorySeparate']['logicalBytes'])/10**9:.9f} |",'',
              '用户之前“42G以上”及前轮30.816GB是历史口径，本轮不冒为用户实时测量。此次已删四树与总体仍增加同时成立，详细增长对账见 postflight.json 的 retainedLogicalChanges：#58 +4,495,903,196 B，当前清理交付 +26,375,145 B；其它保留树此次采样未变化。主仓库 +12,243,670 B，不能全部归因本次保全；操作后后续新增报告/索引及活动继续写入也不倒填进该采样。', '',
              '| 工作树组成 | 开工 GB | 操作后 GB |','|---|---:|---:|']
    groups_before=collections.Counter(); groups_after=collections.Counter()
    for r in before['rows']:
        for k,v in r['groups'].items(): groups_before[k]+=v['logicalBytes']
    for r in after['rows']:
        for k,v in r['groups'].items(): groups_after[k]+=v['logicalBytes']
    for k in groups_before: lines.append(f'| {k} | {groups_before[k]/10**9:.6f} | {groups_after[k]/10**9:.6f} |')
    lines += ['', '| 目标 | 紧邻前 C:可用 B | 紧邻后 C:可用 B | 卷级变化 B |','|---|---:|---:|---:|']
    for c in pre['candidates']:
        r=receipts[c['key']]; a=int(r['diskBefore']['FreeSpace']); b=int(r['diskAfter']['FreeSpace'])
        lines.append(f"| {c['key']} | {a:,} | {b:,} | {b-a:+,} |")
    first=receipts['g1-plan']; last=receipts['upgrade-final']; delta=int(last['diskAfter']['FreeSpace'])-int(first['diskBefore']['FreeSpace'])
    lines += ['',f'首目标紧邻前至末目标紧邻后，卷级可用空间实测 **{delta:+,} B**；该值不是可归因物理净释放。活动#58、对象/证据写入、NTFS分配/压缩/共享块及其它系统活动会影响读数，**physicalNetReleasedBytes=null**。不把2.106GB逻辑长度或上述卷变化冒成净释放。', '',
              '## 剩余工作树与可解除条件','',
              '本机 Git 登记 24→20（包含主仓库及根外保护临时 worktree），其余登记均存在、HEAD可读、无prunable。继承原精确保护清单，本轮5210项路径观察逐项对比，其中5181项有历史source指针；预期消失仅四个无source的新候选根，其余存在性差异0。原缺失仍记缺失，不补造历史删除。活动#58的HEAD允许采样期间正常推进，非清理损坏。', '',
              '| 剩余目录末段 / 任务 | 逻辑 GB | 当前保留理由 | 解除条件 |', '|---|---:|---|---|']
    for r in retained:
        lines.append(f"| `{Path(r['path']).name}` / #{r['todo']} | {r['logicalBytes']/10**9:.6f} | {r['reason']} | {r['releaseCondition']} |")
    lines += ['',
              '完整逐树组成、head、保留原因与准确旧 source 指针见 retained-directories.json / retention-review.json / protected-opening/after.json；#9/#16/#8/#21/#5 当前 todo/恢复资料已补读归档。原38 node_modules/36 .turbo/2typecache、RAW/原trace/未映射验收输入等仍需精确保留例外，不能将 Done/closed 或新UI方向当解除。#52含原拒绝审计原件也保留。', '',
              '## 检查、首败与关口','',
              '实际检查：六个只读安全门负例通过；Python AST、两个 PowerShell Parser 通过；JSON/JSONL/GZIP解析、四个完整保全ZIP的CRC/逐成员SHA、57先行文件Git/Windows绑定、108906文件执行紧邻前独占读取/哈希、3836原junction本体、四个正式Git与收尾、登记健康/保护存在性和完整盘点均实跑。最终 validation.json、powershell-validation.json 与 evidence-index.json 保存实际结果和staged blob/运行字节；提交前 diff --cached --check 另实跑，原工具输入/返回/exit见 tool-receipts-*.json.gz。', '',
              '首败保持：混合换行首次保全断言失败；第二版重复解析ignored全表过慢，仅终止本人精确准备进程；一次PowerShell转写引号解析失败；旧#60只读对象保全门禁失败；最初identity提交绑定拒绝执行器的LF→CRLF工作区变换，后用固定57提交文件集合与双哈希证明。原输入源、partial档案、真实Python exit1/进程终止/外层工具返回分列，不覆盖、不倒填，不用于放行。', '',
              '未改产品功能、数据库迁移、API/事件、tds守护进程或用户配置；按本任务明确范围未跑无关lint/typecheck/unit/integration/E2E。当前查询本轮分支workflow_runs返回No runs，不借旧PR216/CI421独审与绿色证明新候选；最终精确提交的独审、最新RequiredCI和合入仍是后续关口。此报告不宣称本轮已合入main。', '',
              '## 机制实际触发与阅读演示','',
              '沿已合 mechanism.md / cleanup-rules.json 本轮实际触发开工盘点、逐候选保全/主线与活动门禁、四个回收和操作后盘点；规则、触发与实际回收分列。当前构建和停止目标留在台账，未来真实合入/结束后仍先核保全与活动/恢复引用；没有新增timer、后台daemon、固定频率或修改平台清理服务。', '',
              '在变更评审中打开本report.md的预览即可阅读。任选 mapping-g1-plan.json.gz 的path，以准确Gitblob或ZIP/member重算对应SHA；GZIP用Python标准库解压JSON。execution/operation-journal与verification/residual可逐调用追踪实际exit，retained清单可追到历史source。所有交付在本分支受控followup目录，未发送文件或外发资料。', '',
              '规格差异/限制：旧#60因明确只读门禁未回收，原保护例外未解除；物理净释放未知；活动盘点非一致快照；平台全局历史恢复registry/全部OS handles不可得。其余本轮授权安全清理已实际完成，没有把研究报告代替执行。']
    assert not (OUT/'report.md').exists()
    (OUT/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print({'reportLines':len(lines),'successes':len(receipts),'afterWorktreeGB':after['worktreeLogicalBytes']/10**9,'volumeDeltaBytes':delta})

if __name__ == '__main__':
    main()
