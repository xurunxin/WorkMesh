# 本轮文档专项复核

## 用途与运行方式

此脚本只读新方案、固定基线和 Git 对象，检查链接、来源哈希、完整规格及测试责任。它不连接数据库，不启动服务或设备，不替未来产品验收。将代码保存到本任务独有临时目录，以 Python 3.11 在仓库根目录运行。

完整目录形成后再执行。工具原文的逐字比对还在施工时对实际工具返回执行过；本脚本只从归档独立复核，不冒称再次取得平台响应。

```python
from pathlib import Path
import hashlib,json,re,subprocess,urllib.parse

root=Path.cwd()
out=root/'docs/plan/ta02-machine-daemon'
base='c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8'
git=lambda *a:subprocess.check_output(['git',*a],cwd=root)
sha=lambda b:hashlib.sha256(b).hexdigest()
binding=(out/'source-binding.md').read_text(encoding='utf-8')
bound=0
for path,blob,digest in re.findall(r'^\| `([^`]+)` \| `([a-f0-9]{40})` \| `([a-f0-9]{64})` \|$',binding,re.M):
    raw=git('show',f'{base}:{path}')
    assert git('rev-parse',f'{base}:{path}').decode().strip()==blob,path
    assert sha(raw)==digest,path
    assert git('hash-object','--path',path,path).decode().strip()==blob,path
    bound+=1
assert bound==57,bound
archives=0
for p in sorted((out/'sources').glob('*.md')):
    b=p.read_bytes()
    original='\n'.join(json.loads(b.decode().split('```json\n',1)[1].split('```',1)[0]))
    row=next(s for s in binding.splitlines() if s.startswith(f'| [sources/{p.name}]'))
    for value in [str(len(original.encode())),sha(original.encode()),sha(b),git('hash-object',str(p)).decode().strip()]:
        assert value in row,(p,value)
    if p.name=='todo-34.md':
        spec=original.split('\nSpec:\n',1)[1].split('\nSaved plan:',1)[0]
        assert '(truncated)' not in spec
        assert (out/'current-spec.md').read_bytes()==(spec+'\n').encode()
    archives+=1
assert archives==5
links=0
authored=[p for p in out.glob('*.md') if p.name!='current-spec.md']
for p in authored:
    prose=re.sub(r'^```[^\n]*\n[\s\S]*?^```[ \t]*$','',p.read_text(encoding='utf-8'),flags=re.M)
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',prose):
        if re.match(r'^(https?:|mailto:|todo:|project:|#)',target):
            continue
        target=urllib.parse.unquote(target.split('#')[0])
        assert (p.parent/target).exists(),(p,target)
        links+=1
accept=(out/'acceptance.md').read_text(encoding='utf-8')
assert set(re.findall(r'^\| (T[1-9]) ',accept,re.M))=={f'T{i}' for i in range(1,10)}
assert set(re.findall(r'^\| (S[1-6]) ',accept,re.M))=={f'S{i}' for i in range(1,7)}
for name in ['machine-admission.integration.test.ts','instance.platform.test.ts','upgrade.platform.test.ts','machines-migration.integration.test.ts']:
    assert name in accept,name
plan=(out/'implementation-plan.md').read_text(encoding='utf-8')
assert '产品任务都是未来建议' in plan
assert '仅交付方案' in plan or '只形成完整中文方案' in plan
assert 'Windows' in accept and 'ARM' in (out/'proposed-decisions.md').read_text(encoding='utf-8')
for p in out.rglob('*.md'):
    data=p.read_bytes()
    assert data.endswith(b'\n') and not data.endswith(b'\n\n'),p
    for n,line in enumerate(data.decode().splitlines(),1):
        assert line==line.rstrip(),(p,n,'trailing whitespace')
changed=set(git('diff','--name-only',base).decode().splitlines())|set(git('ls-files','--others','--exclude-standard').decode().splitlines())
for path in changed:
    assert path.startswith('docs/plan/ta02-machine-daemon/') and path.endswith('.md'),path
print(json.dumps({'base':base,'boundFiles':bound,'archives':archives,'authoredLinks':links,'nineCategories':9,'specialResponsibilities':6,'changedFiles':len(changed),'scope':'documentation only'},ensure_ascii=False))
```

## CI 分类

使用锁定 Node 调用现行 `scripts/ci-policy.mjs` 导出的 `classifyChanges` 和 `readWorkspaces`，输入为 `git diff --name-only` 与 `git ls-files --others --exclude-standard` 的并集。完整提交后再对 `git diff --name-only <准确基线> <准确提交>` 分类，避免只看已干净工作树。

本轮不改分类器。只有全部文件处于 `docs/` 的 Markdown prose 时才能得到 docs 模式；任何未知路径或 runtime 文件均按现有策略处理。仍需实际执行 changes job 的策略测试和接入文档预检，并通过准确候选的 Required CI。
