"""保全本任务 py_compile 的两个派生缓存，再逐个删除；不接收动态目录。"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
cache = BASE / '__pycache__'
allowed = {'run-checks.cpython-313.pyc', 'preserve-and-clean.cpython-313.pyc'}
if not cache.exists():
    raise SystemExit('本任务缓存不存在；不冒作删除回执')
if cache.is_symlink() or cache.is_junction() or not cache.resolve().is_relative_to(ROOT):
    raise RuntimeError('缓存路径越界或为链接，停止')
paths = sorted(cache.iterdir())
if {path.name for path in paths} != allowed or any(not path.is_file() or path.is_symlink() for path in paths):
    raise RuntimeError('缓存包含未登记项目，停止')
items = [{'path': str(path), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'preservation': 'generated-cache.zip 原字节；派生缓存未用于当前脚本直接执行'} for path in paths]
with zipfile.ZipFile(BASE / 'generated-cache.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in paths:
        archive.writestr(path.name, path.read_bytes())
with zipfile.ZipFile(BASE / 'generated-cache.zip') as archive:
    if archive.testzip() is not None or any(archive.read(path.name) != path.read_bytes() for path in paths):
        raise RuntimeError('缓存保全 CRC 或字节不匹配，停止删除')
receipt = {'archive': 'generated-cache.zip', 'crc': '通过', 'files': items, 'operations': []}
for path in [*paths, cache]:
    absolute = str(path).replace("'", "''")
    script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; $target='" + absolute + "'; if((Resolve-Path -LiteralPath $target).ProviderPath -ne $target){throw 'path changed'}; if((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'link detected'}; if(@(Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($target)}).Count){throw 'active reference'}; Remove-Item -LiteralPath $target; if(Test-Path -LiteralPath $target){throw 'target retained'}; 'removed exact preserved cache path'"
    start = datetime.now(timezone.utc).isoformat()
    result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], capture_output=True)
    receipt['operations'].append({'path': str(path), 'startedAt': start, 'finishedAt': datetime.now(timezone.utc).isoformat(), 'exitCode': result.returncode, 'stdout': result.stdout.decode('utf-8', errors='replace').strip(), 'stderr': result.stderr.decode('utf-8', errors='replace').strip()})
    (BASE / 'generated-cache-cleanup.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if result.returncode:
        raise RuntimeError('精确缓存路径删除失败，停止；不换工具或重试该目标')
