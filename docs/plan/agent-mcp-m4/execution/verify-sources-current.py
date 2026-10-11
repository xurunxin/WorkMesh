"""完整不可变 Git blob 校验；当前运行字节单独记录，不用截断输出计算。"""
from pathlib import Path
import hashlib,json,subprocess
root=Path(__file__).resolve().parents[4]
folder=root/'docs/plan/agent-mcp-m4'
sources=[]
for name in ['input/source-manifest.json','input/discovery-review/source-manifest.json']:
    data=json.loads((folder/name).read_text(encoding='utf-8'))
    for record in data['records']:
        body=subprocess.run(['git','cat-file','blob',record['gitBlob']],cwd=root,capture_output=True,check=True).stdout
        assert len(body)==record['gitBytes'] and hashlib.sha256(body).hexdigest()==record['gitSha256'],record['path']
        sources.append({'manifest':name,'path':record['path'],'commit':record['commit'],'gitBlob':record['gitBlob'],'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'fullBlobVerified':True})
result={'main':subprocess.run(['git','rev-parse','refs/heads/main'],cwd=root,capture_output=True,check=True).stdout.decode().strip(),
 'headBeforePlatformCommit':subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,check=True).stdout.decode().strip(),
 'approvedPlan':'4adc5e39680e66543613d3f4f84c57a555fd94c1','sources':sources,
 'runtimeBytes':'每个实际命令 checks/*/receipt.json 的 before/after 与 source-objects，不能用 Git 校验代运行校验',
 'originalPlanningDelivery':'原57交付清单保留，不重写历史为当前实现；新产品交付清单另存'}
(folder/'execution/sources-current.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'fullBlobsVerified':len(sources),'main':result['main'],'head':result['headBeforePlatformCommit']}))
