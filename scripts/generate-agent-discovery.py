"""从已独审受控清单生成发现规则；不从回调文本猜测调用身份。"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'docs/plan/agent-mcp-m0/operation-decisions.json').read_text(encoding='utf-8'))
rules = []
for operation in source['operations']:
    qualification = operation['qualifications']
    predicates = [{key: predicate[key] for key in ('fact', 'allowed', 'reason')} for predicate in qualification['predicates']]
    if qualification['scope']['typeRequired'] and not any(item['fact'] == 'delegationScopeType' for item in predicates):
        predicates.append(dict(fact='delegationScopeType', allowed=[qualification['scope']['typeRequired']], reason='RESOURCE_SCOPE_DENIED'))
    rules.append(dict(
        operationId=operation['operationId'],
        predicates=predicates,
        capabilities=qualification['capabilitiesAll'],
        feature=qualification['feature']['key'],
        variants=operation['variants'],
        write=operation['rest']['method'] != 'GET',
    ))
bindings = []
for binding in source['bindingDecisions']:
    proposed = binding['proposed']
    bindings.append(dict(
        bindingId=binding['bindingId'],
        operationIds=proposed['operationIds'],
        execution=proposed['execution'],
        mode=proposed['mode'],
        coordination=proposed['coordinationConfiguredRequired'],
        identityBinding=proposed['identityBinding'],
        targetParameter=proposed['targetParameter'],
        variant=proposed['variant'],
        identityVariants=[dict(
            variant=variant['variant'],
            credentialMode=variant['credentialMode'] if isinstance(variant['credentialMode'], list) else [variant['credentialMode']],
            targetParameter=variant['targetParameter'],
            installationBridgeRequired=variant['installationBridgeRequired'],
        ) for variant in proposed['identityVariants']],
    ))
output = '// 由 scripts/generate-agent-discovery.py 从已独审清单生成；修改规则须先核授权源码。\n'
output += "import type { DiscoveryRule, DiscoveryBindingRule } from './agent-discovery.js'\n\n"
for name, data, type_name in [('agentDiscoveryRules', rules, 'DiscoveryRule'), ('agentDiscoveryBindings', bindings, 'DiscoveryBindingRule')]:
    output += f'export const {name}: readonly {type_name}[] = [\n'
    output += ',\n'.join('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in data)
    output += '\n]\n\n'
(root / 'packages/contracts/src/agent-discovery-rules.ts').write_text(output, encoding='utf-8', newline='\n')
