# 文档专项复核

在仓库根目录将下面脚本存入新的本人临时目录并执行 python；先暂存本卡文档。只读来源、Git 和暂存字节，不连接业务服务。秘密比对仅在本轮私有环境文件仍存在时另执行；归档哈希复核独立可跑。

```python
from pathlib import Path
import json,hashlib,re,subprocess,urllib.parse
root=Path.cwd();out=root/'docs/plan/ta01-self-hosted-deployment';base='c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8'
git=lambda *a:subprocess.check_output(['git',*a],cwd=root)
sha=lambda b:hashlib.sha256(b).hexdigest()
raw=lambda p:'\n'.join(json.loads(p.read_text(encoding='utf-8').split('```json\n',1)[1].split('\n```',1)[0]))
source=(out/'sources.md').read_text(encoding='utf-8');evidence=(out/'sources/evidence-index.md').read_text(encoding='utf-8')
count=0
for p in sorted((out/'sources').glob('*-todo.md'))+sorted((out/'sources').glob('*-conversation.md')):
 original=raw(p);row=next(l for l in source.splitlines() if ']('+p.relative_to(out).as_posix()+')' in l)
 for h in [sha(original.encode()),sha(p.read_bytes()),git('hash-object',str(p)).decode().strip()]: assert h in row,p
 count+=1
spec=raw(out/'sources/current-todo.md').split('\nSpec:\n',1)[1].split('\nSaved plan:',1)[0]
plan=raw(out/'sources/current-conversation.md').split('Saved plan (doc X7D1XMP5_XpGdpyYKCVNZ):\n',1)[1].split('\n[2026-10-13 13:02:35 UTC] (user/plan_revision)',1)[0]
assert (out/'spec.md').read_bytes()==spec.encode()
assert (out/'implementation-plan.md').read_bytes()==plan.encode()
assert sha(spec.encode()) in source and sha(plan.encode()) in source
originals=0
for p in (out/'sources').glob('git-*.md'):
 path=re.search(r'原路径：`([^`]+)`',p.read_text(encoding='utf-8')).group(1)
 b=git('show',base+':'+path);assert raw(p).encode()==b,p
 assert sha(b) in source and git('rev-parse',base+':'+path).decode().strip() in source
 originals+=1
logs=0
for p in (out/'sources').glob('evidence-*.md'):
 if p.name=='evidence-index.md': continue
 row=next(l for l in evidence.splitlines() if '('+p.name+')' in l)
 assert sha(raw(p).encode()) in row and sha(p.read_bytes()) in row,p
 logs+=1
def prose(p): return re.sub(r'```[^\n]*\n[\s\S]*?```','',p.read_text(encoding='utf-8'))
links=0
for p in out.rglob('*.md'):
 for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',prose(p)):
  if re.match(r'^(https?:|mailto:|todo:|doc:)',link): continue
  target,_,anchor=urllib.parse.unquote(link).partition('#')
  resolved=(p.parent/target).resolve() if target else p
  assert resolved.exists(),(p,link)
  if anchor:
   text=resolved.read_text(encoding='utf-8')
   anchors=set(re.sub(r'[^\w\u4e00-\u9fff-]','',m.lower().replace(' ','-')) for m in re.findall(r'^#+\s+(.+)$',text,re.M))
   assert anchor in anchors,(p,link)
  links+=1
matrix=(out/'acceptance-matrix.md').read_text(encoding='utf-8')
for term in ['happy path','越权','非法状态','重复幂等','旧 revision','事务失败','webhook／job 重放','并发','重启／outbox 恢复']:
 assert '| '+term+' |' in matrix,term
assert matrix.count('待创建')>=6
design=(out/'deployment-design.md').read_text(encoding='utf-8')
for term in ['个人 Lite','小团队','企业自部署','不支持组合','迁移失败','原卷保留','完整备份']: assert term in design,term
assert 'WORM' in (out/'guarantee-decisions.md').read_text(encoding='utf-8')
for path in ['docs/adr/0071-lite-single-node-self-hosted-deployment.md','docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md']:
 assert 'Status: Proposed' in (root/path).read_text(encoding='utf-8')
staged=git('diff','--cached','--name-only').decode().splitlines()
assert staged and all(p.startswith('docs/plan/ta01-self-hosted-deployment/') and p.endswith('.md') for p in staged)
for p in staged: assert (root/p).read_bytes()==git('show',':'+p),('暂存字节',p)
secretsFile=Path(__file__).parent/'private.env'
if secretsFile.exists():
 sensitive={k:v for k,v in (l.split('=',1) for l in secretsFile.read_text(encoding='utf-8').splitlines()) if any(t in k for t in ['PASSWORD','SECRET','TOKEN','MASTER_KEY','HMAC_KEY','CURSOR_KEYS'])}
 for p in out.rglob('*.md'):
  text=p.read_text(encoding='utf-8')
  for k,value in sensitive.items(): assert value not in text,('秘密值泄漏',p,k)
print(json.dumps({'platformSources':count,'gitOriginals':originals,'runtimeOriginals':logs,'links':links,'stagedFiles':len(staged),'allIndexBytesMatch':True,'nineTestClasses':True,'secretsCheck':True}))
```
