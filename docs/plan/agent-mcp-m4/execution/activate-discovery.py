"""消费实际后端合同及公共注册证据，激活已独审增量，不倒写历史。"""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[4]
folder=root/'docs/plan/agent-mcp-m4'
path=folder/'product-discovery-decisions.json'
data=json.loads(path.read_text(encoding='utf-8'))
backend=json.loads((folder/'execution/checks/backend-a2a-final-gate-current-identity/receipt.json').read_text(encoding='utf-8'))
capture=json.loads((folder/'execution/registration-capture.json').read_text(encoding='utf-8'))
if backend['exitCode']!=0 or capture['kind']!='actual_registerTool_registerResource': raise ValueError('缺实际通过/注册')
for source in capture['sources']:
    if hashlib.sha256((root/source['path']).read_bytes()).hexdigest()!=source['sha256']: raise ValueError('注册源码已变：'+source['path'])
actual=next(item['bindings'] for item in capture['captures'] if item['mode']=='read-write')
missing=set(binding['bindingId'] for binding in data['bindings'])-set(actual)
if missing: raise ValueError('拟绑定未真实注册：'+str(missing))
data.setdefault('historicalPlanningSource',data['source'].copy())
data['source'].update(reviewedCandidate='4adc5e39680e66543613d3f4f84c57a555fd94c1',status='已正式方案独审并实现；当前产品验证进行中，未整批验收')
data['registrationEvidence']='docs/plan/agent-mcp-m4/execution/registration-capture.json'
data['backendContractEvidence']='docs/plan/agent-mcp-m4/execution/checks/backend-a2a-final-gate-current-identity/receipt.json'
data['registeredBindingIds']=actual
data['activation'].update(formalReviewClosed=True,backendContractPassed=True,registrationCaptured=True)
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'actualBindings':len(actual),'selectedCaptured':len(data['bindings']),'productChecksStillRequired':True}))
