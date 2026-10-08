"""只读核验工具调用原件、目标关联和归档字节；不核准清理行为。"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--session', type=Path, help='原会话仍可读时额外核验源前缀和每条原记录')
args = parser.parse_args()
directory = Path(__file__).resolve().parent
index = json.loads((directory / 'calls-index.json').read_text(encoding='utf8'))
incident = json.loads((directory / 'incident.json').read_text(encoding='utf8'))
timeline = json.loads((directory / 'operation-timeline.json').read_text(encoding='utf8'))
digest = lambda value: hashlib.sha256(value).hexdigest()
raw_archive = (directory / index['archive']).read_bytes()
assert len(raw_archive) == index['archiveBytes'] and digest(raw_archive) == index['archiveSha256']
calls = {call['callID']: call for call in index['calls']}
with zipfile.ZipFile(directory / index['archive']) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {entry['member'] for entry in index['members']}
    for member in index['members']:
        raw = archive.read(member['member'])
        assert len(raw) == member['bytes'] and digest(raw) == member['sha256']
        assert archive.getinfo(member['member']).CRC == member['crc32']
    rows = [json.loads(line) for line in archive.read('visible-tool-records.jsonl').splitlines()]
    assert len(rows) == index['records'] == 100 and len(calls) == 50
    for call in calls.values():
        matching = [row for row in rows if row['payload']['call_id'] == call['callID']]
        assert len(matching) == 2
        first, last = [row['payload'] for row in matching]
        assert archive.read(call['inputMember']).decode() == first.get('input', first.get('arguments'))
        assert json.loads(archive.read(call['outputMember'])) == last['output']
    for refusal in incident['refusals']:
        call = calls[refusal['executorCallID']]
        assert refusal['inputTime'] == call['startedAt'] and refusal['outputTime'] == call['returnedAt']
        assert 'blocked by policy' in archive.read(call['outputMember']).decode()
        assert refusal['rejectedProcessExitCode'] is None and not refusal['rejectedProcessStarted']
    for item in incident['refusals'] + incident['actualSubsequentOperations']:
        call = calls[item['executorCallID']]
        for member in [call['inputMember'], call['outputMember'], *[c['member'] for c in call['decodedCommands']]]:
            copy = directory / 'calls' / member
            raw = copy.read_bytes()
            assert raw == archive.read(member)
            expected = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            # hash-object 不加 -w：只读验证 Git 入库转换，不改对象库或 index。
            actual = subprocess.check_output(['git', 'hash-object', '--path=' + str(copy), str(copy)], cwd=directory).decode().strip()
            assert actual == expected, 'Git 入库转换改变了原件字节'
    refused = incident['refusals'][1]['targets']
    deleted = incident['actualSubsequentOperations'][1]
    assert refused == deleted['targets'] == [row['Path'] for row in deleted['rootResultsAsRecorded']]
    assert deleted['wholeShellExitCode'] == calls[deleted['executorCallID']]['processResults'][0]['exit_code'] == 0
    assert incident['refusals'][0]['targets'][0] == incident['actualSubsequentOperations'][0]['sourcePath']
    refused_command = archive.read(calls[incident['refusals'][1]['executorCallID']]['decodedCommands'][0]['member']).decode()
    deleted_command = archive.read(calls[deleted['executorCallID']]['decodedCommands'][0]['member']).decode()
    for target in refused:
        assert target in refused_command
        # 后续输入是相对路径，根目录来自 Get-Location；原命令及目标由原回执共同绑定。
        relative = target.split('01a11890-f4de-7106-b64d-e1b2c0d4608e\\', 1)[1]
        assert relative in deleted_command
    if args.session:
        source = args.session.read_bytes()
        prefix = source[:index['source']['prefixBytes']]
        assert digest(prefix) == index['source']['prefixSha256']
        for call in calls.values():
            for record in call['records']:
                original = source[record['sourceByteOffset']:record['sourceByteOffset'] + record['originalRecordBytes']]
                assert digest(original) == record['originalRecordSha256']
                row = json.loads(original)
                row['payload'].pop('internal_chat_message_metadata_passthrough', None)
                assert {'timestamp': row['timestamp'], 'type': row['type'], 'payload': row['payload']} in rows
assert len(timeline['independentContainerTargets']) == 12
assert [call['callID'] for call in timeline['allCallsAfterFirstRefusalInclusive']] == list(calls)
for entry in timeline['allCallsAfterFirstRefusalInclusive']:
    assert entry == {key: calls[entry['callID']][key] for key in entry}
original_cleanup = json.loads((directory.parent / 'cleanup-summary.json').read_text(encoding='utf-8-sig'))
for container, original in zip(timeline['independentContainerTargets'], original_cleanup['containers']):
    assert all(container[key] == value for key, value in original.items())
    assert container['launchCallID'] == timeline['sessions'][str(container['executorSessionID'])]['launchCallID']
    assert container['individualStopExitCode'] is None and container['individualRemoveExitCode'] is None
assert {int(key): value['wholeShellExitCode'] for key, value in timeline['sessions'].items()} == {41935: 1, 68283: 1, 84120: 0, 71425: 0}
assert timeline['sessions']['41935']['launchCallID'] == 'call_daf2599d8ae943d5bd10995153cf3e33'
assert timeline['sessions']['71425']['launchCallID'] == 'call_4c7de44ab90147c0a051cef93ca04874'
print(f'证据字节核验通过：{len(index["members"])} 个 ZIP 成员、100 条可见记录、50 次调用、两次拒绝与同目标后续操作；原会话核验={bool(args.session)}。')
print('此结果不代表审批行为合规；逐子路径和独立回执缺口仍待定向独审。')
