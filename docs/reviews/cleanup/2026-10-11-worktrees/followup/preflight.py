"""生成本轮五个精确候选先行预检，不发删除。"""
import collections
import zipfile
from common import *

def main():
    rows = []
    provenance = load(OUT / 'build-provenance.json')
    original_link_proof = load(OUT.parent / 'continuation/link-proof.json')
    assert call(CURRENT, '--version')['stdout'].strip() == original_link_proof['version']
    for key, name in TARGETS.items():
        if key == 'cleanup-old':
            assert (OUT / 'blocked-cleanup-old.json').exists()
            continue
        m = load(OUT / f'mapping-{key}.json.gz'); root = ROOT / name
        assert m['preservationCompleted'] and m['hardlinkedFileCount'] == 0 and not m['errors']
        assert not protection_conflicts(root)
        assert all(r['exit'] == 0 for r in m['reflogAncestry'])
        sessions = [r for r in provenance['sessions'] if r['metadata']['cwd'] == str(root)]
        assert sessions and all(r['firstTask'] for r in sessions)
        head = m['head']['stdout'].strip()
        merge_candidates = git('log', MAIN, '--first-parent', '--merges', '--format=%H %P %s').decode().splitlines()
        direct_merges = [r for r in merge_candidates if head in r.split(' ')[:3]]
        fixture_bindings = []
        if key == 'cleanup-old':
            for filename in ('link-proof.json','link-proof-first-failure.json','link-proof-second-failure.json'):
                p = OUT.parent / 'continuation' / filename
                b = p.read_bytes(); value = load(p)
                fixture_bindings.append({'path': str(p.relative_to(CURRENT)).replace('\\','/'),
                                         'blob': git('rev-parse', MAIN + ':' + str(p.relative_to(CURRENT)).replace('\\','/')).decode().strip(),
                                         'windowsSha256': sha(b), 'fixtureRoot': value.get('fixtureRoot'),
                                         'source': '原本机 fixture 版本/输入/首败/成功证明；三个裸仓库所有普通文件另保全'})
            assert len(m['fixtureBareRepositories']) == 3
        archive = OUT / m['archive']['path']
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            for r in m['archive']['index']: assert sha(z.read(r['source']['member'])) == r['source']['sha256']
        rows.append({'key': key, 'path': str(root), 'todo': 18 if key.startswith('g1') else 31 if key.startswith('upgrade') else 60,
                     'todoId': 'Tws50k02Pi52R-RJEXP_N' if key.startswith('g1') else 'g3z2_7RkMHTIKvp_tRd1F' if key.startswith('upgrade') else 'mfKRDbW2TwlSuLxBxCoU-',
                     'branch': 'tds/conv-' + name, 'head': head, 'directMainMergeRecords': direct_merges,
                     'prMeaning': 'g1-plan 实际 PR194；g1-build 是后续 G1 主线可达 checkpoint，无该旧 branch 实时 remote ref；升级两树无产品变更 PR；旧清理 PR216 第二父',
                     'logicalBytes': m['logicalBytes'], 'files': len(m['files']), 'links': len(m['links']),
                     'junctionsExpectedResidual': sum(r['tag']==0xa0000003 for r in m['links']),
                     'hardlinkedFileCount': m['hardlinkedFileCount'], 'packages': len(m['packages']),
                     'sourceKinds': dict(collections.Counter(r['kind'] for r in m['files'])),
                     'archive': {k:v for k,v in m['archive'].items() if k!='index'}, 'fixtureBindings': fixture_bindings,
                     'sourceMapping': f'mapping-{key}.json.gz', 'historicalProtectionConflicts': [],
                     'operation': ['git','-C',str(CURRENT),'worktree','remove',str(root)],
                     'declaredFinish': '仅正式 Git 成功后，核残留普通文件/新仓库均0、仅原已核junction；非递归 LiteralPath 移除本体及经证普通空目录。任何失败/拒绝停止该目标，不换法。'})
    write('preflight.json', {'recordedAt': utc(), 'main': MAIN, 'current': str(CURRENT), 'candidates': rows, 'blocked': load(OUT/'blocked-cleanup-old.json'),
                            'preservationCommit': 'pending-preflight-commit，由 push 原返回和 preflight-binding 解析',
                            'authorization': '本轮用户新增安全清理授权；不继承旧回合不再新增删除限制。原拒绝/明确保护继续。',
                            'references': ['board-opening.json','todo-current.json','todo-g1.json','todo-upgrade.json','conversation-g1.json','conversation-upgrade.json',
                                           'conversation-m5-opening.json','conversation-review5-opening.json','process-preflight.json','docker-preflight.json'],
                            'scopeLimit': '没有全局历史 build/recovery registry 或全部 OS handles；此次利用准确已结束任务/会话/daemon/祖先链、活动与恢复对话、全部容器挂载、可见进程和独占读取联合证明，不将未解旧保护泛化放行'})
    lines = ['# 本轮四个可执行候选先行预检', '', '五个优先目标中，旧 #60 在只读夹具对象门禁停止，不再尝试；其余四个独立候选已完成保全。当前尚未执行删除；本预检必须先提交并成功推送，再逐目标刷新真实 main 与活动/恢复引用。', '',
             '| 候选 | 任务 | 完成 HEAD | 逻辑 B | 普通文件 | 原 junction |', '|---|---|---|---:|---:|---:|']
    for r in rows:
        lines.append(f"| {r['key']} | #{r['todo']} | `{r['head']}` | {r['logicalBytes']:,} | {r['files']:,} | {r['junctionsExpectedResidual']} |")
    lines += ['', f'开工真实远端 main：`{MAIN}`，原件 remote-main-opening.json。逐 HEAD 与全部 reflog 的主线可达均实跑 exit0。g1-plan 是 PR194 第二父，g1-build 是主线可达早期 checkpoint；#31 两树 HEAD 本来就是 PR204 主线，没有新增产品成果 PR。旧 #60 是 PR216 第二父，当前同卡重建的目录始终保护。', '',
              '四个前轮用途未映射目录已通过会话元数据 cwd/branch、原用户任务全文和 daemon workspace/step 原记录定位为 #18、#31 的早期构建，见 build-provenance.json。#18 后续构建已完成并合入，#31 已结束；当前可见活动/待审恢复对话未引用这四个路径。旧 #60 主线成果可达，但夹具 Git object 带只读属性，现场完整保全尚未通过，已停止整个目标；精确 blocker 见 blocked-cleanup-old.json。没有据 Done/clean 独立决定删除。', '',
              'mapping-* 对每个普通文件保现场长度/Windows SHA/属性/fileId/nlink 与准确 Git blob、明确 LF/CRLF 变换、ZIP member 或真实历史锁/逐包 metadata/源码构建输入。8909 个 blob 的实际原字节独立核验；混合换行现场原件另保全，不把 clean 当字节一致。用于放行的四份 ZIP 所有成员已完整读回核 CRC/SHA；准备期 partial ZIP 不用于放行，旧 #60 保全中途停止的原件亦保留。新档案内容寻址去重；大规模源码/文档全部复用 Git，依赖/缓存只保存输入和哈希，不复制整树/依赖。共享 X:\\packages\\.pnpm-store\\v3 只是安装来源，未遍历。', '',
              '四个可执行候选普通文件 nlink=1、readonly=0；两个 G1 的链接解析仅在各自目录内，reparse buffer/tag/hash 已保。两个升级目录无链接。原同版 Git2.55.0.windows.3/PowerShell7.6.6 链接实证继续适用；事先声明仅 Git 成功且已证原 junction/普通空目录时非递归收尾。原拒绝目标不能使用此流程。', '',
              'retention-review.json 已逐个复核其余旧树，精确保留原38 node_modules/36 .turbo/2typecache、RAW/trace/恢复输入、G1/D0/C3拒绝父目录、#5待审、#21首面checkpoint及未合UI成果。protected-opening.json保存原source指针与本次存在性；原缺失路径不补造本轮删除。', '',
              '实时参考门禁：可见进程/执行路径无候选引用，全部77容器（含停止容器）名称/挂载无候选引用，保原只读调用。每次删除前另读 board/#58/#5 与 main；执行器再核所有现场字节/独占读取/链接本体及先行提交。没有平台全局恢复registry/全部OS handles，覆盖边界如实披露。', '',
              '准备期原失败：第一版遇 .gitattributes 混合LF/CRLF而停止保全；原脚本、partial ZIP和原输出保留。第二版 ignored 全表重复拆分导致过慢，仅终止本人精确Python准备进程，保原输入/回执/partial ZIP，优化为集合查询再准备。一次PowerShell转写引号解析失败也保原返回。此时全部删除尚未发生，不是失败后换工具重试删除。', '',
              '本轮只做授权清理与适当证据/盘点/源码绑定/diff检查，不改产品功能、迁移、API/事件，不跑无关产品全套；不装新软件、不升级tds、不建timer/daemon、不删除远端分支标签。新成果仍待独审和准确最新RequiredCI条件合入，旧独审/CI不代本轮。']
    (OUT / 'preflight.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print({'candidates': len(rows), 'logicalBytes': sum(r['logicalBytes'] for r in rows), 'newArchiveBytes': sum(r['archive']['bytes'] for r in rows)})

if __name__ == '__main__':
    main()
