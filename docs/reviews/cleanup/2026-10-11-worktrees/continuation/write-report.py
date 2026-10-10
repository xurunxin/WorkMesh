"""从持久原回执生成中文结果报告，不填造未发生的删除或归因空间。"""
import sys
sys.dont_write_bytecode = True
import collections
import gzip
import json
import re
from pathlib import Path
from audit import OUT, CURRENT, utc, write

def load(name):
    p = OUT / name
    return json.loads(gzip.decompress(p.read_bytes())) if name.endswith('.gz') else json.loads(p.read_text(encoding='utf-8-sig'))

def gb(n):
    return f'{n/10**9:.3f}'

def main():
    pre = load('preflight.json')
    post = load('postflight.json')
    before, after = load('usage-before.json.gz'), load('usage-after.json.gz')
    results = post['results']
    successful = [r for r in results if r.get('executed') and not r.get('targetExists', True) and not r.get('error')]
    by_todo = {r['todo']: r for r in results}
    logical = sum(c['logicalBytes'] for c in pre['candidates'] if c['todo'] in {r['todo'] for r in successful})
    first, last = load('execution-54.json'), load('execution-57.json')
    window = int(last['diskAfter']['FreeSpace']) - int(first['diskBefore']['FreeSpace'])
    groups_before, groups_after = collections.Counter(), collections.Counter()
    for data, counter in [(before, groups_before), (after, groups_after)]:
        for row in data['rows']:
            for k, v in row['groups'].items():
                counter[k] += v['logicalBytes']
    binding = load('preflight-commit-binding.json')
    lines = ['# 2026-10-11 #54–57 工作树安全清理接续报告', '',
             f'本接续新增完整回收 **{len(successful)} 个工作树**，普通文件逻辑长度 **{logical:,} B（{gb(logical)} GB / {logical/2**30:.3f} GiB）**。每个正式 Git 移除实际 exit 为 0，目录和登记已不存在，本地分支保留。#53 的原删除、151,693,775 B 逻辑长度、28→27 登记和原回执保持，**没有重做**；其原报告见 [../report.md](../report.md)。', '',
             '用户最新原话：『目前整体工作树占用了42G以上的空间，目前在执行的任务只有1个，正常应该不会有这么多文件残留，注意设定好清理机制，避免磁盘占用不断膨胀』。整体口径和大目录组成已实测，持续机制见 [../mechanism.md](../mechanism.md)、[../cleanup-rules.json](../cleanup-rules.json)、[../usage-inventory.py](../usage-inventory.py)。实现为可复用只读盘点、收尾规则及本轮实际安全执行；没有注册定时任务或修改 tds/平台 daemon，不声称它会自动删除。', '',
             '## 逐候选成果、主线与实际操作', '', '| todo / PR | 完成 HEAD | 删除前逻辑 B | 正式 Git exit | junction 本体 / 普通空目录收尾 | 实际结果 |', '|---|---|---:|---:|---:|---|']
    for c in pre['candidates']:
        r = by_todo[c['todo']]
        exits = ','.join(str(g['exit']) for g in r.get('gitCalls', []))
        lines.append(f"| #{c['todo']} / [PR{c['pr']}](https://github.com/xurunxin/WorkMesh/pull/{c['pr']}) | `{c['head']}` | {c['logicalBytes']:,} | {exits} | {r.get('junctionBodiesRemoved',0)} / {r.get('ordinaryEmptyDirectoriesRemoved',0)} | {r.get('result','未执行')} |")
    lines += ['', f'先行预检及全部新增保全 ZIP/GZIP 已提交并推送为 `{binding["commit"]}`。preflight-push-receipt.json 保存原提交返回；preflight-commit-binding.json 对 71 个先行交付文件分列 Git/Windows 原字节，ZIP/GZIP 全部逐字节一致，提交范围 main→head diff --check exit0。新档案中的 pending-preflight-commit 通过该 commit:path→blob 精确解析，非共享 FETCH_HEAD。', '',
              'remote-completion-heads.json 是四个完成分支与 refs/pull/212..215/head 的实时原返回，均等于现场完成 HEAD。preflight.json 的 first-parent log 绑定主线实际 merge：PR212 `e49eda142d61bdd248ddc42ec16f5563abd4bbc6`、PR213 `cfce77546b64c2a8d7d12949261c38e2f666d5ae`、PR214 `ef4cb5e1458d911d98433c443dba46e6c224caa0`、PR215 `87f88b89297c5c1e346f7ef99118c410f4b4a905`；各完成 HEAD 是对应 merge 的第二父，祖先检查 exit0。每个删除前独立查询真正 refs/heads/main，原输入、返回及 UTC 时间分别见 remote-main-execution-54..57.json；四次均为上述 `87f88b…`。Done/PR 仅旁证，未用陈旧 origin/main。', '',
              '每目标 execution-*.json、operation-journal-*.jsonl、verification-*.json、residual-*.json 记录实际输入、stdout/stderr、时间、退出/结果、逐目标字节检查、磁盘读数及收尾。原工具 dispatch、wait、call ID、JSONL 原物理行号和返回见 original-tool-receipts.json.gz；执行工具追加的原返回文件见 execution-*-tool-*.json。PowerShell cmdlet 没有自己的 OS 进程退出码，journal 中 0/1 是即时成功/终止异常的归一化结果；Git/核验子进程和外层工具的真实退出码分开记录。执行脚本末尾 Select-Object 对 OrderedDictionary 产生 null 摘要，该原输出照存；真实完整 execution JSON 不受影响，不把 null 解释成成功证明。', '',
              '## 原件保全、缓存与共享边界', '',
              'mapping-54..57.json.gz 对 261,190 个现场普通文件逐 path 保存原长度/SHA-256，并指向准确完成 commit/blob、主线 ZIP/member、已先行提交补充 ZIP/member或真实可重建输入。Git 对象与 Windows 原字节分列；LF/CRLF 的明确变换及运行字节与 HEAD 原 blob 不一致的源码分别记录，不用 clean status 代字节一致。BOM/二进制未经一致核验不能冒等同。未匹配项 0、嵌套 Git 0、扫描错误 0。', '',
              '主线 M0–M3 共 1,613 份报告/JSON/ZIP 的完整实际字节已读，148,513 ZIP 成员逐个读取、CRC/哈希核对，见 sources-read.json.gz / zip-members.json.gz / blob-digests.json.gz。四份原损坏 ZIP 为 M0 contracts-typecheck-inputs.zip，M1 integration-final-inputs.zip / lint-final-inputs.zip / wait-ddl-first-inputs.zip；读取失败原文保留，它们的成员不用于放行。没有修补或伪造历史验收原件。', '',
              f'必要新增档案 **{sum(a["bytes"] for a in pre["newArchives"]):,} B**：additional-evidence-54..57.zip 对现场遗漏日志、缓存中的验收记录、工具/CI 原件和网页验收材料补保全；索引逐项列原哈希、ZIP 成员哈希，16 条脱敏记录明确原/脱敏字节差异，未保秘密原值。Node v22.19.0 原 ZIP 35,424,607 B 仅保一份，.tmp 和 .m1-runtime 中相同 runtime/npm 原字节复用成员。已有源码/runtime/输出归档优先复用，没有给每个旧目录重复归档全部依赖或整个 tracked 检出。', '',
              '每候选 609 个本地包版本由 metadata-*.json.gz 的 package.json 原字节及 lock-history-sources.json 指向主线可达的实际历史 pnpm-lock.yaml；.modules.yaml 的包管理器为 pnpm9.15.4。所有依赖路径保存现场原哈希，生成 shim/virtual store 与 frozen install 输入关联；历史遗留包也有锁版本，不假定当前锁含所有旧包。构建 .next/dist/cache 关联准确源码、package build/turbo/tsconfig；Python 字节码关联原脚本与版本 tag。可重建为功能性输出，缓存时间/绝对路径/非确定字节不承诺重现。所有 .turbo/.vite 的日志或结果仍作证据保全。', '',
              '链接共 7,762 个：7,702 junction、60 symlink，全部解析目标位于各自候选内部。FSCTL_GET_REPARSE_POINT 原本体 buffer/base64/tag/hash 单列于 metadata-*.json.gz；没有递归跟随链接。安装 metadata 中的 `X:\\packages\\.pnpm-store\\v3` 是共享 store 来源配置，没有扫描或删除它。现场普通文件 nlink>1 为 0、readonly 为 0；没有为 unlink 修改属性/ACL。', '',
              'link-proof.json 与同版 Git2.55.0.windows.3 / PowerShell7.6.6 的本机受控 fixture 实证 Git 成功保留 junction、删除 hardlink 的本机名称，独立 sentinel 哈希始终不变。对应 [Git dir.c](https://raw.githubusercontent.com/git-for-windows/git/v2.55.0.windows.3/dir.c) 的 is_mount_point guard 和 [Windows mingw.c](https://raw.githubusercontent.com/git-for-windows/git/v2.55.0.windows.3/compat/mingw.c) 识别逻辑支持该行为；成功落盘原源码及哈希见 git-source/，后续 URL 的 TLS EOF 原错误另存，没有声称整个下载批次成功。实际正式移除后再核普通文件 0、无新 clone/链接、只原已核 junction；随后按先行声明逐项非递归移除链接本体和已证普通空目录，最终根不存在。该操作不是遇到拒绝后换工具，不用于旧拒绝目标。', '',
              '## 整体占用与 42G 口径', '', '| 只读采样范围 | 操作前逻辑 GB | 操作后逻辑 GB |', '|---|---:|---:|',
              f'| 本项目已确认工作树（不跟链接） | {gb(before["worktreeLogicalBytes"])}（{before["worktreeCount"]} 个） | {gb(after["worktreeLogicalBytes"])}（{after["worktreeCount"]} 个） |',
              f'| 主仓库工作区及 Git 管理/对象，单列保护 | {gb(before["mainRepositorySeparate"]["logicalBytes"])} | {gb(after["mainRepositorySeparate"]["logicalBytes"])} |',
              f'| 两项合计 | {gb(before["worktreeLogicalBytes"]+before["mainRepositorySeparate"]["logicalBytes"])} | {gb(after["worktreeLogicalBytes"]+after["mainRepositorySeparate"]["logicalBytes"])} |', '',
              'GB=10^9 B，GiB=2^30 B。操作前两项合计 43.76 GB，与用户“42G 以上”大体相符；用户统计工具、时间和是否包含主仓库/链接重复未知，不能声称口径完全相同。Git 管理对象只计在主仓库，不在每个 linked 指针处再算。扫描包含活动任务和当前清理交付新增原件，前后不构成停止全机后的净归因快照。其它项目、用户目录、外部共享 store、Docker 镜像/业务数据未遍历。', '', '| 工作树大目录组成 | 前逻辑 GB | 后逻辑 GB |', '|---|---:|---:|']
    for k, v in groups_before.most_common():
        lines.append(f'| {k} | {gb(v)} | {gb(groups_after[k])} |')
    lines += ['', 'usage-before/after.json.gz 保存逐目录及组成完整机器清单。文档/证据的重复检出与多套本地依赖是主要组成，活动任务数量不能直接换算应占字节；历史保全和恢复输入也占空间。保留不等于已经证明这些目录永远不可回收，具体边界见下一节。', '',
              '## 卷级可用空间与真实回收差别', '', '| 目标 | 紧邻操作前 C: 可用 B | 紧邻操作后 C: 可用 B | 卷级变化 B |', '|---|---:|---:|---:|']
    for r in results:
        lines.append(f"| #{r['todo']} | {int(r['diskBefore']['FreeSpace']):,} | {int(r['diskAfter']['FreeSpace']):,} | {r['volumeFreeSpaceChangeBytes']:+,} |")
    lines += ['', f'首目标紧邻前到末目标紧邻后卷级实测变化 **{window:+,} B**。这不是可归因物理净释放：#58 正常运行、保全/提交/回执有新写入，NTFS 分配、压缩/共享块及其它系统写入也会影响读数。**可归因物理净释放未知（机器清单 null）**；{logical:,} B 是已删目标普通文件逻辑长度，不冒充磁盘净释放。', '',
              '## 保留来源、活动与下一步', '',
              f'本机全登记 **27→{post["registrationCount"]}**，0 prunable、所有其它登记目录存在且 HEAD 可读；本地四个完成分支保留。{post["protectedObservations"]} 条历史/保护来源路径观察前后差异 0，原已缺失的历史路径仍标缺失，不算新清理成果。这里只核存在性，#58/当前构建内容可合法变化。', '',
              'references-board/m5/review5-execution-54..57.json 和 process-execution-54..57.json 分别保存各候选删除前新读的任务/当前对话/可见命令行与可执行路径引用；进程完整命令行和环境秘密不入库。#58 整工作区、.tmp/m5-runtime、OpenCode 私有目录/进程及服务仍保护，没有健康命令 interrupt、发消息或停止服务。#5 仍 review，当前/旧恢复目录、#21 首面 checkpoint、旧恢复输入、本卡当前目录/主仓库均保留。', '',
              'G1/D0/C3 被拒精确目标及父目录、旧 38 node_modules / 36 .turbo / 2 typecache、RAW/原 trace/未映射材料的原保护来自 ../historical-sources.json 绑定的真正 main 和 protected-before.json 的 source 指针，四个新候选无交叉。不用 Done 或新清理授权解除它们，不重试原目标，不通过父删/Force/属性ACL/换工具/rename/move 绕过。', '',
              '其余 21 个目录的 todo/head/大小/组成、原保留决定和下一条件见 retained-directories.json，完整保护精确路径及来源见 protected-before/after.json。未确认准确恢复用途的目录必须先取得具体归属/保全/当前恢复引用；原拒绝目标维持禁止，本卡不以扩大历史核查或清共享资源取得更多空间。当前可见 todo/对话、进程和独占读取不能声称拥有全局 build/recovery registry 或全部 OS handles；该覆盖边界正是旧用途不明者保留的原因。', '',
              '持续机制落实“开工前看整体组成、真实合入后登记候选、最小必要原件、实时安全门、先提交后删、拒绝即停、幂等回执”。未来后台自动化建议为合入事件队列和开工盘点；需要平台代码/任务恢复登记接入，应另明确实施范围和授权，不擅设频率或改 daemon。', '',
              '## 失败、空批次与验证', '',
              '新清理批次非空；四个删除目标失败数 0、自动拒绝数 0，没有为被拒目标重试。历史拒绝和 #53 回执缺口不补造。保全过程的真实首败仍可查：受控 fixture 两次初始化/CRLF 输入失败、finish-mapping 初次对行政指针 str 使用 .get 的失败、只读 UTF-8 缺省解码和 rg Windows glob 错误、源下载 TLS EOF、http_ece 目录名解析初次少一包（最终609且未映射0）。这些均为本构建只读/受控证据准备问题，不是旧被拒目标重试。四份历史无效 ZIP 原错误另列，未用其放行。', '',
              '必要检查：JSON/JSONL/gzip 解析与双哈希、ZIP 成员/CRC、先行提交 binary byte equality、PowerShell 语法解析、完成/历史 reflog 主线可达、删除紧邻前现场全部 hash/独占读取/链接原 buffer、逐目标正式 Git/收尾实际结果、登记健康和保护存在性。已提交 diff --check 与最终源字节索引回执另见 final-validation.json / evidence-index.json；首次未完成的阶段不写成已通过。未跑无关 lint/typecheck/unit/integration/E2E，全卡无产品功能、迁移、API/事件或 tds 升级变化。', '',
              '交付全部在本受控清理目录。阅读演示：change review 中用本 Markdown 预览，选一个 mapping 文件从 Gitblob/ZIPmember 重算现场 SHA；gzip 用 Python 标准库 json.loads(gzip.decompress(Path(...).read_bytes())) 读取。机制脚本只读，无平台后台自动删除。']
    observed_main = []
    for n in (54, 55, 56, 57):
        remote = load(f'remote-main-execution-{n}.json')
        text = '\n'.join(c.get('text', '') for c in remote['output'].get('content', []))
        match = re.search(r'^([0-9a-f]{40})\s+refs/heads/main\s*$', text, re.M)
        assert match
        observed_main.append({'todo': n, 'sha': match.group(1), 'start': remote['start'], 'end': remote['end']})
    main_sentence = '；删除紧邻前实际 main 分别为 ' + '、'.join(f"#{r['todo']} `{r['sha']}`" for r in observed_main) + '。'
    report = ('\n'.join(lines)+'\n').replace('；四次均为上述 `87f88b…`。', main_sentence)
    machine = load('machine.json')
    report = report.replace('## 逐候选成果、主线与实际操作', f"实际本机为 {machine['computerName']}（DarkFlame），{machine['os']['Caption']} / {machine['os']['OSArchitecture']}，PowerShell {machine['powershell']}、{machine['gitVersion']}；本构建精确工作区 `{machine['workspace']}`。实读来源 machine.json；没有升级 tds 或新增连接/凭据。\n\n## 逐候选成果、主线与实际操作")
    docker = load('docker-mounts-after.json')
    docker_note = 'docker-mounts-before-57.json / docker-mounts-after.json 另保存仅 Name/Mounts 的只读原调用，运行中的 M5 postgres/redis/store 三个容器 ID 和名称前后相同，未见候选路径挂载引用；没有读取 Env、停止任何容器或清理 Docker。该新增观测发生于 #57 删除前及全批之后，不能补造 #54–56 删除前的 Docker 观测；前三目标的实际安全来源仍为其已记录的任务/当前对话、进程/执行路径、独占读取及保全。只读 rg 无匹配 exit1 与 Docker 子调用 exit0 分列，不把外层最后 exit1 冒成整个批次失败或成功。'
    report = report.replace('G1/D0/C3 被拒精确目标及父目录、', docker_note + '\n\nG1/D0/C3 被拒精确目标及父目录、')
    assert docker['success'] and docker['m5IdentitiesUnchanged']
    retained_changes = load('usage-retained-changes.json')
    growth_note = f"前后保留工作树逻辑长度增加 {retained_changes['changeBytesTotal']:,} B，具体为 #58 活动输出和本卡新增回执（usage-retained-changes.json），因此整体逻辑减少不等于直接减去删除目录长度。主仓库随提交/其它合法 Git 活动有对象增量；不把这些变化硬算成本批物理释放。"
    report = report.replace('usage-before/after.json.gz 保存逐目录及组成完整机器清单。', 'usage-before/after.json.gz 保存逐目录及组成完整机器清单。' + growth_note)
    (OUT / 'report.md').write_text(report, encoding='utf-8')
    write('results.json', {'recordedAt': utc(), 'newRemovedCount': len(successful), 'newRemovedLogicalBytes': logical, 'previous53ResultUnchanged': True, 'registrationBefore': 27, 'registrationAfter': post['registrationCount'],
                          'protectedExistenceDifferences': len(post['protectedExistenceDifferences']), 'results': results, 'wholeOperationVolumeFreeSpaceChangeBytes': window, 'attributablePhysicalNetReleasedBytes': None,
                          'usageBefore': {k: before[k] for k in ('worktreeLogicalBytes', 'worktreeCount')}, 'usageAfter': {k: after[k] for k in ('worktreeLogicalBytes', 'worktreeCount')}, 'failedTargets': post['failedTargets'], 'emptyBatch': post['emptyBatch'],
                          'mainExecutionObservations': observed_main,
                          'mechanism': {'readOnlyInventoryImplemented': True, 'rulesRecorded': True, 'platformDaemonAutomaticDeletionImplemented': False, 'scheduledTaskCreated': False}})
    print(json.dumps({'newRemoved': len(successful), 'logicalBytes': logical, 'wholeWindowVolumeChange': window, 'physicalNetAttribution': None}, ensure_ascii=False))

if __name__ == '__main__':
    main()
