# 本任务 Docker 收尾规则

下面是本轮准确资源的受控收尾脚本原件，仅供审阅，不应重跑。它读取本轮临时账本，逐对象核身份、停止服务、检查外部引用并定向移除；首败即停。Config.Env、Cmd、私有标签和卷驱动选项不进入回执。

```python
from pathlib import Path
import subprocess,json,datetime
owned=Path(__file__).parent;owner='workmesh-ta01-pui_xhb6'
r=json.loads((owned/'measurement-fixture-recheck.json').read_text(encoding='utf-8'))
receipt={'owner':owner,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commands':[],'resources':[],'outcome':'未运行'}
def save(): (owned/'cleanup.json').write_bytes(json.dumps(receipt,ensure_ascii=False,indent=2).encode())
def run(args,required=True):
 p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
 receipt['commands'].append({'args':args,'code':p.returncode,'stdout':p.stdout,'stderr':p.stderr});save()
 if required and p.returncode: raise RuntimeError('首败停止：'+str(args[:3]))
 return p
def inspect(kind,id):
 # 不保存完整 inspect，避免 Config.Env、Cmd 或自定义标签进入回执。
 p=subprocess.run(['docker']+([] if kind=='container' else [kind])+['inspect',id],capture_output=True,text=True,encoding='utf-8',errors='replace')
 if p.returncode: raise RuntimeError('身份读回失败：'+kind)
 return json.loads(p.stdout)[0]
try:
 ids=run(['docker','ps','-aq','--filter','label=com.docker.compose.project='+owner]).stdout.splitlines()
 expected={x['id'] for x in r['resources']}
 if set(ids)!=expected: raise RuntimeError('当前容器集与运行账本不符')
 mounts=set();networks=set()
 for id in ids:
  d=inspect('container',id);labels=d['Config']['Labels']
  if labels.get('com.docker.compose.project')!=owner or labels.get('workmesh.task')!=owner: raise RuntimeError('容器归属不符')
  receipt['resources'].append({'kind':'container','id':id,'service':labels.get('com.docker.compose.service'),'statusBefore':d['State']['Status'],'mounts':[{'type':m['Type'],'name':m.get('Name'),'destination':m['Destination']} for m in d['Mounts']]})
  mounts.update(m['Name'] for m in d['Mounts'] if m['Type']=='volume')
  networks.update(d['NetworkSettings']['Networks'])
 for name in mounts:
  d=inspect('volume',name)
  if d['Labels'].get('com.docker.compose.project')!=owner: raise RuntimeError('卷归属不符')
 for name in networks:
  d=inspect('network',name)
  if d['Labels'].get('com.docker.compose.project')!=owner or not set(d['Containers']).issubset(expected): raise RuntimeError('网络有外来引用')
 save()
 # 测量进程及采样线程已结束，原件已提交；只停止本账本中的容器。
 run(['docker','stop','--time','35',*ids])
 for id in ids:
  d=inspect('container',id)
  if d['State']['Running'] or d['Config']['Labels'].get('workmesh.task')!=owner: raise RuntimeError('容器停机或身份不符')
  run(['docker','rm',id])
 for name in mounts:
  if run(['docker','ps','-aq','--filter','volume='+name]).stdout.strip(): raise RuntimeError('卷仍有引用')
  if inspect('volume',name)['Labels'].get('com.docker.compose.project')!=owner: raise RuntimeError('卷身份变化')
  run(['docker','volume','rm',name]);receipt['resources'].append({'kind':'volume','id':name,'removed':True})
 for name in networks:
  d=inspect('network',name)
  if d['Containers'] or d['Labels'].get('com.docker.compose.project')!=owner: raise RuntimeError('网络仍有引用')
  run(['docker','network','rm',d['Id']]);receipt['resources'].append({'kind':'network','id':d['Id'],'name':name,'removed':True})
 build=json.loads((owned/'build-receipt-environment-recheck.json').read_text(encoding='utf-8'))
 image=inspect('image',build['tag'])
 if image['Id']!=build['imageId'] or image['Config']['Labels'].get('workmesh.task')!=owner: raise RuntimeError('应用镜像身份变化')
 if run(['docker','ps','-aq','--filter','ancestor='+image['Id']]).stdout.strip(): raise RuntimeError('应用镜像仍有引用')
 run(['docker','image','rm',build['tag']]);receipt['resources'].append({'kind':'image','id':image['Id'],'tag':build['tag'],'removed':True})
 for item in receipt['resources']:
  kind,id=item['kind'],item['id']
  args=['docker']+([] if kind=='container' else [kind])+['inspect','--format','{{.Name}}' if kind=='volume' else '{{.Id}}',id]
  p=run(args,False)
  absent=p.returncode!=0 and any(t in p.stderr.lower() for t in ['no such','not found'])
  item['absent']=absent
  if not absent: raise RuntimeError('不存在证明未成立：'+kind)
 receipt['outcome']='独有容器、卷、网络和应用镜像收尾完成；共享镜像与 build cache 保留'
except Exception as error:
 receipt['outcome']=str(error)
finally:
 receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 print(json.dumps({'outcome':receipt['outcome'],'resources':len(receipt['resources'])},ensure_ascii=False))
raise SystemExit(0 if receipt['outcome'].startswith('独有容器') else 1)
```
