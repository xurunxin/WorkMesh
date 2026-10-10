"""从已独审受控清单生成发现规则；不从回调文本猜测调用身份。"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'docs/plan/agent-mcp-m0/operation-decisions.json').read_text(encoding='utf-8'))
m1 = json.loads((root / 'docs/plan/agent-mcp-m1/operation-decisions.json').read_text(encoding='utf-8'))
# M0 是冻结历史输入；当前发现由批次增量合成，不倒写旧报告。
operations = {operation['operationId']: operation for operation in source['operations']}
for operation in m1['operations']:
    if operation.get('historicalM0'):
        operations[operation['operationId']] = operation['historicalM0']
rules = []
for operation in operations.values():
    qualification = operation['qualifications']
    predicates = [{key: predicate[key] for key in ('fact', 'allowed', 'reason', 'when') if key in predicate} for predicate in qualification['predicates']]
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
rules.append(dict(
    operationId='getAgentSessionExecutionResult', predicates=[
        dict(fact='credentialMode', allowed=['human_session', 'installation_target'], reason='CREDENTIAL_MODE_MISMATCH'),
        dict(fact='exactExecutionOrigin', allowed=[True], reason='NOT_FOUND'),
        dict(fact='liveAuthority', allowed=[True], reason='AUTHORITY_REVOKED'),
    ], capabilities=['work:read'], feature=None, variants=[], write=False,
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
registered_bindings = {binding['bindingId'] for binding in bindings}
target_session_operations = {
    'listAgentPlanVersions', 'listApprovals', 'heartbeatLease', 'renewLease', 'releaseLease',
    'listRecoveryItems', 'consumeApproval',
}
for operation in m1['operations']:
    name = operation['proposed'].get('mcp')
    if not name or not name.isascii() or ' ' in name or name == 'adapter' or name.startswith('adapter'):
        continue
    binding_id = 'tool:' + name
    if binding_id in registered_bindings:
        continue
    registered_bindings.add(binding_id)
    operation_id = operation['operationId']
    confirmation = operation_id == 'getAgentSessionExecutionResult'
    stop_ack = operation_id == 'acknowledgeAgentSessionStop'
    target = 'sessionId' if operation_id in target_session_operations or confirmation or stop_ack else None
    variants = [dict(variant='installation_target', credentialMode=['installation_target'], targetParameter=target,
                     installationBridgeRequired=True)] if confirmation else [
        dict(variant='self_execution' if target else 'current_session', credentialMode=['agent_session'],
             targetParameter=target, installationBridgeRequired=False),
    ]
    if not stop_ack and not confirmation:
        variants.append(dict(variant='target_execution' if target else 'current_session',
                             credentialMode=['coordination_connection'], targetParameter=target,
                             installationBridgeRequired=bool(target)))
        if target and operation_id != 'listAgentPlanVersions' and operation_id != 'consumeApproval':
            variants.append(dict(variant='current_session_without_target', credentialMode=['coordination_connection'],
                                 targetParameter=target, installationBridgeRequired=False))
    bindings.append(dict(bindingId=binding_id, operationIds=[operation_id], execution='api',
                         mode=['read-only', 'read-write'] if operation['rest']['method'] == 'GET' else ['read-write'],
                         coordination=False, identityBinding='installation_target' if confirmation else 'explicit_identity_variants',
                         targetParameter=target, variant=None, identityVariants=variants))
# M2 preserves frozen inputs and applies the reviewed consumer increment.
m2 = json.loads((root / 'docs/plan/agent-mcp-m2/product-discovery-decisions.json').read_text(encoding='utf-8'))
rule_by_id = {rule['operationId']: rule for rule in rules}
for rule in m2['rules']:
    rule_by_id[rule['operationId']] = rule
rules = list(rule_by_id.values())
binding_by_id = {binding['bindingId']: binding for binding in bindings}
for binding in m2['bindings']:
    binding_by_id[binding['bindingId']] = binding
bindings = list(binding_by_id.values())
output = '// 由 scripts/generate-agent-discovery.py 从已独审清单生成；修改规则须先核授权源码。\n'
output += "import type { DiscoveryRule, DiscoveryBindingRule } from './agent-discovery.js'\n\n"
for name, data, type_name in [('agentDiscoveryRules', rules, 'DiscoveryRule'), ('agentDiscoveryBindings', bindings, 'DiscoveryBindingRule')]:
    output += f'export const {name}: readonly {type_name}[] = [\n'
    output += ',\n'.join('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in data)
    output += '\n]\n\n'
(root / 'packages/contracts/src/agent-discovery-rules.ts').write_text(output.rstrip() + '\n', encoding='utf-8', newline='\n')
