"""只读采样新机恢复事实；不读取凭据、不修改配置、不删除资源。"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

ROOT = Path.cwd()
OUT = ROOT / 'docs/reviews/b1-b2/blueberry-recovery'


def run(*command):
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return dict(command=list(command), exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    common = Path(run('git', 'rev-parse', '--git-common-dir')['stdout'].strip())
    lock = common / 'index.lock'
    info = lock.stat() if lock.exists() else None
    daemon = Path(os.environ['USERPROFILE']) / '.tds/daemon.log'
    lines = daemon.read_text(encoding='utf-8').splitlines()
    # 只保留 workspace 准备与当前任务调度日志，不复制其他会话或认证日志。
    selected = [line for line in lines if '[workspace]' in line or
                ('[machine] step ' in line and '01a12a8e-cadc-7c05-a07a-1d6a77c8f64c' in line)]
    (OUT / 'workspace-daemon.log').write_text('\n'.join(selected) + '\n', encoding='utf-8')
    snapshot = dict(
        capturedAt=datetime.now(timezone.utc).isoformat(), workspace=str(ROOT),
        gitExecutable=shutil.which('git'), nodeExecutable=shutil.which('node'),
        gitVersion=run('git', '--version'), longpaths=run('git', 'config', '--show-origin', '--get', 'core.longpaths'),
        worktrees=run('git', 'worktree', 'list', '--porcelain'),
        currentBranch=run('git', 'branch', '--show-current'), head=run('git', 'rev-parse', 'HEAD'),
        mergeHead=run('git', 'rev-parse', 'MERGE_HEAD'), main=run('git', 'rev-parse', 'origin/main'),
        oldProduct=run('git', 'rev-parse', 'origin/tds/conv-01a11ac2-a0a9-7ef6-bd48-3bb37c21a301'),
        commonIndexLock=dict(path=str(lock), exists=info is not None,
                            bytes=info.st_size if info else None,
                            mtimeNs=info.st_mtime_ns if info else None),
        volumes={drive: dict(zip(('total', 'used', 'free'), shutil.disk_usage(drive + ':/'))) for drive in ['C', 'I', 'X']},
        currentIndexLockExists=Path(run('git', 'rev-parse', '--git-path', 'index.lock')['stdout'].strip()).exists(),
        remoteMain=run('gh', 'api', 'repos/xurunxin/WorkMesh/git/ref/heads/main', '--jq', '.object.sha'),
        remoteOldProduct=run('gh', 'api', 'repos/xurunxin/WorkMesh/git/ref/heads/tds/conv-01a11ac2-a0a9-7ef6-bd48-3bb37c21a301', '--jq', '.object.sha'),
        localNode=run('node', '--version'),
        elevated=run('powershell.exe', '-NoProfile', '-Command', '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'),
        limitation='平台 conversation 的历史错误正文被截断；本地 daemon 没有历史失败尾部。现有采样不冒完整准备错误日志。共享主仓库 index.lock 只登记，未删除。',
    )
    (OUT / 'environment.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    entries = subprocess.check_output(['git', 'ls-files', '--stage', '-z', 'apps', 'packages', 'scripts', '.github', 'skills', 'AGENT_PROTOCOL.md', 'CONTEXT.md', 'OPENAPI.yaml', 'SCHEMA.sql', 'pnpm-lock.yaml', 'package.json', 'turbo.json', 'vitest.config.ts'], text=True).split('\0')
    blobs = {entry.split('\t', 1)[1]: entry.split('\t', 1)[0].split()[1] for entry in entries if entry}
    files = []
    for name, blob in sorted(blobs.items()):
        path = ROOT / name
        if not path.is_file():
            continue
        data = path.read_bytes()
        files.append(dict(path=name, bytes=len(data), rawSha256=digest(data), indexBlob=blob))
    (OUT / 'source.json').write_text(json.dumps(dict(head=snapshot['head']['stdout'].strip(), mergeHead=snapshot['mergeHead']['stdout'].strip(), files=files), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('已保存环境、准备日志可得部分及运行前源码绑定；未修改共享环境。')


if __name__ == '__main__':
    main()
