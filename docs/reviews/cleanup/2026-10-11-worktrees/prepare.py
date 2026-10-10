"""冻结预检、保留范围和无损压缩的本轮清单；仅写本清理交付目录。"""
import sys
sys.dont_write_bytecode = True
import gzip
import hashlib
import json
from pathlib import Path
from inventory import CURRENT, OUT, ROOT, git, utc, write

def main():
    inv = json.loads((OUT / 'inventory.json').read_text(encoding='utf-8'))
    mapping = {
        '01a115d0-87b0-78cd-921d-750713cdde51': 10,
        '01a116f7-1027-7c75-90df-32ebc5488752': 18,
        '01a116f8-8172-7082-8d61-867bd9f0b749': 3,
        '01a1187a-f0f0-76d8-8f5b-b954ee399cdc': 15,
        '01a1187a-f0f1-74d9-a5e7-0022c903a6e6': '11 历史恢复（含未提交成果）',
        '01a1187a-f0f2-7dd4-b77e-b9540ad44d9e': '8 历史恢复（含未提交成果）',
        '01a1187a-f4ff-735d-814f-a7b26f8cfdc5': 11,
        '01a11890-f4de-7106-b64d-e1b2c0d4608e': 17,
        '01a1195f-55ab-7ee9-8baf-c115978d3aec': '21 首面检查点',
        '01a11a93-c093-7565-9084-724b6bedcade': 21,
        '01a11ac2-7634-752e-8d81-764c9776f801': 8,
        '01a11ac2-a0a9-7ef6-bd48-3bb37c21a301': 5,
        '01a11acb-1a68-7fba-a359-7119603cde7d': 52,
        '01a11b27-cfac-7ea4-a461-8eef51b750fe': 9,
        '01a11b85-41f9-74f5-b456-7083d4d83e5e': 16,
        '01a1264e-bd35-76d4-b328-03e9b91301f3': 58,
        '01a126be-7aba-7b1d-a57a-f58317f89a67': 60,
    }
    decisions = []
    for row in inv['rows']:
        name = Path(row['path']).name
        todo = row.get('todo') or mapping.get(name)
        if todo == 53:
            reason = '唯一执行候选：主线可达、逐文件保全、无忽略项/链接/嵌套 clone；提交预检后刷新再执行'
        elif todo in (54, 55, 56, 57):
            reason = '保留：依赖 junction 与共享 store 边界未证；ignored 日志/缓存/测试结果尚无完整逐 path 保全映射，禁止整体移除'
        elif todo in (5, 58, 60):
            reason = '保护：待审、活动构建或本清理构建'
        elif todo == 52:
            reason = '保护：旧清理会话的审计/恢复来源；本轮不解除历史明确保护'
        elif todo:
            reason = '保护：历史明确保留、恢复输入、拒绝目标父目录或未映射验收材料；Done 不解除'
        else:
            reason = '保留：WorkMesh 仓库归属已确认，但准确 todo/build 历史恢复用途未充分映射，不凭干净状态或主线 HEAD 删除'
        reachability = git(CURRENT, 'merge-base', '--is-ancestor', row['head']['stdout'].strip(), '87f88b89297c5c1e346f7ef99118c410f4b4a905')
        decisions.append({'path': row['path'], 'todo': todo, 'branch': row['registration'].get('branch') if row['registration'] else None,
                          'head': row['head']['stdout'].strip(), 'logicalBytes': row['logicalBytesWithoutFollowingLinks'],
                          'links': len(row['links']), 'nestedGit': row['nestedGit'], 'decision': reason, 'ancestorObservation': reachability,
                          'source': '本轮 todo 元数据 + historical-sources.json 所绑定真正 main 的历史清理记录；未映射者明确 null'})
    write('decisions.json', decisions)
    # 所有非候选目录只读存在性保护；不会对这些目录发删除命令。
    protected = [{'path': r['path'], 'reason': r['decision'], 'existsBefore': Path(r['path']).exists()} for r in decisions if r['todo'] != 53]
    for rel in ['DzkLDn6UW-IbfoTJzN9Ro/repo',
                '01a1264e-bd35-76d4-b328-03e9b91301f3/.tmp/m5-runtime',
                '01a116f7-1027-7c75-90df-32ebc5488752/.tmp/g1-shallow-layout',
                '01a1187a-f4ff-735d-814f-a7b26f8cfdc5/.tmp/d1a-stage0-trace-env07-2/1-trace.trace']:
        p = ROOT / rel
        protected.append({'path': str(p), 'reason': '主仓库／活动服务／原拒绝 clone／保留原 trace', 'existsBefore': p.exists()})
    # 从历史清单抽取具体被拒文件、RAW、缓存和未映射材料的路径，核对应路径存在性。
    source_files = ['historical-worktrees-2026-10-08.json', 'remaining-materials-review-2026-10-08.json',
                    'ordinary-cleanup-preflight-2026-10-08.json', 'final-cleanup-candidates-2026-10-08.json',
                    'd1a-trace-minimum-preservation-2026-10-08.json']
    seen = {p['path'].lower() for p in protected}
    def walk(value, source, trail):
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, source, trail + '/' + k)
        elif isinstance(value, list):
            for i, v in enumerate(value):
                walk(v, source, trail + '/' + str(i))
        elif isinstance(value, str) and value.startswith('C:') and len(value) < 350 and 'workspaces' in value:
            v = value.replace('\\\\', '\\')
            if '*' in v or '\n' in v:
                return
            p = Path(v)
            if p.is_absolute() and str(p).lower() not in seen:
                seen.add(str(p).lower())
                protected.append({'path': str(p), 'reason': '历史来源路径观察：缺失可能是历史已删，不当作本轮结果',
                                  'source': source + '#' + trail, 'existsBefore': p.exists()})
    for name in source_files:
        walk(json.loads((CURRENT / 'docs/reviews/cleanup' / name).read_text(encoding='utf-8-sig')), name, '')
    write('protected-paths.json', protected)
    compressed = []
    for name in ['inventory.json', 'files-54.json', 'files-55.json', 'files-56.json', 'files-57.json']:
        p = OUT / name
        raw = p.read_bytes()
        data = gzip.compress(raw, mtime=0)
        assert gzip.decompress(data) == raw
        (OUT / (name + '.gz')).write_bytes(data)
        compressed.append({'file': name + '.gz', 'uncompressedBytes': len(raw), 'uncompressedSha256': hashlib.sha256(raw).hexdigest(),
                           'gzipBytes': len(data), 'gzipSha256': hashlib.sha256(data).hexdigest(), 'jsonParsed': bool(json.loads(raw))})
        p.unlink()  # 仅移除本脚本刚保全的当前交付中间文件，不操作旧工作树。
    write('compressed-index.json', compressed)
    write('preflight.json', {'recordedAt': utc(), 'approvedScope': '用户本卡明确授权；不重新 withPlan；先提交预检再执行',
          'candidateCount': 1, 'candidateTodo': 53, 'target': str(ROOT / '01a11e5e-9e0c-704b-a590-3fee492f4f6a'),
          'operation': ['git', 'worktree', 'remove', str(ROOT / '01a11e5e-9e0c-704b-a590-3fee492f4f6a')],
          'force': False, 'proofFiles': ['preservation-53.json', 'remote-main-preflight.json', 'safety-before.json', 'references-board-preflight.json', 'references-m5-preflight.json', 'references-review5-preflight.json'],
          'onRejection': '停止目标，不重试、不换工具、不改属性/ACL、不父删；原文回执保全',
          'executionStatus': '尚未执行；预检提交后再次独立查询 remote main、活动任务及进程、逐文件字节与登记'})
    report = ['# 2026-10-11 WorkMesh 工作树回收：执行前清单', '',
              '本轮只处理实际本机 WorkMesh 旧构建目录；主线实读为 `87f88b89297c5c1e346f7ef99118c410f4b4a905`。此文件是删除前已提交的预检，不是执行回执。', '',
              '唯一执行候选 #53：`01a11e5e-9e0c-704b-a590-3fee492f4f6a`，HEAD `f5a665407f0ff3e6dab84932bcb7d49d56468e42`。2502 个成果文件逐 path 映射，402 个与 blob 原字节相同，2100 个经明确 LF→CRLF 变换与实际 Windows 原字节相同；另一个 `.git` 是登记指针。总逻辑长度 151693775 B。无 dirty/untracked/ignored、链接、嵌套 clone 或未映射成果。2502 个文件独占读成功，可读任务/进程没有候选引用。', '',
              '核验覆盖可读任务对话、当前板状态、Win32_Process 命令行、完整 scoped 文件枚举和逐文件独占读取；没有声称枚举平台全局恢复 registry 或全部 OS handles。旧来源目录归属或恢复用途不明者保留。', '',
              '真正 main 中 19 份历史清理文件已完整读取并逐对象绑定于 historical-sources.json；原 G1/D0/C3 拒绝及父目录、38 node_modules、36 .turbo、2 typecheck cache、RAW/原 trace/未映射材料/恢复目录均不解除保护、不重试。后续四批含 junction 和未映射 ignored 验收输出，保留。', '',
              '| 目录 | Todo | 逻辑字节（不跟随链接） | 决定 |', '|---|---|---:|---|']
    report += [f"| `{Path(r['path']).name}` | {r['todo'] if r['todo'] is not None else '未映射'} | {r['logicalBytes']} | {r['decision']} |" for r in decisions]
    report += ['', '清单：decisions.json、protected-paths.json、preservation-53.json。大清单采用可逐字节还原的 .json.gz；compressed-index.json 保存压缩与原 JSON 双 SHA-256。没有 Docker、产品代码、数据库迁移、API/事件变更；未跑无关产品套件。最终回执另存，不倒写本预检。', '']
    (OUT / 'preflight.md').write_text('\n'.join(report), encoding='utf-8')
    print(json.dumps({'directories': len(decisions), 'protectedPathObservations': len(protected), 'candidate': 53}, ensure_ascii=False))

if __name__ == '__main__':
    main()
