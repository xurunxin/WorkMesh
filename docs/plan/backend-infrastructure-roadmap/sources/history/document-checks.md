# 文档专项复核脚本

此脚本只读本目录、准确基线 Git blob 与实际 index，无容器、服务、数据库或外部发送。
原工具返回比对在施工时还使用未提交的真实工具字符串完成；下面脚本从归档和登记哈希独立复核，不冒再次调用平台获得原始响应。

在仓库根目录，将下方 Python 段保存到本任务自己的临时目录，用 `python <临时脚本路径>` 执行。源码表和历史原件的相对链接仍按来源位置解释；只核原创导航与生成的源码绑定。

```python
from pathlib import Path
import hashlib,json,re,subprocess,urllib.parse
root=Path.cwd()
out=root/'docs/plan/backend-infrastructure-roadmap'
base='104f7afb8e89859549aa16af7a3114e90dea7f9b'
sha=lambda b:hashlib.sha256(b).hexdigest()
git=lambda *a:subprocess.check_output(['git',*a],cwd=root)
sources=(out/'sources.md').read_text(encoding='utf-8')
coverage=(out/'coverage-matrix.md').read_text(encoding='utf-8')
accept=(out/'dependencies-and-acceptance.md').read_text(encoding='utf-8')
raw={}
for n in range(1,63):
 p=out/f'sources/todos/{n:02}.md'
 b=p.read_bytes();t=b.decode()
 if n in [16,56]:
  original='\n'.join(json.loads(t.split('```json\n'.replace('`',chr(96)))[1].split('```'.replace('`',chr(96)))[0]))
 else:
  assert t.endswith('\n')
  original=t[:-1]
 raw[n]=original
 row=next(x for x in sources.splitlines() if x.startswith(f'| [#{n}]'))
 spec=original.split('\nSpec:\n',1)[1].split('\nSaved plan:',1)[0]
 assert '(truncated)' not in spec
 for h in [sha(original.encode()),sha(spec.encode()),sha(b),git('hash-object',str(p)).decode().strip()]:
  assert h in row,('来源指纹',n)
assert (out/'spec.md').read_text(encoding='utf-8').rstrip()==raw[32].split('\nSpec:\n',1)[1].split('\nSaved plan:',1)[0].rstrip()
conversation=(out/'sources/history/current-conversation.md').read_text(encoding='utf-8')
start=conversation.index('Saved plan (doc N_ON4oWLTxvM3OkjhbAok):\n')+len('Saved plan (doc N_ON4oWLTxvM3OkjhbAok):\n')
end=conversation.index('\n[2026-',start)
assert (out/'implementation-plan.md').read_text(encoding='utf-8').rstrip()==conversation[start:end].rstrip()
for p in (out/'sources/history').glob('repository-*.md'):
 row=next(x for x in sources.splitlines() if f'[{p.relative_to(out).as_posix()}]' in x)
 orig=re.search(r'\]\(\.\./\.\./\.\./([^)]*)\)',row).group(1)
 b=git('show',base+':'+orig)
 assert p.read_bytes()==b and sha(b) in row
ids=re.findall(r'operationId:\s*([A-Za-z]\w*)',git('show',base+':OPENAPI.yaml').decode())
actual=re.findall(r'^\| `([A-Za-z]\w+)`<br>`(?:GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS) '.replace('`',chr(96)),coverage,re.M)
assert len(actual)==len(ids)==281 and set(actual)==set(ids) and len(set(actual))==281
retained=[4,*range(23,30),*range(33,52)]
for n in retained:
 assert f'sources/todos/{n:02}.md' in coverage and f'sources/todos/{n:02}.md' in accept
 text=raw[n];a=text.find('## 测试清单');b=text.find('## DoD')
 if a>=0 and b>a:
  for line in text[a:b].splitlines():
   if line.startswith('- [ ]') and not any(x in line for x in ['针对本特性','涉及 schema','运行 pnpm']):
    assert line in accept,('专项断言',n,line)
table=accept.split('## 逐卡依赖')[1].split('## 九类验收')[0]
edges=[]
for line in table.splitlines():
 if not line.startswith('| [#'):continue
 cols=line.split('|');n=int(re.search(r'#(\d+)',cols[1]).group(1))
 for col in cols[2:4]:
  for a in re.findall(r'\[#(\d+)\]',col):
   assert int(a) not in [10,11,12,13,14,21,22,30]
   edges.append((int(a),n))
indeg={n:0 for n in range(1,63)};adj={n:[] for n in indeg}
for a,b in set(edges):indeg[b]+=1;adj[a].append(b)
q=[n for n,x in indeg.items() if x==0];count=0
while q:
 n=q.pop();count+=1
 for t in adj[n]:
  indeg[t]-=1
  if indeg[t]==0:q.append(t)
assert count==62
assert not any(a in [4,49,50] and b not in [4,49,50] for a,b in edges)
assert not any(a>=32 and b in range(54,60) for a,b in edges)
links=0
for name in ['README.md','sources.md','coverage-matrix.md','dependencies-and-acceptance.md','verification.md','sources/history/main-source-binding.md']:
 p=out/name
 text=re.sub(r'```[^\n]*\n[\s\S]*?```'.replace('`',chr(96)),'',p.read_text(encoding='utf-8'))
 for m in re.finditer(r'\[[^\]]+\]\(([^)]+)\)',text):
  url=m.group(1)
  if re.match(r'^(https?:|todo:|mailto:|#)',url):continue
  t=(p.parent/urllib.parse.unquote(url.split('#')[0])).resolve()
  assert t.exists(),(name,url);links+=1
  if '#' in url and t.suffix=='.md':
   frag=urllib.parse.unquote(url.split('#')[1])
   heads=re.findall(r'^#{1,6} (.+)$',t.read_text(encoding='utf-8'),re.M)
   assert frag in [re.sub(r'[^\w\-一-龥 ]','',h).replace(' ','-').lower() for h in heads],url
changed=git('diff','--cached','--name-only','-z').decode().split('\0')
assert all(p.startswith('docs/plan/backend-infrastructure-roadmap/') and p.endswith('.md') for p in changed if p)
print(json.dumps({'sourceCards':62,'historicalFiles':25,'proposalCards':27,'goalEntries':len(re.findall(r'^\| \d+ \|',coverage,re.M)),'operations':281,'dependencyEdges':len(edges),'acyclic':True,'links':links},ensure_ascii=False))

```
