"""从已保全调用生成可读副本及执行关联；不执行任何原命令。"""
import json
from pathlib import Path
import re
import zipfile

directory = Path(__file__).resolve().parent
index = json.loads((directory / 'calls-index.json').read_text(encoding='utf8'))
incident = json.loads((directory / 'incident.json').read_text(encoding='utf8'))
focused = {item['executorCallID'] for item in incident['refusals'] + incident['actualSubsequentOperations']}
timeline = []
sessions = {}
with zipfile.ZipFile(directory / 'calls.zip') as archive:
    for call in index['calls']:
        source = archive.read(call['inputMember']).decode()
        if call['callID'] in focused:
            for member in [call['inputMember'], call['outputMember'], *[c['member'] for c in call['decodedCommands']]]:
                target = directory / 'calls' / member
                target.parent.mkdir(parents=True, exist_ok=True)
                data = archive.read(member)
                if target.exists():
                    assert target.read_bytes() == data, '禁止覆盖不同字节的已保全调用副本'
                else:
                    target.write_bytes(data)
        starts_runner = any(re.search(r'^python -X utf8 docs/reviews/c3/main-combination/run-checks\.py(?:\s|$)',
                                      archive.read(command['member']).decode(), re.MULTILINE)
                            for command in call['decodedCommands'])
        launch = [result for result in call['processResults'] if 'session_id' in result and starts_runner]
        for result in launch:
            assert result['session_id'] not in sessions
            sessions[result['session_id']] = {'launchCallID': call['callID'], 'launchedAt': call['startedAt'],
                                            'initialChunkID': result['chunk_id'], 'wholeShellExitCode': None}
        waits = re.findall(r'write_stdin\(\{session_id:(\d+)', source)
        terminal = [result for result in call['processResults'] if 'exit_code' in result]
        # 这四个最终等待调用各有一次 write_stdin，终止结果是 exec 最后一个结果。
        if waits and terminal and 'exit_code' in call['processResults'][-1]:
            assert len(waits) == 1
            session = sessions[int(waits[0])]
            session.update({'finalWaitCallID': call['callID'], 'returnedAt': call['returnedAt'],
                            'finalChunkID': terminal[-1]['chunk_id'], 'wholeShellExitCode': terminal[-1]['exit_code']})
        timeline.append({key: call[key] for key in ['callID', 'startedAt', 'returnedAt', 'inputMember', 'outputMember',
                                                 'decodedCommands', 'processResults']})

assert {key: value['wholeShellExitCode'] for key, value in sessions.items()} == {41935: 1, 68283: 1, 84120: 0, 71425: 0}
assert sessions[41935]['launchCallID'] == 'call_daf2599d8ae943d5bd10995153cf3e33'
assert sessions[71425]['launchCallID'] == 'call_4c7de44ab90147c0a051cef93ca04874'
cleanup = json.loads((directory.parent / 'cleanup-summary.json').read_text(encoding='utf-8-sig'))
run_sessions = {'first': 41935, 'retry': 68283, 'accepted': 84120, 'browser': 71425}
containers = []
for container in cleanup['containers']:
    assert container['cleanup']['at'] < incident['refusals'][1]['inputTime']
    containers.append(container | {'executorSessionID': run_sessions[container['run']],
                                   'launchCallID': sessions[run_sessions[container['run']]]['launchCallID'],
                                   'targetRelation': '独立 Docker 容器 ID，不是被拒 Windows 路径；清理发生在 R2 之前',
                                   'individualStopExitCode': None, 'individualRemoveExitCode': None,
                                   'receiptLimitation': '原脚本 check=True 并核对不存在；未逐项保存数字退出码和底层工具 callID'})
value = {'status': '操作证据关联，不是审批通过结论', 'allCallsAfterFirstRefusalInclusive': timeline,
         'sessions': sessions, 'independentContainerTargets': containers,
         'executorScript': '../run-checks.py',
         'originalExecutorCopies': '原 checks-raw.zip 中 run-checks-runtime.py、retry/run-checks-runtime.py、browser/run-checks-runtime.py；accepted 输入绑定保存其脚本摘要，未单独归档该轮副本',
         'childFilesystemPaths': '被拒目标下已保全文件精确路径见 incident.json；完整删除枚举和逐项回执未知，不补写',
         'environment': '所有原命令及环境输入保存在 calls.zip；服务秘密仅由脚本生成并注入子进程，原件中未导出秘密值',
         'currentRound': '只写受控审计文件；不执行提取命令、不删除移动恢复资源、不停止服务'}
(directory / 'operation-timeline.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'已关联 {len(timeline)} 次调用、{len(sessions)} 个检查进程会话、{len(containers)} 个独立容器目标；未运行原命令。')
