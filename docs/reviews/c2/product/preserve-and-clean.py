"""保全本轮可公开证据，再逐路径核验并清理独有临时目录；历史回执不覆写。"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/product'
RECEIPT = BASE / 'temporary-cleanup.json'

def stamp():
    return datetime.now(timezone.utc).isoformat()

def fingerprint(body):
    return {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}

def persist(records):
    RECEIPT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def shell(script):
    started = stamp()
    process = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], cwd=ROOT, capture_output=True)
    return {'startedAt': started, 'finishedAt': stamp(), 'exitCode': process.returncode,
            'stdout': process.stdout.decode('utf-8', errors='replace').strip(), 'stderr': process.stderr.decode('utf-8', errors='replace').strip()}

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

records = json.loads(RECEIPT.read_text(encoding='utf-8')) if RECEIPT.exists() else []
known = {record['run'] for record in records if record.get('removed')}
for result_path in sorted(BASE.glob('*/results.json')):
    report = json.loads(result_path.read_text(encoding='utf-8'))
    run = report['run']
    if run in known:
        continue
    temporary = Path(report['temporaryPath'])
    record = {'run': run, 'path': str(temporary), 'startedAt': stamp(), 'removed': False,
              'worktreeRetained': str(ROOT), 'historicalResultsUnchanged': True}
    records.append(record)
    persist(records)
    if not report.get('finishedAt'):
        record['retainedReason'] = '验证仍活动，未执行保全或删除'
        persist(records)
        continue
    expected = ROOT / '.tmp' / ('c2-product-' + run)
    if temporary != expected or temporary.is_symlink() or temporary.resolve() != expected.resolve() or not temporary.resolve().is_relative_to(ROOT / '.tmp'):
        raise RuntimeError('临时目录绝对路径或链接边界不符合本任务登记')
    if not temporary.exists():
        record['retainedReason'] = '读取时路径已不存在；不冒作本次删除成功'
        persist(records)
        continue
    files = sorted(temporary.rglob('*'))
    if any(path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()) or not path.resolve().is_relative_to(temporary.resolve()) for path in [temporary, *files]):
        raise RuntimeError('临时树含链接、junction 或越界目标，停止该目标')
    archive_path = result_path.parent / 'ui-evidence.zip'
    archive_members = []
    excluded = []
    with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            if not path.is_file():
                continue
            relative = path.relative_to(temporary).as_posix()
            body = path.read_bytes()
            item = {'path': relative, **fingerprint(body)}
            allowed = path.suffix in ['.png', '.webm'] or path.name == 'error-context.md' or path.name == 'prepare-s3.mjs' or relative.startswith('visual-specs/') or path.name.startswith('current-ui-') or path.name == 'playwright.baseline.config.ts'
            if allowed:
                archive.writestr(relative, body)
                archive_members.append(item)
            else:
                item['reason'] = '测试会话/CSRF/请求 trace 可能含凭据，不提交原件；失败以已脱敏日志、截图及 error-context 保全' if ('trace' in relative or '.auth/' in relative) else '生成运行产物可重建或已由日志/runtime 指纹保全，不提交二进制运行时和构建缓存'
                excluded.append(item)
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('UI 证据 ZIP CRC 错误，保留原目录')
        for item in archive_members:
            if fingerprint(archive.read(item['path'])) != {key: item[key] for key in ['bytes', 'sha256']}:
                raise RuntimeError('UI 证据原字节恢复不一致，保留原目录')
    record['archive'] = {'path': archive_path.relative_to(ROOT).as_posix(), **fingerprint(archive_path.read_bytes()), 'crc': '通过', 'members': archive_members}
    record['excluded'] = excluded
    # 本轮随机目录中的 node.exe 为精确归属证据；不停止系统 Node 或其它任务进程。
    executable = str(temporary / 'node.exe')
    observe = shell("[Console]::OutputEncoding=[Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -ne $PID -and ($_.ExecutablePath -eq " + quote(executable) + " -or ($_.CommandLine -and $_.CommandLine.Contains(" + quote(temporary) + ")))} | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{Name='CreationDate';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}}) | ConvertTo-Json -Depth 4 -Compress")
    record['processObservation'] = observe
    if observe['exitCode']:
        record['retainedReason'] = '活动引用读取失败，停止删除'
        persist(records)
        continue
    active = json.loads(observe['stdout'] or '[]')
    if isinstance(active, dict):
        active = [active]
    if any(process['ExecutablePath'] != executable for process in active):
        record['retainedReason'] = '目录存在非独有运行时的活动引用，保留该路径，不推断进程归属'
        record['activeReferences'] = active
        persist(records)
        continue
    record['processStops'] = []
    for process in active:
        process_id = int(process['ProcessId'])
        creation = str(process['CreationDate'])
        result = shell("[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; $owned=Get-CimInstance Win32_Process -Filter " + quote('ProcessId=' + str(process_id)) + "; if($null -eq $owned){'already exited';exit 0}; if($owned.ExecutablePath -ne " + quote(executable) + " -or $owned.CreationDate.ToUniversalTime().ToString('o') -ne " + quote(creation) + "){throw 'process identity changed'}; Stop-Process -Id " + str(process_id) + "; 'stopped exact task executable'")
        record['processStops'].append({'observed': process, 'result': result})
        persist(records)
        if result['exitCode']:
            raise RuntimeError('精确任务进程停止失败，停止该目标，不换工具绕过')
    # 同一 PowerShell 内复核绝对路径、所有链接和活动引用，然后仅删除该路径。
    script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; $target=" + quote(temporary) + "; $workspace=" + quote(ROOT) + "; $resolved=(Resolve-Path -LiteralPath $target).ProviderPath; if($resolved -ne $target -or -not $resolved.StartsWith($workspace+'\\.tmp\\c2-product-')){throw 'path boundary changed'}; $links=@(Get-Item -LiteralPath $target; Get-ChildItem -LiteralPath $target -Recurse -Force) | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}; if($links){throw 'reparse point detected'}; if(@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq " + quote(executable) + "}).Count){throw 'task executable still active'}; Remove-Item -LiteralPath $target -Recurse; if(Test-Path -LiteralPath $target){throw 'target still exists'}; 'removed exact task directory after archive and activity verification'"
    record['remove'] = shell(script)
    record['removed'] = record['remove']['exitCode'] == 0
    record['finishedAt'] = stamp()
    persist(records)
    if not record['removed']:
        raise RuntimeError('临时路径清理失败，停止该目标，不重试或换方式')
    print(run, '保全与精确路径清理完成')
