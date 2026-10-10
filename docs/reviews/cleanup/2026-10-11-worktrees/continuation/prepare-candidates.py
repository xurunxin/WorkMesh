"""冻结 #54–57 先行预检和保护快照，不执行删除。"""
import sys
sys.dont_write_bytecode = True
import collections
import gzip
import hashlib
import json
from pathlib import Path
import zipfile
from audit import OUT, CURRENT, ROOT, MAIN, TARGETS, utc, write, call

def load(name):
    return json.loads(gzip.decompress((OUT / name).read_bytes()))

def main():
    rows = []
    historical = json.loads((OUT.parent / 'protected-paths.json').read_text(encoding='utf-8-sig'))
    protected = [r for r in historical if not any(r['path'].lower() == str(ROOT / name).lower() and not r.get('source') for name in TARGETS.values())]
    write('protected-before.json', [{'path': r['path'], 'source': r.get('source'), 'reason': r['reason'], 'exists': Path(r['path']).exists()} for r in protected])
    for n, name in TARGETS.items():
        m = load(f'mapping-{n}.json.gz')
        meta = load(f'metadata-{n}.json.gz')
        assert m['preservationCompleted'] and not m['unmatched'] and not m['preservationErrors'] and not m['errors'] and not m['nestedGit']
        assert not meta['readOnlyFiles'] and not meta['unmappedPackages']
        assert all(r['exit'] == 0 for r in meta['reflogAncestry'])
        assert all(r['insideCandidate'] and r['tag'] in (0xa0000003, 0xa000000c) for r in meta['links'])
        path = ROOT / name
        conflicts = [r for r in historical if r.get('source') and (r['path'].lower() == str(path).lower() or r['path'].lower().startswith(str(path).lower()+'\\'))]
        assert not conflicts
        rows.append({'todo': n, 'path': str(path), 'branch': 'tds/conv-' + name, 'head': m['head'], 'pr': 212 + n - 54, 'main': MAIN,
                     'logicalBytes': sum(r['bytes'] for r in m['files']), 'files': len(m['files']), 'sourceKinds': dict(collections.Counter(r['kind'] for r in m['files'])),
                     'windowsTrackedVariants': sum(r['kind'] == 'tracked-runtime-variant' for r in m['files']), 'redactionRecords': len(m['redactions']),
                     'links': len(meta['links']), 'junctionsExpectedResidual': sum(r['tag'] == 0xa0000003 for r in meta['links']), 'symlinksGitRemoves': sum(r['tag'] == 0xa000000c for r in meta['links']),
                     'hardlinkedFileCount': meta['hardlinkedFileCount'], 'readOnlyFiles': meta['readOnlyFiles'], 'historicalProtectionConflicts': conflicts,
                     'exactSourceMapping': f'mapping-{n}.json.gz', 'metadataProof': f'metadata-{n}.json.gz', 'packagesPinnedInHistory': len(meta['packages']),
                     'operation': ['git', '-C', str(CURRENT), 'worktree', 'remove', str(path)],
                     'declaredJunctionFinish': '只有正式 Git 成功后，原始 junction 本体逐项非递归 Remove-Item -LiteralPath，之后逐项移除经证实的普通空目录；不追随目标',
                     'onFailureOrRejection': '立即停止原目标，不重试/Force/改属性 ACL/换工具/父删绕过；其它独立候选另行核验'})
    archives = []
    for p in sorted(OUT.glob('*.zip')):
        data = p.read_bytes()
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None
            count = len(z.infolist())
        archives.append({'path': str(p.relative_to(CURRENT)).replace('\\', '/'), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'crcPassed': True, 'members': count})
    merges = call(CURRENT, 'log', '-4', '--first-parent', '--format=%H %P %s', MAIN)
    assert merges['exit'] == 0
    write('preflight.json', {'recordedAt': utc(), 'main': MAIN, 'scope': '用户本卡持续授权；#53 不重做；新 #54–57 逐 path 核完后先提交再执行', 'candidates': rows, 'newArchives': archives, 'merges': merges,
                           'sourceBinding': 'pending-preflight-commit 来源由成功提交返回及后续 preflight-commit-binding.json 精确解析；不能先执行',
                           'activeReferenceSources': ['references-board-preflight.json', 'references-m5-preflight.json', 'references-review5-correct-preflight.json', 'process-preflight.json'],
                           'coverageLimit': '可见 todo/当前对话、进程命令行与可执行路径、逐文件独占读取；无全局恢复登记/全部 OS handles；因此历史未确认用途目录不放行'})
    lines = ['# #54–57 接续删除先行预检', '', '本文件为本卡接续的先行提交内容。#53 原回执保持，不重复执行。用户已授权符合安全条件者直接回收。', '', '| todo/PR | immutable 完成 HEAD | 逻辑长度 B | 原 junction / symlink | 保全 |', '|---|---|---:|---:|---|']
    for r in rows:
        lines.append(f"| #{r['todo']} / PR{r['pr']} | `{r['head']}` | {r['logicalBytes']:,} | {r['junctionsExpectedResidual']} / {r['symlinksGitRemoves']} | {r['files']} path，全映射、未匹配 0 |")
    lines += ['', f'当前远端 main 原返回见 remote-main.json，准确 SHA 为 `{MAIN}`；完成分支和 PR head 原返回见 remote-completion-heads.json。四个完成 HEAD 均是主线实际 merge 的第二父，见 preflight.json 的完整 log 原件。每次删除前还须独立刷新 refs/heads/main 和活动/恢复引用。', '',
              '主线 M0–M3 1613 份报告/JSON/ZIP 原字节来源核验和 148513 成员见 sources-read.json.gz、zip-members.json.gz；四份历史损坏 ZIP 逐项保留错误，不用于放行。必要未归档材料见 additional-evidence-54..57.zip/index；16 条脱敏记录明确原/脱敏哈希，不保存秘密原值。Node22.19.0 原包仅保一份，解包 runtime 原字节逐项映射。', '',
              '所有链接本体已用 FSCTL_GET_REPARSE_POINT 原 reparse buffer、tag、base64 和哈希记录；解析目标在各自候选内。node_modules/.modules.yaml 的 X:\\packages\\.pnpm-store\\v3 为安装来源配置，不是递归目标。现场普通文件 hardlink 计数 >1 为 0、readonly 为 0，未扫描/操作共享 store。609 个包版本分别绑定真实主线可达历史锁文件；构建/cache 与源码、脚本、工具版本关联，不承诺缓存字节重建一致。', '',
              '本机同版 Git/PowerShell 受控夹具实证 Git 成功保留 junction、移除普通 hardlink 名称，sentinel 原字节不变。Git 成功后的链接收尾为事先声明步骤：残留核验必须确认普通文件 0、嵌套仓库 0、仅原已核 junction，本体逐项非递归 Remove-Item -LiteralPath，之后仅普通空目录非递归删除。任何失败/自动拒绝立即停原目标；不能套用于旧拒绝目标。', '',
              '旧 #52 原明确保护精确路径与四个候选无交叉；保护快照 5206 条另存 protected-before.json。#58、#5/旧恢复、#21 首面检查点、当前构建、主仓库及根外登记继续保护。缺少全局恢复 registry/全部 OS handles 的能力边界不隐瞒，旧未确认用途目录保持留存。', '',
              '执行入口 execute-target.ps1 每次仅一个固定 ValidateSet 候选，拒绝已有执行回执，检查根/祖先非 reparse、先行提交绑定、活动进程、每个现场字节/独占读取/链接原件和 Git 状态后才发正式移除。输入/输出/exit/时间逐项记在 operation-journal-*.jsonl 与 execution-*.json；空间只分列逻辑与卷级读数。', '',
              '用户新增整体占用/清理机制要求见 ../mechanism.md 和 ../cleanup-rules.json；只读可复用盘点与规则已落盘，不声称平台 daemon 自动删除。']
    (OUT / 'preflight.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    (OUT / 'report.md').write_text('# #54–57 安全清理接续报告\n\n当前为先行预检提交，尚未声称实际删除；执行后将在本文件补录真实结果。既有 #53 完整报告和原回执见 ../report.md，保持不变。\n\n'+ '\n'.join(lines[2:])+'\n', encoding='utf-8')
    print(json.dumps({'candidates': len(rows), 'logicalBytes': sum(r['logicalBytes'] for r in rows), 'protectedObservations': len(protected), 'newArchiveBytes': sum(r['bytes'] for r in archives)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
