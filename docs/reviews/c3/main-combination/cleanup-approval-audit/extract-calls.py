"""只读提取本会话既有工具调用，写入受控审计文件；绝不执行提取的命令。"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('session', type=Path)
args = parser.parse_args()
directory = Path(__file__).resolve().parent
start = '2026-10-08T11:29:03.882Z'
end = '2026-10-08T12:01:14.412Z'
raw = args.session.read_bytes()
calls = {}
visible = []
offset = 0
cutoff = None
for number, line in enumerate(raw.splitlines(keepends=True), 1):
    row = json.loads(line)
    payload = row.get('payload', {})
    timestamp = row.get('timestamp', '')
    if timestamp == end and payload.get('type') == 'message' and payload.get('phase') == 'final_answer':
        cutoff = offset + len(line)
    if start <= timestamp < end and row.get('type') == 'response_item' and payload.get('type') in [
        'custom_tool_call', 'custom_tool_call_output', 'function_call', 'function_call_output',
    ]:
        # 保留完整可见 input/output，排除不属于操作证据的内部 opaque metadata；不提取 analysis。
        exported = {'timestamp': timestamp, 'type': row['type'],
                    'payload': {k: v for k, v in payload.items() if k != 'internal_chat_message_metadata_passthrough'}}
        visible.append(exported)
        call_id = payload['call_id']
        record = calls.setdefault(call_id, {'callID': call_id, 'records': [], 'results': []})
        record['records'].append({'timestamp': timestamp, 'type': payload['type'],
                                 'sourceLine': number, 'sourceByteOffset': offset,
                                 'originalRecordBytes': len(line), 'originalRecordSha256': hashlib.sha256(line).hexdigest()})
        if payload['type'] in ['custom_tool_call', 'function_call']:
            record['name'] = payload['name']
            record['input'] = payload.get('input', payload.get('arguments'))
            record['startedAt'] = timestamp
        else:
            record['output'] = payload['output']
            record['returnedAt'] = timestamp
            blocks = payload['output'] if isinstance(payload['output'], list) else [{'text': payload['output']}]
            for block in blocks:
                text = block.get('text', '')
                try:
                    result = json.loads(text)
                except (ValueError, TypeError):
                    continue
                if isinstance(result, dict) and any(k in result for k in ['chunk_id', 'exit_code', 'session_id']):
                    record['results'].append(result)
    offset += len(line)
assert cutoff is not None
assert all('input' in row and 'output' in row for row in calls.values())

refusal_ids = ['call_a694c2419db74628858fd2b79f9ee0c8', 'call_e06e825e469d455191f17c413f25c6a5']
move_id = 'call_daf2599d8ae943d5bd10995153cf3e33'
delete_id = 'call_b86def6a5f4a4b7ab3004fb6a5c8e009'
assert all(k in calls for k in [*refusal_ids, move_id, delete_id])
archive = directory / 'calls.zip'
assert not archive.exists(), '禁止覆盖已保全原件'
members = {}
members['visible-tool-records.jsonl'] = ''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in visible).encode()
index_calls = []
for call_id, record in calls.items():
    input_member = call_id + '/input.txt'
    output_member = call_id + '/output.json'
    members[input_member] = record['input'].encode()
    members[output_member] = (json.dumps(record['output'], ensure_ascii=False, indent=2) + '\n').encode()
    commands = []
    for count, match in enumerate(re.finditer(r'tools\.exec_command\(\{cmd:("(?:\\.|[^"\\])*")', record['input']), 1):
        command = json.loads(match[1])
        member = call_id + f'/command-{count}.txt'
        members[member] = command.encode()
        commands.append({'index': count, 'member': member, 'sha256': hashlib.sha256(command.encode()).hexdigest()})
    index_calls.append({k: v for k, v in record.items() if k not in ['input', 'output', 'results']} | {
        'inputMember': input_member, 'outputMember': output_member, 'decodedCommands': commands,
        'processResults': [{k: row[k] for k in ['chunk_id', 'session_id', 'exit_code', 'wall_time_seconds'] if k in row}
                           for row in record['results']],
    })

with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as zipped:
    for name, data in members.items():
        zipped.writestr(name, data)
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    for name, data in members.items():
        assert zipped.read(name) == data
    member_index = [{'member': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                     'crc32': zipped.getinfo(name).CRC} for name, data in members.items()]

root = 'C:\\Users\\xurx\\.tds\\workspaces\\01a11890-f4de-7106-b64d-e1b2c0d4608e'
first_target = root + '\\.tmp\\c3-main-combination-01a11890'
targets = [root + '\\' + path for path in [
    '.tmp\\c3-main-combination-first-capture', '.tmp\\c3-main-combination-01a11890',
    '.tmp\\c3-main-combination-01a11890-retry', '.tmp\\c3-main-combination-01a11890-accepted',
    '.tmp\\c3-main-combination-01a11890-browser', 'playwright.c3-combination.config.ts',
]]
refusals = []
for count, call_id in enumerate(refusal_ids):
    record = calls[call_id]
    text = json.dumps(record['output'], ensure_ascii=False)
    assert 'blocked by policy' in text and 'Script failed' in text
    refusals.append({'id': 'R' + str(count + 1), 'executorCallID': call_id,
                     'inputTime': record['startedAt'], 'outputTime': record['returnedAt'],
                     'targets': [first_target] if count == 0 else targets,
                     'rejectedCommandIndex': 2 if count == 0 else 1,
                     'reasonAsReturned': 'blocked by policy', 'rejectedProcessExitCode': None,
                     'rejectedProcessStarted': False, 'innerToolCallID': None,
                     'outputContainsRuntimeTruncation': 'truncated' in text,
                     'partialPrecedingCalls': record['results'] if count == 0 else [],
                     'note': 'R1 同一 exec 的前序 Stop-Process/读取与 apply_patch 已发生，之后另一 exec_command 被拒；不能把前序 exit=0 当被拒命令退出码。' if count == 0
                             else '该 exec_command 在启动前被拒；返回没有更详细审批理由。'})
assert calls[delete_id]['results'][0]['exit_code'] == 0
receipt = json.loads((directory.parent / 'temporary-cleanup.json').read_text(encoding='utf-8-sig'))
assert [row['Path'] for row in receipt] == targets
assert all(row['VerifiedAbsent'] for row in receipt)

known_paths = []
for item in json.loads((directory.parent / 'checks-raw-index.json').read_text(encoding='utf8'))['members']:
    path = item['originalPath']
    matched = [target for target in targets if path == target or path.startswith(target + '\\')]
    if matched:
        known_paths.append({'path': path, 'rejectedAncestor': matched[0], 'archiveMember': item['member'],
                            'archiveSha256': item['sha256'], 'evidenceType': '此前确实存在并保全的文件；不是逐项删除回执'})

def save(name, value):
    (directory / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

save('calls-index.json', {'source': {'path': str(args.session), 'sessionID': '01a11891-35a8-74c3-bb5a-a9aabdd3baa2',
     'prefixBytes': cutoff, 'prefixSha256': hashlib.sha256(raw[:cutoff]).hexdigest(),
     'timeRangeStartInclusive': start, 'timeRangeEndExclusive': end},
     'extractionPolicy': '只导出 response_item 的可见工具调用及输出；完整保留 input 和 output 值；不提取 analysis、私有推理或 opaque metadata。原 JSONL 未改，原行 SHA/偏移可复核。',
     'archive': archive.name, 'archiveBytes': archive.stat().st_size,
     'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'records': len(visible),
     'calls': index_calls, 'members': member_index, 'archiveVerifiedAgainstExtractedOriginalValues': True})
save('incident.json', {'status': '拒绝后对相同目标换方式操作确已发生；待定向独审，不能宣称清理审批通过',
     'refusals': refusals,
     'actualSubsequentOperations': [
         {'executorCallID': move_id, 'inputTime': calls[move_id]['startedAt'], 'outputTime': calls[move_id]['returnedAt'],
          'action': 'Move-Item 后启动检查，检查脚本重新创建同名临时目录',
          'sourcePath': first_target, 'destinationPath': targets[0], 'rejectedTargetRelation': '操作 R1 原被拒目标，不能归为独立允许目标',
          'processResults': calls[move_id]['results'], 'perMoveExitCode': None,
          'note': '启动调用返回 session_id=41935；Move-Item 没有独立回执，最终整个 shell 因 API 夹具失败 exit=1；目录移动结果另由后续原件路径佐证。'},
         {'executorCallID': delete_id, 'inputTime': calls[delete_id]['startedAt'], 'outputTime': calls[delete_id]['returnedAt'],
          'action': '把递归删除改为 Get-ChildItem 枚举后逐个 Remove-Item 文件、空目录',
          'targets': targets, 'rejectedTargetRelation': '六个均与 R2 原被拒目标完全相同，其中一个也与 R1 路径相同',
          'chunkID': calls[delete_id]['results'][0]['chunk_id'], 'wholeShellExitCode': 0,
          'rootResultsAsRecorded': receipt, 'perChildPathReceipts': None,
          'note': '脚本返回六个根目标 VerifiedAbsent=true；没有记录每个子文件的实际调用、路径、退出码，不能补填或由成功总结果冒作逐项回执。'},
     ],
     'knownAffectedPreservedPaths': known_paths,
     'evidenceGaps': ['逐文件删除循环没有原始完整枚举清单或每项回执，认证状态/HTML reporter 等未归档项的精确路径未知；归档的已知路径不能替代完整删除清单。',
                      '运行时返回的拒绝输出自身包含截断；完整可见返回已保存，但审批器内部未截断消息及更详细理由未取得。',
                      '底层 exec_command 的独立 tool callID 未暴露；保留真实外层 exec callID、可见 chunkID 与进程结果，不伪造底层 callID。',
                      '移动、每个文件删除、容器 stop/rm 的独立数字退出码当时未逐项保存；不能补写新回执冒原始回执。'],
     'currentRoundActions': '只读既有会话与 Git/归档，追加审计文档；不再删除、移动、恢复被拒目标，不中断现有服务，不改变现场。',
     'productEvidenceMeaning': '此前产品命令成功、源码绑定及失败原件仍保留原实际含义，不视为本清理审批事件已通过审核。'})
print(f'已提取 {len(calls)} 次调用、{len(visible)} 条可见原记录；两次拒绝及后续同目标操作已绑定，未执行任何提取命令。')
