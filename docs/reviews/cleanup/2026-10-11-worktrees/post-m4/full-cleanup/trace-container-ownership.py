"""对 r1 资源追准确 ID/原创建账本；仅查此仓库的相关文本与原 ZIP 日志。"""
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import zipfile
import audit

a, OUT, CURRENT = audit.a, audit.OUT, audit.CURRENT


def main():
    targets = [c for c in a.load(OUT/'containers-plan.json')['remainingProjectNamed'] if c['name'].startswith('/r1')]
    matches = {c['id']:[] for c in targets}
    # 只查任务证据文本；不输出原日志正文，不遍历 store/其它项目/敏感 DB。
    roots = [CURRENT/'docs/reviews/r1',CURRENT/'docs/reviews/c1/review-fixes',
        CURRENT/'docs/plan/agent-mcp-m1/product-evidence']
    inputs = []
    for root in roots:
        assert not a.usage.directory_gate(root)
        for path in root.rglob('*'):
            if not path.is_file() or path.is_symlink() or path.suffix not in ('.json','.md','.log','.ps1','.mjs'):
                continue
            raw = path.read_bytes()
            inputs.append(dict(path=str(path.relative_to(CURRENT)),bytes=len(raw),sha256=a.sha(raw)))
            for c in targets:
                if c['id'].encode() in raw or c['id'][:12].encode() in raw:
                    matches[c['id']].append(dict(path=str(path.relative_to(CURRENT)),kind='准确ID/12位ID文本命中，需看所属字段是否为创建账本'))
    archived = CURRENT/'docs/reviews/r1/execution-logs/raw-checks.zip'
    zip_members = []
    with zipfile.ZipFile(archived) as archive:
        assert archive.testzip() is None
        for info in archive.infolist():
            # 原归档使用 bytes/<sha256> 无扩展名；全量核成员，不凭后缀漏原日志。
            raw = archive.read(info)
            zip_members.append(dict(member=info.filename,bytes=len(raw),sha256=a.sha(raw),crc32=info.CRC))
            for c in targets:
                if c['id'].encode() in raw or c['id'][:12].encode() in raw:
                    matches[c['id']].append(dict(zip=str(archived.relative_to(CURRENT)),member=info.filename,kind='原日志成员准确ID命中'))
    # 命中的 C1/M1 文件仅把 r1 列在其它任务/全机观察中；本人 registry 的准确 ID 是另一批。
    sources = ['docs/reviews/r1/execution-environment.json','docs/reviews/r1/execution-logs/run9/service-results.json',
        'docs/reviews/r1/ci381/shard2/service-results.json','docs/reviews/c1/review-fixes/resources.json',
        'docs/plan/agent-mcp-m1/product-evidence/review-repair-resources.json',
        'docs/plan/agent-mcp-m1/product-evidence/review-queued-resources.json']
    a.write('remaining-container-ownership-complete.json',dict(recordedAt=a.utc(),inputs=inputs,
        originalZip=dict(path=str(archived.relative_to(CURRENT)),sha256=a.sha(archived.read_bytes()),crcVerified=True,members=zip_members),
        sources=[dict(path=p,mainGitBlob=a.call(CURRENT,'rev-parse',a.MAIN+':'+p)) for p in sources],
        rows=[dict(id=c['id'],name=c['name'],matches=matches[c['id']],
            gap='r1环境/服务退出回执仅有测试前缀、端口和命令；C1/M1将它列作其它任务观察，未绑定原创建者/独占测试数据。没有明确原ID→owner/可重建数据账本，不能凭名称或退出删卷。',
           解除条件='补准确原创建/任务owner来源，证明卷仅含可重建fake测试数据及当前独占消费者，再另作精确预检。') for c in targets]))
    print(json.dumps(dict(targets=len(targets),textInputs=len(inputs),zipMembers=len(zip_members),idMatches=sum(len(v) for v in matches.values()))))


if __name__ == '__main__':
    main()
