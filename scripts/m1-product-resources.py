"""只读核对已登记资源的最终状态，不补造历史清理或退出回执。"""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
evidence = root / 'docs/plan/agent-mcp-m1/product-evidence'
observed = datetime.datetime.now(datetime.timezone.utc).isoformat()
command = ['docker', 'ps', '-a', '--no-trunc', '--format', '{{json .}}']
result = subprocess.run(command, capture_output=True, text=True, encoding='utf8')
if result.returncode:
    raise SystemExit(result.stderr)
containers = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
present = {row['ID']: row for row in containers}
rows = []
for path in sorted(evidence.glob('m1-*-resources.json')):
    registry = json.loads(path.read_text(encoding='utf8'))
    extra = evidence / (registry['runId'] + '-interrupted-cleanup.json')
    cleanup = json.loads(extra.read_text(encoding='utf8')) if extra.exists() else None
    for entry in registry['resources']:
        rows.append(dict(runId=registry['runId'], id=entry['id'], name=entry['name'],
            registry=path.name, originallyRecordedCleaned=entry['cleaned'],
            interruptedCleanup=extra.name if cleanup else None,
            currentlyPresent=entry['id'] in present,
            logExists=(evidence / (entry['name'] + '.log')).exists(),
            interruptedLogExists=(evidence / (entry['name'].replace('-'+entry['role'], '-interrupted-'+entry['role']) + '.log')).exists()))
receipts = []
for path in evidence.glob('*.json'):
    value = json.loads(path.read_text(encoding='utf8'))
    if isinstance(value, dict) and 'command' in value:
        receipts.append(dict(name=path.stem, processId=value.get('processId'),
            recorderPid=value.get('recorderPid'), exitCode=value.get('exitCode')))
ids = sorted({ident for row in receipts for ident in [row['processId'], row['recorderPid']] if ident})
# Read command lines only to disambiguate PID reuse; never persist those lines.
script = '$idsToCheck=@(' + ','.join(map(str, ids)) + '); Get-CimInstance Win32_Process | Where-Object { $idsToCheck -contains $_.ProcessId } | ForEach-Object { [PSCustomObject]@{ pid=$_.ProcessId; name=$_.Name; sameWorkspace=($_.CommandLine -like "*01a12031-e9de-75c4-ab40-b44affcd71f6*") } } | ConvertTo-Json -Compress'
processes = subprocess.run(['powershell', '-NoProfile', '-Command', script], capture_output=True, text=True, encoding='utf8')
if processes.returncode:
    raise SystemExit(processes.stderr)
alive = json.loads(processes.stdout) if processes.stdout.strip() else []
if isinstance(alive, dict):
    alive = [alive]
archives = []
for path in sorted(evidence.glob('*.zip')):
    if not zipfile.is_zipfile(path):
        archives.append(dict(path=path.name, bytes=path.stat().st_size,
            sha256=hashlib.sha256(path.read_bytes()).hexdigest(), members=None, crcVerified=False,
            limitation='历史中断留下未闭合 ZIP；原字节保留，不能计作完整输入原件或通过绑定'))
        continue
    with zipfile.ZipFile(path) as saved:
        corrupt = saved.testzip()
        if corrupt:
            raise SystemExit('Corrupt archived member: ' + path.name + '/' + corrupt)
        archives.append(dict(path=path.name, bytes=path.stat().st_size,
            sha256=hashlib.sha256(path.read_bytes()).hexdigest(), members=len(saved.infolist()), crcVerified=True))
audit = dict(observedAt=observed, dockerObservation=dict(args=command, exitCode=result.returncode),
    registeredResources=rows, remainingOwnedContainers=[row for row in containers if 'workmesh.m1.owner=' in row.get('Labels', '')],
    sharedContainersPreserved=[dict(id=row['ID'], name=row['Names'], state=row['State'])
        for row in containers if row['Names'].startswith('workmesh-') and 'workmesh.m1.owner=' not in row.get('Labels', '')],
    recordedProcesses=receipts, currentlyMatchingPids=alive, archives=archives,
    cleanupBoundary='本脚本仅观察；原正常清理见 registry，原中断清理见逐命令回执。不存在不代替历史批准或退出码。',
    retainedPaths=['node_modules/.m1-runtime', 'ci-logs/mcp-coverage', 'ci-logs/execution-recovery', str(root)],
    retainedReason='Node 测试运行时与当前恢复工作树保留供复核；临时日志和客户端事实已独立归档。未删除共享 store、已拒 G1D0C3 目标或其他服务。')
(evidence / 'resource-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
lines = ['# M1 资源准备、恢复与收尾', '',
    '服务准备与 ready、随机端口、镜像、tmpfs、专用数据库/桶在每轮 registry；完整日志和客户端事实在对应 ZIP。正常 finally 的 Docker stop/rm 经检查返回才记录 cleaned=true，但未保存逐条 stdout；中断收尾保存逐命令退出和 stdout。缺少的历史运行退出码不补造。', '',
    '| 本轮资源 | 原记录 / 中断收尾 | 最终是否存在 |', '| --- | --- | --- |']
for row in rows:
    extra = f' / [{row["interruptedCleanup"]}]({row["interruptedCleanup"]})' if row['interruptedCleanup'] else ''
    lines.append(f'| {row["name"]} | [{row["registry"]}]({row["registry"]}){extra} | {row["currentlyPresent"]} |')
lines.extend(['', '实际 ID、现存进程的 PID 重用核验、共享服务保留列表与逐 ZIP SHA-256/CRC 见 [JSON](resource-audit.json)。没有全局 prune、镜像/store/网络/卷清理；使用预存共享镜像、默认 bridge 和临时 tmpfs。', '',
    '当前工作树、恢复目录及专用 Node 运行时保留；ignored 的 Runner 原日志已保存于 runner-legacy-logs.zip。scratch created/removed 的准确路径来自真实 Pi 客户端 JSON，正常路径已由断言确认不存在；未证明 idle 的故障路径应保留残留，不推测清理成功。Recovery 测试自身 finally 清理其随机 bundle 临时目录，未逐目录另外记录 Windows 链接/活动引用的独立回执，该证据缺口不补造。', ''])
(evidence / 'resource-audit.md').write_text('\n'.join(lines), encoding='utf8')
print(json.dumps(dict(resources=len(rows), remainingOwned=len(audit['remainingOwnedContainers']), sameWorkspacePids=[row for row in alive if row['sameWorkspace']], archives=len(archives))))
if any(row['currentlyPresent'] for row in rows) or audit['remainingOwnedContainers'] or any(row['sameWorkspace'] for row in alive):
    raise SystemExit('Recorded owned resources/processes still active; inspect before reporting final cleanup')
