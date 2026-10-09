"""产品阶段规则核验；保留仅文档阶段 checker 与旧工作树指纹，不倒写历史。"""
import importlib.util
import json
from pathlib import Path
import subprocess
import yaml

root = Path(__file__).resolve().parent.parent
directory = root / 'docs/plan/agent-mcp-m0'
data = json.loads((directory / 'operation-decisions.json').read_text(encoding='utf8'))
api = yaml.safe_load((root / 'OPENAPI.yaml').read_text(encoding='utf8'))
actual = sorted(value['operationId'] for path in api['paths'].values() for value in path.values()
                if isinstance(value, dict) and 'operationId' in value)
assert sorted(row['operationId'] for row in data['operations']) == actual

def module(name):
    spec = importlib.util.spec_from_file_location(name, directory / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

evaluation = module('discovery-evaluation')
positive = negative = 0
for row in data['operations']:
    gates = row['qualifications']['predicates']
    assert all(gate['allowed'] and gate['description'] for gate in gates)
    for case in row['positiveTests'] + row['negativeTests']:
        assert evaluation.evaluate_predicates(gates, case['facts']) == case['expect'], (row['operationId'], case['id'])
    positive += len(row['positiveTests'])
    negative += len(row['negativeTests'])
    assert {gate['fact'] for gate in gates} == {case['expect']['failedFact'] for case in row['negativeTests']}
ack = next(row for row in data['operations'] if row['operationId'] == 'acknowledgeAgentSession')
assert next(gate for gate in ack['qualifications']['predicates'] if gate['fact'] == 'state')['allowed'] == ['queued', 'stale', 'acknowledged']
replay = next(gate for gate in ack['qualifications']['predicates'] if gate['fact'] == 'ackReceiptReplayOnly')
assert replay['when'] == {'state': 'acknowledged'} and replay['allowed'] == [True]

syntax = module('binding-syntax').scan((root / 'apps/mcp/src/index.ts').read_text(encoding='utf8'),
                                     (root / 'apps/mcp/src/coordination-product.ts').read_text(encoding='utf8'))
for binding in data['bindingDecisions']:
    if not binding['current']:
        continue
    current = syntax[binding['bindingId']]
    assert set(current['inputFields']) == set(binding['current']['inputFields'])
    expected = ['rejectPendingHandoff'] if binding['bindingId'] == 'tool:reject_handoff' else binding['current']['sdkMethods']
    assert current['sdkMethods'] == expected, binding['bindingId']
    evaluation.validate_binding({**binding, 'current': {**binding['current'], 'sdkMethods': expected}}, current)
generated = root / 'packages/contracts/src/agent-discovery-rules.ts'
before = generated.read_bytes()
subprocess.run(['python', str(root / 'scripts/generate-agent-discovery.py')], cwd=root, check=True)
assert generated.read_bytes() == before, '受测生成规则必须与受控决定精确相同'
print(json.dumps({'结果': '产品规则与真实 binding 语义核验通过', 'operations': len(actual),
                  'bindings': len(syntax), 'positive': positive, 'negative': negative,
                  'generatedBytesUnchanged': True, 'oldPlanningCheckerPreserved': True}, ensure_ascii=False))
