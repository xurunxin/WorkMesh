"""仅由已完成原回执生成中文收尾报告；没有执行的操作不记作成功。"""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import collections
import json
import audit

a, OUT = audit.a, audit.OUT


def gb(value):
    return f'{value / 10**9:.6f}'


def main():
    before = a.load(OUT / 'usage-opening.json.gz')
    after = a.load(OUT / 'usage-after.json.gz')
    final = a.load(OUT / 'audit-after.json.gz')
    plan = a.load(OUT / 'execution-plan.json')
    proof = a.load(OUT / 'preservation-verification.json')
    binding = a.load(OUT / 'preflight-binding.json')
    containers_plan = a.load(OUT / 'containers-plan.json')
    receipts = final['results']
    removed = [r for r in receipts if r['success']]
    failed = [r for r in receipts if not r['success']]
    text = [
        '# 15:05 全清裁定后的实际回收与重建规则',
        '',
        f'生成时间：{a.utc()}。本轮在原会话分支接续执行；旧 `1266d651cc9760b20a6a83aba5ce3a0a7d7e2b78` 独审仅覆盖上一轮。新增预检和保全提交为 `{binding["commit"]}`，推送原件见 [preflight-push-receipt.json](preflight-push-receipt.json)，远端回读及52项 Git/Windows 字节绑定见 [preflight-binding.json](preflight-binding.json)。所有新增现场删除均在该推送和绑定完成后发生。',
        '',
        '用户15:05原话：“可以完全清理，后续待开始项目，重新拉取代码重新建立环境开始，这次建立环境注意尽可能复用共享部分内容，减少空间的重复占用”。本次不再仅因待开始、待审、checkpoint 或未来恢复而保留完整旧环境；先保存必要独有成果，再收尾准确旧现场。清理不等于接受、取消或完成未验收业务。',
        '',
        '用户17:06要求本轮结束后暂停后续推进，随后要求实际提交成果便于换机部署。远端获取、必要保全入口、当地工具/store选择、依赖准备和源码容器部署步骤见 [handoff.md](handoff.md)，跨机器只读计划见 [new-machine-plan.py](new-machine-plan.py)。本机绝对路径和可移植用法、已验证与未验证范围分列；本轮不配置新机器或迁移秘密。完成本轮独审及准确最新RequiredCI后的条件合入后，停止推进，等待用户换机接入并明确恢复。',
        '',
        f'实际完整回收 **{len(removed)} 个旧工作树，{sum(r["logicalBytes"] for r in removed):,} B（{gb(sum(r["logicalBytes"] for r in removed))} GB）目标逻辑长度**。工作树 {before["worktreeCount"]}→{after["worktreeCount"]}。实际失败/停止目标 {len(failed)} 个。原第三轮已删的 `01a12766` 及更早成功清单不重复执行或计入本轮释放。',
        '',
        f'本人精确测试容器完成收尾 {sum(not r["error"] for r in final["containers"]["receipts"])} 个；逐容器及其独占卷结果见下表。共享镜像和原 store 保留。**物理净释放 `null`（未知）**；逻辑长度、身份去重长度及卷可用变化分别报告，不能相互代替。',
        '',
        '## 原始来源和执行顺序',
        '',
        '历史材料仅引用，不覆盖：[原报告](../../report.md)、[原机制](../../mechanism.md)、[continuation](../../continuation/report.md)、[followup](../../followup/report.md)、[第三轮](../report.md)。当前用户裁定写入 [cleanup-rules.json](../../cleanup-rules.json)，永久拒绝与九只读自设门分别登记。',
        '',
        '1. [usage-opening.json.gz](usage-opening.json.gz) 使用已合只读入口刷新范围和组成；[audit-opening.json.gz](audit-opening.json.gz) 实读普通文件身份，不跟 junction/reparse；[activity-opening.json](activity-opening.json) 不保存进程命令正文或容器 Env。',
        '2. [remote-opening.json](remote-opening.json) 与 [remote-preflight.json](remote-preflight.json) 独立调用真正远端 `refs/heads/main`。本次实际返回为 `6a06ce338f90bf16ce27e3cca1a76771eba42e6e`；历史 Chief 快照和共享 FETCH_HEAD 均不作判断来源。每个删除另有 `remote-before-<UUID>.json` 原返回及可得起止时间。',
        '3. 先完成每个 `final-mapping-<UUID>.json.gz`、[unique-final-sanitized.zip](unique-final-sanitized.zip)、[execution-plan.json](execution-plan.json)，提交推送并核不可变 Git blob/运行字节。随后 [verify-target.py](verify-target.py) 刷新 head/status、源分支、活动/挂载、全部文件 SHA256/身份/mtime/属性和原链接字节。每目标 `verification-<UUID>.json` 是删除前实际门禁。',
        '4. [execute-target.ps1](execute-target.ps1) 使用正式 `git worktree remove`。两个 dirty 旧树和含已保全嵌套夹具的旧第一#60，预检中明确声明初次 `--force`；它不用于任何原系统拒绝目标，也不是首败后换参数重试。Git 成功后仅按预先声明的 [residual-check.py](residual-check.py) 零普通文件证明，非递归删除准确链接本体与普通空目录。目标首败即停，不拆文件绕过拒绝。',
        '5. 子进程原 exitCode 和 cmdlet normalizedOutcome/nativeExitCode=null 分列。没有原时间/退出码的历史记录如实缺失。`execution-<UUID>.json` 保存完整输入、输出、时间、链接/空目录操作和前后C卷值；收尾 [audit-after.json.gz](audit-after.json.gz) 再次核目录/登记不存在和保护父目录。',
        '',
        '## 必要独有成果与重建映射',
        '',
        '[preservation-verification.json](preservation-verification.json) 是最终逐源解析结果；[gap-resolution.json](gap-resolution.json) 记录初始13个缺口的实际解决方式。每个路径记录 Windows 长度/SHA256、device/fileId/nlink/mtime/属性，以及准确 Git blob、已有 ZIP member、新脱敏 member 或已验证的锁/脚本/公共安装/CAS 重建输入。Git 对象与 Windows CRLF/BOM/二进制字节分别核，不把换行等价冒原字节相等。staged/index、dirty 独有代码、checkpoint 均有恢复来源。',
        '',
        '最终新增 ZIP 仅保必要独有原件：26,189,270 B、1,330 个成员，全量 CRC、长度和 SHA256 已核；不复制整树、全依赖、native EXE 或秘密 DB。实际秘密值在私有环境读取后仅用于脱敏核验，不输出或归档；63项脱敏变换保哈希/结构来源。早期未发布 mapping/ZIP 与失败中间产物已经在当前证据目录内精确退役，见 [intermediate-publication-retirement.json](intermediate-publication-retirement.json) 和 [intermediate-finalizer-retirement.json](intermediate-finalizer-retirement.json)；初始 preservation-summary 不是最终删除门禁。',
        '',
        '具体例外：D1a 两份 RAW ZIP 已全量核491成员/CRC，复用原已合脱敏 ZIP 和精确历史转换来源，不发布 RAW。#16旧 zod3.24.3 的52个普通文件实核现有共享 CAS 的准确内容地址。M5 stale PYC 与当前源码编译结果不相同，未冒可重建同字节；经 Python3.13格式、完整 marshal 和递归常量/秘密核验后，仅保其小型原件 member，不执行旧字节码。',
        '',
        '既有 Git 中5个 ZIP 原字节不是有效 ZIP，catalog 记录 crcVerified=false，未用于任何成员映射：M0 contracts-typecheck-inputs、M1 integration-final-inputs/lint-final-inputs/wait-ddl-first-inputs，以及 followup/additional-g1-plan-2。这些历史原字节仍可由准确 Git blob 恢复；本轮不修历史、不声称其原 CRC 通过。其余810份有效已有 ZIP 的成员来源及新增 ZIP 均真实核 CRC。',
        '',
        '## 每个旧工作树的实际结果',
        '',
        '下表 UUID 均以 `C:\\Users\\xurx\\.tds\\workspaces\\` 为绝对父目录；每个目标另有对应 final-mapping、remote-before、verification、execution 原件。',
        '',
        '| UUID | 预检逻辑 B | 实际结果 |',
        '|---|---:|---|',
    ]
    for r in receipts:
        text.append(f'| `{r["key"]}` | {r["logicalBytes"]:,} | {r["result"]}' + (f'；{r["error"]}' if r['error'] else '') + ' |')
    text += ['', '旧第一#60的九个 Git fixture readonly 对象合计696 B，见 [readonly-exception.json](readonly-exception.json)。原属性/身份与精确保全 member 已先核；实际清除 ReadOnly 位的方法和每路径前后属性均保在其 execution 回执。该自设门与 G1/D0/C3 的系统拒绝完全分列，没有改 ACL 或对拒绝目标调用删除。', '', '## 清理前后占用', '', '| 范围/指标 | 开工 B | 收尾 B |', '|---|---:|---:|']
    main_before, main_after = before['mainRepositorySeparate']['logicalBytes'], after['mainRepositorySeparate']['logicalBytes']
    registered_before=sum(line.startswith('worktree ') for line in before['registration']['stdout'].splitlines())
    registered_after=sum(line.startswith('worktree ') for line in after['registration']['stdout'].splitlines())
    text.append(f'| Git全登记数（含主仓库与既有外部Temp） | {registered_before} | {registered_after} |')
    for label, left, right in (
        ('本项目工作树逻辑',before['worktreeLogicalBytes'],after['worktreeLogicalBytes']),
        ('主仓库独立逻辑',main_before,main_after),
        ('二者逻辑合计',before['worktreeLogicalBytes']+main_before,after['worktreeLogicalBytes']+main_after),
        ('工作树普通文件身份去重长度',final['openingWorktreeIdentityBytes'],final['worktreeIdentityBytes']),
        ('工作树＋主仓库跨目录身份去重长度',None,final['worktreesAndMainIdentityBytes']),
        ('C卷可用空间',final['volumeFreeBytes']['openingC'],final['volumeFreeBytes']['afterC'])):
        text.append(f'| {label} | {left:,}' if left is not None else f'| {label} | 未采集，不倒填')
        text[-1] += f' | {right:,} |'
    text += ['', f'C卷可用差值为 {final["volumeFreeBytes"]["afterC"]-final["volumeFreeBytes"]["openingC"]:,} B；同时存在其他项目/当前构建写入、shared hardlink、Docker卷虚拟存储等因素，不作可归因物理释放。主仓库增长包含平台推送新增 Git 对象，不属于被删除范围。收尾 X卷可用 {final["volumeFreeBytes"]["afterX"]:,} B，无开工X基线，差值未知。身份去重长度也不是文件系统分配长度。', '', '| 工作树组成 | 开工 B | 收尾 B |', '|---|---:|---:|']
    totals = []
    for sample in (before, after):
        counter = collections.Counter()
        for row in sample['rows']:
            for key, value in row['groups'].items():
                counter[key] += value['logicalBytes']
        totals.append(counter)
    for key in sorted(totals[0].keys() | totals[1].keys()):
        text.append(f'| {key} | {totals[0][key]:,} | {totals[1][key]:,} |')
    text += ['', '采样并非同一时刻快照；报告/回执继续写入当前树，后续提交与Git对象增长会改变收尾值。原 JSON 的 startedAt/endedAt 才是对应测量时间。不同采样差值不替代逐目标实际回收长度。', '', '## 所有剩余工作树及解除条件', '', '| 完整 UUID | 收尾逻辑 B | 保留的准确原因与解除条件 |', '|---|---:|---|']
    for row in final['rows']:
        key = Path(row['path']).name
        if key in audit.DENIED:
            reason = audit.DENIED[key] + '；真实系统策略拒绝，本轮禁止重试/父删/换法；须有对准确目标有效的新系统授权，独审或泛全清不能解除'
        elif key == audit.CURRENT.name:
            reason = '本轮当前构建与审计依据；本轮准确新head独审/RequiredCI及合入后，再刷新活动和引用作独立候选'
        else:
            reason = row['reason'] + '；见对应实际错误，不把未删除算成功'
        text.append(f'| `{key}` | {row["scan"]["logicalBytes"]:,} | {reason} |')
    text += ['', f'四个原拒保护父目录逐文件身份/长度/属性、链接、head/status 对照 {sum(p["files"] for p in final["protectedChecks"]):,} 条普通文件均一致，差异零。主仓库、workspace根、其他项目、用户配置、原 pnpm store、公共工具和远端分支/标签均不是删除候选。既有外部 Temp/G1 验证登记仅核 Git登记，不遍历/清理。', '', '当前验证形成的X卷专属环境另外列出，属于本轮构建，不能偷偷计入旧树回收：', '', '| 精确 task virtual store | 逻辑 B | 文件身份去重 B | 条件 |', '|---|---:|---:|---|']
    for row in final['privateCurrentTestEnvironments']:
        text.append(f'| `{row["path"]}` | {row["scan"]["logicalBytes"]:,} | {row["scan"]["identityBytes"]:,} | {row["reason"]} |')
    text += ['', '首次单包试验误继承整个19-package workspace，已终止并保4294967295真实退出；609包下载数为0，当前入口/专属 virtual store 留在当前构建清单。源码和根锁未改；后续单包隔离试验已修，未把首次失败或当前新副本冒成旧环境释放。', '', '## 容器、卷与共享镜像', '', '| 原精确容器 ID / 名称 | 卷 | 实际结果 |', '|---|---|---|']
    by_id = {r['target']:r for r in final['containers']['receipts']}
    for t in containers_plan['targets']:
        r = by_id[t['id']]
        text.append(f'| `{t["id"]}` / `{t["name"]}` | ' + '<br>'.join('`'+v+'`' for v in t['volumes']) + f' | {r["result"]}' + (f'；{r["error"]}' if r['error'] else '') + ' |')
    text += ['', '六目标来源为 main 可达 M4 execution/resources.json 和 M5 product-cleanup.json 的准确 immutable ID/名称/镜像/独占卷；[containers-plan.json](containers-plan.json) 含开工消费者和卷元数据，[containers-execution.json](containers-execution.json) 与逐容器回执含执行前重新核验、真实 docker exit、不存在后验和共享镜像存在后验。无 Force、prune 或镜像删除。', '', '以下名称虽似本项目，未找到准确原 container ID→任务 owner/数据重建账本，或属于默认 compose 业务数据，不凭 stopped/名称删除。需给出精确 owner 和必要数据/独占消费者来源后，才能作为独立候选；不得全局清卷。', '', '| 未能清理的精确 ID / 名称 | 当前状态 | 挂载卷 | 原因 |', '|---|---|---|---|']
    # 完整调查记录独立列出，不能以未找到一份 registry 便泛判所有旧容器无用。
    text.insert(len(text)-2,'准确调查见 [remaining-container-ownership-complete.json](remaining-container-ownership-complete.json)：471份相关文本和原 raw-checks ZIP 全38成员/CRC。39个r1 ID共117处命中仅在C1/M1其它任务观察中；原R1环境/服务日志未绑定原创建ID、owner及卷的数据用途。另核平台最新R1构建聊天，未取得原创建ID账本，见 [remaining-container-platform-source.json](remaining-container-platform-source.json)；不把最新聊天无ID冒全部历史无原件。默认compose另由实际label定位 G:/S:/Projects/MetronX/WorkMesh，属于工作区外业务数据，不扩清理范围。\n')
    current_containers = {c['id']:c for c in a.load(OUT/'activity-after.json')['containers']}
    for old in containers_plan['remainingProjectNamed']:
        c = current_containers.get(old['id'])
        if not c:
            text.append(f'| `{old["id"]}` / `{old["name"]}` | 收尾未见，非本轮删除 | 原记录见plan | 外部变化，不认领回收 |')
            continue
        vols = [m.get('Name',m.get('Source','')) for m in c['mounts']]
        text.append(f'| `{c["id"]}` / `{c["name"]}` | {c["state"]["Status"]} | ' + '<br>'.join('`'+v+'`' for v in vols) + ' | ' + ('默认 compose 业务数据未授权' if c['name'].startswith('/workmesh-') else '缺精确原ID/owner及数据重建来源') + ' |')
    text += ['', f'其他项目容器未调用删除；独立前后对照有 {len(final["containers"]["otherContainerChanges"])} 个名称/挂载/镜像或缺失变化、新增 {len(final["containers"]["newOtherContainers"])} 个，详见 audit-after。活动消费者动态变化不归因本次清理。公共 native 安装字节/身份与 CAS 样本字节未变；native nlink {final["sharedNative"]["nlinkBefore"]}→{final["sharedNative"]["nlinkAfter"]} 仅另列，不冒物理释放。', '', '## 已落实的前景重建和防膨胀入口', '', '[rebuild-rules.md](rebuild-rules.md) 给出开工、共享/隔离、准确重建及结束规则；[rebuild-environment.py](rebuild-environment.py) 提供 plan/install/thin/hydrate/finish-plan。plan 实核当前会话/remote、pnpm9.15.4已有可执行文件、X卷现有v3 CAS、锁hash和专属virtual store；install 使用 offline/frozen/ignore-scripts/copy，不下载或改公共配置。结束先保全，登记准确 workspace＋owner/锁绑定的私有virtual store，再前景收尾。没有 timer/daemon，也没有自动启动待办业务。', '', '单包离线 copy 真实 exit=0、downloaded=0、锁不变、任务文件nlink=1/身份不同，实际改写任务副本未影响 CAS，见 [rebuild-verification-copy-isolation.json](rebuild-verification-copy-isolation.json)。此前 clone-or-copy 实测与 CAS 同身份 hardlink，原件保留并据此选择 copy。共享下载/CAS与公共工具/镜像已能复用；必要私有安装副本仍存在，未承诺所有包字节零复制。', '', '大型历史证据薄检出入口要求已启用 extensions.worktreeConfig；本机目前未启用，安全门先停，未改平台主仓库配置。不能把文档建议冒成平台自动稀疏检出已生效；当前可用的是定位现有工具/store、前景离线安装、可变状态隔离及收尾登记。未重建完整后续业务环境或跑业务验收。', '', '## 实际验证、失败与合入关口', '', '本轮跑适当的保全解析、源码绑定、ZIP/Windows字节核验、逐目标盘点与操作后验、共享重建单包入口、Python/PowerShell语法和 git diff --check；没有把无关产品全套冒作本轮验证。最终检测原结果另在 final-verification.json 和 tool-receipts-ending.json.gz。', '', '准备过程首败（Docker函数名遮蔽/可执行列表、历史无效ZIP断言、stale PYC编译不相等、初次保全解析漏放index分类）均在实际原调用中保留；只读耗时进程的终止和一次shell尾部命令掩盖前子进程状态明确区别，不倒填原exit。它们不是系统自动删除审批拒绝，也未作为成功门禁。修订后独立解析实际通过才进行预检推送与现场删除。', '', '本轮新增成果仍须重新独审、blocking/high闭合及准确最终head自己的最新 RequiredCI。旧1266审查与CI不能证明本次新增删除/共享入口；本报告不宣称已合入。最终head与实时CI查询保在本轮回复/平台记录；合入后本轮工作树仅登记为未来独立候选，本轮不删除自身。', '']
    hardlink=a.load(OUT/'hardlink-source-binding.json')
    text.insert(text.index('## 必要独有成果与重建映射'),
        f'追加身份门禁先提交推送 `{hardlink["commit"]}`，原返回/远端回读见 [hardlink-push-receipt.json](hardlink-push-receipt.json)，源码/政策绑定见 [hardlink-source-binding.json](hardlink-source-binding.json)。M5的24份与M4的17份派生EXE共用公共native同一身份、开工nlink=44。后目标只扣已证明完整回收的本轮精确路径数；其它nlink漂移仍停，字节/属性/mtime/独占打开不放宽。此链接数变化不能记作native公共本体的物理释放。\n')
    if (OUT/'gate-resume-decision.json').exists():
        text.insert(text.index('## 每个旧工作树的实际结果'),
            '一次活动安全门暂停原件完整保留，未派发Git删除：原命中pwsh PID34632与本轮并发只读查看时间重叠，原命令行未记录不倒填。消费者已退出后，另存新的完整预检/推送/源码绑定，才首次派发该目标的正式删除；见 [gate-resume-decision.json](gate-resume-decision.json)、[gate-resume-source-binding.json](gate-resume-source-binding.json)及两个execution原件。这不是重试原生删除失败或系统拒绝，原暂停回执没有被覆盖。\n')
    text += ['规则实际触发分列：本轮开工只读盘点已执行，旧环境回收按逐目标原件实际执行；本轮自身尚未合入，合入后触发未发生，只登记为受保护的后续候选，见 current-lifecycle-registration.json。',
        '本轮不改产品源码、数据库迁移、API或事件；交付和条件合入完成后暂停后续任务，等待换机并明确恢复，不自动追加下一轮。\n']
    destination = OUT / 'report.md'
    with destination.open('x',encoding='utf-8',newline='\n') as stream:
        stream.write('\n'.join(text))
    print(json.dumps(dict(report=str(destination),removed=len(removed),failed=len(failed),preservationProof=proof.get('success'))))


if __name__ == '__main__':
    main()
