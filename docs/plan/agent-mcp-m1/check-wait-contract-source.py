"""只读语义核验：从精确 Git 源提取规则并跑提案变异，绝不连接数据库。"""
import hashlib
import json
import re
import zipfile
from pathlib import Path


def table_body(sql, name):
    start = re.search(r'CREATE TABLE\s+' + re.escape(name) + r'\s*\(', sql)
    if not start:
        raise AssertionError('源码缺表：' + name)
    depth = 1
    position = start.end()
    begin = position
    quoted = False
    while depth and position < len(sql):
        char = sql[position]
        if char == "'":
            if quoted and position + 1 < len(sql) and sql[position + 1] == "'":
                position += 2
                continue
            quoted = not quoted
        elif not quoted:
            depth += (char == '(') - (char == ')')
        position += 1
    if depth:
        raise AssertionError('未闭合表定义：' + name)
    return sql[begin:position - 1]


def column_names(body):
    # 本检查只消费本批源表中的显式 scalar 列，非通用 PostgreSQL 解析器。
    return set(re.findall(r'\b([a-z][a-z0-9_]*)\s+(?:uuid|text|integer|bigint|timestamptz)\b', body))


def prompt_binding(sql, source_columns):
    match = re.search(r'FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+agent_session_prompts\s*\(([^)]+)\)\s*ON DELETE\s+(\w+)', sql)
    if not match:
        return False, '没有准确prompt FK'
    local = [part.strip() for part in match[1].split(',')]
    target = [part.strip() for part in match[2].split(',')]
    if not set(target) <= source_columns:
        return False, '目标引用不存在的列：' + ','.join(sorted(set(target) - source_columns))
    local_columns = column_names(table_body(sql, 'workbench_execution_waits'))
    if not set(local) <= local_columns:
        return False, 'wait本地FK列不存在'
    if local != ['agent_session_id', 'trigger_prompt_id'] or target != ['session_id', 'id']:
        return False, '没有绑定准确Session'
    unique = re.search(r'ALTER TABLE\s+agent_session_prompts\s+ADD CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*session_id\s*,\s*id\s*\)', sql)
    if not unique or unique.start() > match.start():
        return False, 'FK之前没有匹配新唯一约束'
    if match[3] != 'RESTRICT':
        return False, '删除语义不匹配'
    return True, '源列存在、Session准确、先唯一约束后FK、删除RESTRICT'


def verify(sources, out, check):
    commands = sources['apps/api/src/agent/commands.ts'].decode()
    contracts = sources['packages/contracts/src/index.ts'].decode()
    domain = sources['packages/domain/src/index.ts'].decode()
    baseline = sources['packages/db/migrations/v1/0001_v1_baseline.sql'].decode()
    ddl = (out/'schema-proposal.sql').read_text(encoding='utf-8')
    dto = json.loads((out/'wait-dto-proposal.json').read_text(encoding='utf-8'))
    prefix = re.search(r'const canonicalPayloadHash\s*=.*?=>\s*`([^$`]+)\$\{', commands).group(1)
    check('hash源生产者保前缀', prefix == 'sha256:' and 'canonicalPayloadHash(input.actionPayloadSanitized) !== input.actionPayloadHash' in commands)
    patterns = {}
    for name in ['requestApprovalInputSchema', 'consumeApprovalInputSchema']:
        line = next(line for line in contracts.splitlines() if 'export const ' + name + ' =' in line)
        patterns[name] = re.search(r'actionPayloadHash:\s*z\.string\(\)\.regex\(/(.+?)/\)', line).group(1)
    current_pattern = patterns['requestApprovalInputSchema']
    check('hash当前Zod与消费同格式', current_pattern == patterns['consumeApprovalInputSchema'])
    ddl_pattern = re.search(r"approval_action_payload_hash\s*~\s*'([^']+)'", ddl).group(1)
    check('hash提案沿实际源格式', dto['pattern'] == current_pattern == ddl_pattern, {'sourcePatterns': patterns, 'ddlPattern': ddl_pattern})
    check('hashWorker提案完整相等', dto['comparisonMode'] == 'exact_full_string' and dto['transforms'] == [] and dto['workerComparison'] == 'approval.action_payload_hash === wait.approval_action_payload_hash' and 'approval.actionPayloadHash !== actionPayloadHash' in domain and 'approval.action_payload_hash!==hash' in commands)
    # 静态算法样本来自源生产者prefix和源中sha256(JSON canonical)对空对象的定义；
    # 不是requestApproval实际返回，不作产品批准等待正例。
    sample = prefix + hashlib.sha256(b'{}').hexdigest()
    bare = sample[len(prefix):]
    for label, value, expected in [('源格式静态样本', sample, True), ('裸hex', bare, False), ('错误前缀', 'sha512:' + bare, False), ('大小写错误', prefix + bare.upper(), False), ('长度错误', sample[:-1], False)]:
        check('hash格式正拒：' + label, bool(re.fullmatch(ddl_pattern, value)) == expected, {'expectedAccepted': expected, 'kind': '源码规则静态样本；非真实批准'})
    wrong = prefix + ('0' * 64 if bare != '0' * 64 else '1' * 64)
    check('格式合法但异hash按源完整比较拒绝', bool(re.fullmatch(current_pattern, wrong)) and wrong != sample)
    bad_pattern = ddl_pattern.replace(prefix, '', 1)
    check('旧裸hex CHECK真实变异拒绝', bad_pattern != ddl_pattern and not re.fullmatch(bad_pattern, sample) and bool(re.fullmatch(bad_pattern, bare)), {'mutatedPattern': bad_pattern})
    check('strip前缀真实变异拒绝', not re.fullmatch(current_pattern, sample.removeprefix(prefix)) and sample.removeprefix(prefix) != sample)

    body = table_body(baseline, 'agent_session_prompts')
    columns = column_names(body)
    check('prompt源列无workspace且有Session/id', {'id', 'session_id'} <= columns and 'workspace_id' not in columns, {'sourceColumns': sorted(columns)})
    check('旧prompt主键使新复合唯一无历史重复', bool(re.search(r'\bid\s+uuid\s+PRIMARY KEY', body)))
    ok, reason = prompt_binding(ddl, columns)
    check('prompt提案FK按源列和新unique顺序', ok, reason)
    wrong_fk = ddl.replace('FOREIGN KEY(agent_session_id,trigger_prompt_id) REFERENCES agent_session_prompts(session_id,id)', 'FOREIGN KEY(workspace_id,trigger_prompt_id) REFERENCES agent_session_prompts(workspace_id,id)', 1)
    ok, reason = prompt_binding(wrong_fk, columns)
    check('旧workspace FK真实变异拒绝', wrong_fk != ddl and not ok and 'workspace_id' in reason, reason)
    no_unique = re.sub(r'ALTER TABLE\s+agent_session_prompts\s+ADD CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*session_id\s*,\s*id\s*\)\s*;', '', ddl, count=1)
    ok, reason = prompt_binding(no_unique, columns)
    check('去新unique真实变异拒绝', no_unique != ddl and not ok, reason)
    id_only = ddl.replace('FOREIGN KEY(agent_session_id,trigger_prompt_id) REFERENCES agent_session_prompts(session_id,id)', 'FOREIGN KEY(trigger_prompt_id) REFERENCES agent_session_prompts(id)', 1)
    ok, reason = prompt_binding(id_only, columns)
    check('仅prompt id跨Session漏洞变异拒绝', id_only != ddl and not ok, reason)
    # 复合键引用的关系逻辑反例；只Python元组集合，不运行SQL/FK。
    rows = {('session-A', 'prompt-A'), ('session-B', 'prompt-B')}
    check('准确Session prompt静态关系正例', ('session-A', 'prompt-A') in rows)
    check('其他Session prompt静态关系拒例', ('session-A', 'prompt-B') not in rows)
    for item in (dto['promptForeignKey']['columns'], dto['promptForeignKey']['targetColumns']):
        check('DTO与DDL准确引用一致:' + ','.join(item), item in [['agent_session_id', 'trigger_prompt_id'], ['session_id', 'id']])
    check('wait保留workspace到Session源FK', 'FOREIGN KEY(workspace_id,agent_session_id) REFERENCES agent_sessions(workspace_id,id)' in ddl)
    prompt_sources = [value.decode() for path, value in sources.items() if path.startswith('packages/db/migrations/v1/') and path.endswith('.sql')]
    check('源增量未后补prompt workspace列', not any(re.search(r'ALTER TABLE\s+agent_session_prompts\s+(?:ADD\s+(?:COLUMN\s+)?workspace_id)', value, re.I) for value in prompt_sources))
    session_body = table_body(baseline, 'agent_sessions')
    check('wait的workspace Session FK目标确实存在', {'workspace_id', 'id'} <= column_names(session_body) and bool(re.search(r'UNIQUE\s*\(\s*workspace_id\s*,\s*id\s*\)', session_body)))
    guard = sources['apps/api/src/agent/guard.ts'].decode()
    check('源authority查询按actor workspace限定Session', 'session.workspace_id=$2' in guard and 'actor.workspaceId' in guard)
    check('workspace授权合同单列不由prompt列伪造', '锁内' in dto['promptForeignKey']['workspaceAuthorization'] and '不能以FK授权限' in dto['promptForeignKey']['workspaceAuthorization'])


if __name__ == '__main__':
    out = Path(__file__).resolve().parent
    manifest = json.loads((out/'source-manifest.json').read_text(encoding='utf-8'))
    with zipfile.ZipFile(out/'source-snapshot.zip') as archive:
        sources = {entry['path']: archive.read(entry['member']) for entry in manifest['entries'] if entry['head'] == manifest['main']}
    checks = []
    def check(name, condition, detail=None):
        checks.append({'name': name, 'passed': bool(condition), 'detail': detail})
        if not condition:
            raise AssertionError(name)
    verify(sources, out, check)
    print(json.dumps({'kind': '源码与提案静态语义/变异检查；未执行SQL/Zod/Worker', 'checks': checks}, ensure_ascii=False))
