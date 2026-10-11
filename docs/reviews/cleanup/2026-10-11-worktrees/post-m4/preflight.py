"""汇总实际保全/当前引用和安全门；不操作候选目录。"""
import ast
import collections
import gzip
import json
from pathlib import Path
import subprocess
import zipfile
from audit import OUT, BASE, CURRENT, ROOT, MAIN, utc, sha, load, write, call, usage

TARGET = ROOT / '01a12766-4132-7d8c-a542-dcbfb2008b49'

def main():
    mapping = load(OUT / 'mapping-cleanup-pr217.json.gz')
    assert mapping['preservationCompleted'] and mapping['logicalBytes'] == 3030837288
    assert not mapping['links'] and not mapping['nestedGit'] and not mapping['errors']
    assert mapping['hardlinkedFileCount'] == 0 and all(r['attributes'] & 1 == 0 for r in mapping['files'])
    assert mapping['head']['stdout'].strip() == 'a27c1616ea532a39c609006ccdc4289a1641b21a'
    assert not mapping['status']['stdout'] and not mapping['ignoredCall']['stdout']
    assert all(r['exit'] == 0 for r in mapping['reflogAncestry'])
    assert collections.Counter(r['kind'] for r in mapping['files']) == {'tracked': 12616, 'git-administration': 1}
    process = load(OUT / 'process-opening.json')
    assert not any(TARGET.name in r['inspectedReferences'] for r in process['processes'])
    docker = load(OUT / 'docker-opening.json')
    assert docker['complete'] and not any(TARGET.name in r['stdout'] for r in docker['calls'])
    sessions = load(OUT / 'build-provenance.json')['sessions']
    candidate_sessions = [r for r in sessions if r['metadata']['cwd'] == str(TARGET)]
    assert len(candidate_sessions) == 1 and candidate_sessions[0]['firstTask']
    recovery = []
    for identifier in ('OHtiaCWGLuE1ZKuaYcslS','iCMNjXqZQLp65ZUMZg0nr','ti53hOGbvnBNrvjXXveGO'):
        p = OUT / ('conversation-' + identifier + '.json')
        text = load(p)['result']['content'][0]['text']
        assert TARGET.name not in text
        recovery.append(dict(source=p.name, sha256=sha(p.read_bytes()), candidateReferences=0))
    archive = OUT / mapping['archive']['path']
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for row in mapping['archive']['index']:
            assert sha(z.read(row['source']['member'])) == row['source']['sha256']
    sources = []
    paths = [CURRENT / n for n in ('CONTEXT.md','AGENT_PROTOCOL.md','OPENAPI.yaml','SCHEMA.sql')]
    paths += list((CURRENT / 'docs/adr').glob('*.md'))
    paths += [BASE / n for n in ('report.md','mechanism.md','cleanup-rules.json','usage-inventory.py','inventory.py',
        'protected-paths.json','historical-sources.json','continuation/report.md','continuation/metadata-proof.py',
        'continuation/metadata_proof_import.py','continuation/finish-mapping.py','followup/common.py',
        'followup/preserve.py','followup/verify-target.py','followup/retained-directories.json','followup/report.md',
        'followup/blocked-cleanup-old.json','followup/readonly-boundary.json')]
    paths += [CURRENT / n for n in ('docs/plan/agent-mcp-m5/product-resources-current.md',
        'docs/plan/agent-mcp-m5/product-cleanup.json','docs/plan/agent-mcp-m4/execution/resources.json',
        'docs/plan/agent-mcp-m4/execution/cleanup-current.json','docs/plan/agent-mcp-m4/execution/cleanup-review.json',
        'docs/plan/agent-mcp-m4/execution/resource-inventory.json','docs/plan/agent-mcp-m4/execution/formal-review-response.md')]
    for p in paths:
        if not p.exists():
            # 来源命名不得猜；缺失保原观察，后续补准确名称。
            sources.append(dict(path=str(p.relative_to(CURRENT)).replace('\\','/'), missing=True))
            continue
        rel = str(p.relative_to(CURRENT)).replace('\\','/')
        blob = call(CURRENT, 'rev-parse', MAIN + ':' + rel)
        assert blob['exit'] == 0
        data = subprocess.run(['git','-C',str(CURRENT),'cat-file','blob',blob['stdout'].strip()],capture_output=True,check=True).stdout
        runtime = p.read_bytes()
        variants = {'identity':data, 'LF-to-CRLF':data.replace(b'\n',b'\r\n')}
        transform = next((k for k,v in variants.items() if v == runtime),None)
        assert transform is not None, rel
        sources.append(dict(path=rel, main=MAIN, gitBlob=blob['stdout'].strip(), gitBytes=len(data),
                            gitSha256=sha(data), windowsBytes=len(runtime), windowsSha256=sha(runtime), reconstruction=transform))
    write('source-manifest.json', sources)
    safety = []
    for p in (ROOT,CURRENT,ROOT/'DzkLDn6UW-IbfoTJzN9Ro',ROOT/'01a115d0-87b0-78cd-921d-750713cdde51',
              ROOT/'01a126be-7aba-7b1d-a57a-f58317f89a67'):
        permitted = p.parent == ROOT and p == TARGET and not usage.directory_gate(p)
        assert not permitted
        safety.append(dict(path=str(p), permitted=permitted, action='只读拒例，未发删除'))
    write('safety-checks.json',dict(recordedAt=utc(),cases=safety,result='五个精确路径边界拒例通过；不尝试原保护/拒绝目录'))
    python_files = []
    for p in OUT.glob('*.py'):
        ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
        python_files.append(p.name)
    write('validation-preflight.json',dict(recordedAt=utc(),pythonAst=python_files,zipCrc=True,
        mappedFiles=len(mapping['files']),trackedFiles=12616,gitBlobs=len(load(OUT/'blob-digests.json.gz')),
        recoveryReferences=recovery,sourceCount=len(sources),result='通过'))
    write('preflight.json',dict(recordedAt=utc(),main=MAIN,path=str(TARGET),todo=60,
        todoId='mfKRDbW2TwlSuLxBxCoU-',branch='tds/conv-'+TARGET.name,head=mapping['head']['stdout'].strip(),
        mainMerge='996c940eb6c725fdfe408976ff9570997d1d5bdb',pr=217,logicalBytes=mapping['logicalBytes'],
        files=len(mapping['files']),links=0,nestedGit=0,readonly=0,hardlinks=0,
        mapping='mapping-cleanup-pr217.json.gz',archive=mapping['archive']['path'],
        operation=['git','-C',str(CURRENT),'worktree','remove',str(TARGET)],
        preservation='全部12616非Git管理文件准确绑定已合Git blob与Windows原字节；无需新增原件，空ZIP仅为原核验接口输入。',
        references=['remote-main-opening.json','remote-candidate.json','build-provenance.json','git-environment.json',
                    'process-opening.json','docker-opening.json','validation-preflight.json'],
        finish='候选无链接；只发正式Git remove。若失败/拒绝或残留即停止，无备用删除。',
        boundary='当前本轮、旧九只读对象、G1/D0/C3及父、M4/M5恢复、旧依赖/缓存/RAW/trace及历史未提交成果不动。',
        phase='尚未执行；预检保全须先成功提交推送，随后逐目标刷新main/活动/恢复并全字节复核。',
        limitation='没有全局恢复registry/全部OS handles；准确已合任务、原会话、daemon结束记录、当前对话、容器/可见进程、独占读取共同验证。'))
    print(dict(candidate=str(TARGET), files=len(mapping['files']), sourceCount=len(sources),result='先行预检通过'))

if __name__ == '__main__':
    main()
