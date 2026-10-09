"""只生成本轮独审修复证据；旧候选、原回执和归档保持历史。"""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
evidence = root / 'docs/plan/agent-mcp-m1/product-evidence'
base = '6e90926e768290c85863c35c400aa6866e4d1f12'
digest = lambda value: hashlib.sha256(value).hexdigest()
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL)
def save(name, value):
    (evidence / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')

historical = set(git('ls-tree', '-r', '--name-only', base).decode().splitlines())
new_logs = [path for path in evidence.glob('*.log') if path.relative_to(root).as_posix() not in historical]
previous_raw = {}
raw_path = evidence / 'review-repair-raw-logs.zip'
if raw_path.exists():
    with zipfile.ZipFile(raw_path) as saved:
        previous_raw = {row['path']: saved.read(row['member']) for row in json.loads(saved.read('index.json'))}
raw = []
members = set()
with zipfile.ZipFile(evidence / 'review-repair-raw-logs.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(new_logs):
        data = previous_raw.get(path.name, path.read_bytes())
        normalized = ('\n'.join(line.rstrip() for line in data.decode('utf8').splitlines()).rstrip() + '\n').encode()
        assert path.read_bytes() in (data, normalized), '已闭日志被改写: ' + path.name
        member = 'bytes/' + digest(data)
        if member not in members:
            archive.writestr(member, data)
            members.add(member)
        raw.append(dict(path=path.name, member=member, bytes=len(data), sha256=digest(data)))
        path.write_text('\n'.join(line.rstrip() for line in data.decode('utf8').splitlines()).rstrip() + '\n', encoding='utf8', newline='\n')
    archive.writestr('index.json', json.dumps(raw, ensure_ascii=False, indent=2))
save('review-repair-raw-log-index.json', dict(archive='review-repair-raw-logs.zip', entries=raw))

checks = []
for path in sorted(evidence.glob('review-repair-*.json')):
    receipt = json.loads(path.read_text(encoding='utf8'))
    if 'command' not in receipt:
        continue
    assert receipt.get('status') == 'finished' and receipt.get('exitCode') is not None, path.name
    with zipfile.ZipFile(evidence / receipt['inputArchive']) as archive:
        assert archive.testzip() is None
        inputs = json.loads(archive.read('inputs.json'))
        differences = []
        during = []
        for row in inputs:
            assert digest(archive.read('worktree/' + row['path'])) == row['worktreeSha256']
            if row['gitSha256']:
                assert digest(archive.read('git/' + row['path'])) == row['gitSha256']
            current = root / row['path']
            if current.exists() and digest(current.read_bytes()) != row['worktreeSha256']:
                differences.append(row['path'])
            if receipt['postFingerprints'].get(row['path']) != row['worktreeSha256']:
                during.append(row['path'])
    assert digest((evidence / receipt['inputArchive']).read_bytes()) == receipt['inputArchiveSha256']
    log = (evidence / (path.stem + '.log')).read_text(encoding='utf8')
    summaries = [line.strip() for line in log.splitlines() if re.search(r'Test Files\s+|Tests\s+\d|Tasks:\s+', line)]
    checks.append(dict(name=path.stem, command=receipt['command'], exitCode=receipt['exitCode'],
        runtimeSeconds=receipt['runtimeSeconds'], inputArchive=receipt['inputArchive'],
        inputArchiveSha256=receipt['inputArchiveSha256'], node=receipt['node'], summaries=summaries,
        changedDuringRun=during, changedSinceRun=differences, log=path.stem + '.log'))
save('review-repair-check-index.json', checks)
lines = ['# 本轮独审修复实际检查', '', '退出与运行时只取原回执；定向筛选的 skip 不计完整套件通过。前后变化逐路径列在 JSON，生成器的派生清单写入与真实产品代码变化分别解释。', '', '| 命令回执 | 退出 / 秒 | 原数量 |', '| --- | --- | --- |']
for row in checks:
    lines.append(f'| [{row["name"]}]({row["name"]}.json) | {row["exitCode"]} / {row["runtimeSeconds"]:.3f} | {"<br>".join(row["summaries"])} |')
(evidence / 'review-repair-check-index.md').write_text('\n'.join(lines) + '\n', encoding='utf8')

sources = []
original_sources = {row['path'] for row in json.loads((evidence / 'product-source-index.json').read_text(encoding='utf8'))}
paths = git('diff', '--name-only', 'e49eda142d61bdd248ddc42ec16f5563abd4bbc6', '--').decode().splitlines()
paths += git('ls-files', '--others', '--exclude-standard').decode().splitlines()
with zipfile.ZipFile(evidence / 'review-repair-source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative in sorted(set(paths)):
        path = root / relative
        if not path.is_file() or not (relative in original_sources or relative.startswith(('apps/', 'packages/', 'scripts/'))):
            continue
        data = path.read_bytes()
        previous = subprocess.run(['git', 'show', base + ':' + relative], cwd=root, capture_output=True)
        archive.writestr('worktree/' + relative, data)
        if previous.returncode == 0:
            archive.writestr('git/' + relative, previous.stdout)
        sources.append(dict(path=relative, worktreeBytes=len(data), worktreeSha256=digest(data),
            gitSourceHead=base, gitBytes=len(previous.stdout) if previous.returncode == 0 else None,
            gitSha256=digest(previous.stdout) if previous.returncode == 0 else None))
    archive.writestr('source-index.json', json.dumps(sources, ensure_ascii=False, indent=2))
save('review-repair-source-index.json', sources)

docker_args = ['docker', 'ps', '-a', '--no-trunc', '--format', '{{json .}}']
observation = subprocess.run(docker_args, capture_output=True, text=True, encoding='utf8')
assert observation.returncode == 0
containers = [json.loads(line) for line in observation.stdout.splitlines() if line]
owned = [row for row in containers if 'workmesh.m1.owner=' in row.get('Labels', '')]
registries = []
for path in evidence.glob('m1-*-resources.json'):
    if path.relative_to(root).as_posix() in historical:
        continue
    value = json.loads(path.read_text(encoding='utf8'))
    assert all(row['cleaned'] for row in value['resources']), path.name
    registries.append(dict(path=path.name, runId=value['runId'], resources=value['resources']))
assert not owned, '仍有本人运行容器，不能完成收尾'
process_ids = [json.loads((evidence / (row['name'] + '.json')).read_text(encoding='utf8'))['processId'] for row in checks]
probe = '$repairPids=@(' + ','.join(map(str, process_ids)) + '); Get-CimInstance Win32_Process | Where-Object { $repairPids -contains $_.ProcessId } | ForEach-Object { [PSCustomObject]@{ pid=$_.ProcessId; sameWorkspace=($_.CommandLine -like "*01a12031-e9de-75c4-ab40-b44affcd71f6*") } } | ConvertTo-Json -Compress'
process_observation = subprocess.run(['powershell', '-NoProfile', '-Command', probe], capture_output=True, text=True, encoding='utf8')
assert process_observation.returncode == 0
processes = json.loads(process_observation.stdout) if process_observation.stdout.strip() else []
if isinstance(processes, dict):
    processes = [processes]
assert not any(row['sameWorkspace'] for row in processes), '本轮受测进程仍活动'
save('review-repair-resources.json', dict(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    dockerObservation=dict(args=docker_args, exitCode=observation.returncode), registries=registries,
    remainingOwnedContainers=owned, sharedContainersPreserved=[dict(id=row['ID'], name=row['Names'], state=row['State']) for row in containers],
    recordedProcessIds=process_ids, currentMatchingProcesses=processes, processObservationExitCode=process_observation.returncode,
    boundary='日志及客户端 ZIP 已在 finally 保全；正常 stop/rm 成功退出经 helper 校验，原 helper 未分别记录 stdout，保留此限制。共享容器/镜像/默认网络、已拒目标、当前恢复工作树和 Node 运行时保留；没有额外删除。'))
archives = []
for path in sorted(evidence.glob('*.zip')):
    if path.relative_to(root).as_posix() in historical:
        continue
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, path.name
    archives.append(dict(path=path.name, bytes=path.stat().st_size, sha256=digest(path.read_bytes()), crcVerified=True))
save('review-repair-archive-index.json', archives)
print(json.dumps(dict(checks=len(checks), sourceFiles=len(sources), newArchives=len(archives), newOwnedResources=sum(len(row['resources']) for row in registries), remainingOwned=len(owned))))
