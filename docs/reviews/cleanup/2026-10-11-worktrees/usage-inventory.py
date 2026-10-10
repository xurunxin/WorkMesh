"""WorkMesh 开工前/合入后只读占用盘点；不跟随链接、不执行任何删除。"""
import sys
sys.dont_write_bytecode = True
import argparse
import collections
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

ROOT = Path(r'C:\Users\xurx\.tds\workspaces')
OUT = Path(__file__).resolve().parent
CURRENT = OUT.parents[3]
REPOSITORY = 'https://github.com/xurunxin/WorkMesh.git'

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def git(path, *args):
    argv = ['git', '-C', str(path), *args]
    p = subprocess.run(argv, capture_output=True)
    return {'input': argv, 'exit': p.returncode, 'stdout': p.stdout.decode('utf-8', 'replace'), 'stderr': p.stderr.decode('utf-8', 'replace')}

def group(rel):
    parts = rel.split('/')
    if rel.startswith('docs/'):
        return '文档与已提交证据检出副本'
    if parts[0] == '.git':
        return 'Git 管理/对象（主仓库单列）'
    if 'node_modules' in parts:
        return '依赖与本地 virtual store（含特殊 runtime，需另核）'
    if '.next' in parts or 'dist' in parts or '.turbo' in parts or rel.endswith('.tsbuildinfo'):
        return '构建/缓存'
    if parts[0] == '.tmp' or parts[0] == 'ci-logs' or 'test-results' in parts or 'playwright-report' in parts:
        return '本机临时/验收材料（用途未判定）'
    return '源码与其他文件'

def scan(path):
    total, count, links = 0, 0, 0
    groups = collections.defaultdict(lambda: {'files': 0, 'logicalBytes': 0})
    errors = []
    stack = [path]
    while stack:
        directory = stack.pop()
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    rel = os.path.relpath(entry.path, path).replace('\\', '/')
                    try:
                        s = entry.stat(follow_symlinks=False)
                        if s.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                            links += 1
                        elif entry.is_dir(follow_symlinks=False):
                            stack.append(Path(entry.path))
                        else:
                            total += s.st_size
                            count += 1
                            row = groups[group(rel)]
                            row['files'] += 1
                            row['logicalBytes'] += s.st_size
                    except OSError as e:
                        errors.append({'path': rel, 'error': str(e)})
        except OSError as e:
            errors.append({'path': str(directory), 'error': str(e)})
    return {'ordinaryFiles': count, 'logicalBytes': total, 'linksNotFollowed': links, 'groups': dict(groups), 'errors': errors}

def main():
    parser = argparse.ArgumentParser(description='只读盘点本机 WorkMesh；不删除任何路径')
    parser.add_argument('--phase', choices=['before', 'after', 'opening'], default='opening')
    parser.add_argument('--output', type=Path, help='受控清理报告目录中的 JSON.gz；缺省只打印摘要')
    args = parser.parse_args()
    started = utc()
    rows, exclusions = [], []
    # 只列指定 workspace 根的直接子目录；归属通过 Git remote 实核。
    for path in ROOT.iterdir():
        if not path.name.startswith('01a') or not path.is_dir():
            continue
        if path.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            exclusions.append({'path': str(path), 'reason': '根子目录是 reparse point，未遍历'})
            continue
        remote = git(path, 'remote', 'get-url', 'origin')
        if remote['exit'] or remote['stdout'].strip() != REPOSITORY:
            exclusions.append({'path': str(path), 'reason': '未确认 WorkMesh 归属；未遍历'})
            continue
        rows.append({'path': str(path), 'startedAt': utc(), 'remote': remote, 'head': git(path, 'rev-parse', 'HEAD'), **scan(path), 'endedAt': utc()})
    # 主仓库只是只读大小对照，永不成为脚本的回收候选；其它平台缓存不遍历。
    main_repo = ROOT / 'DzkLDn6UW-IbfoTJzN9Ro' / 'repo'
    main_size = {'path': str(main_repo), 'protected': True, **scan(main_repo)} if main_repo.is_dir() and not main_repo.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT else {'path': str(main_repo), 'protected': True, 'exists': main_repo.exists(), 'reason': '不存在或根为链接，未遍历'}
    total = sum(r['logicalBytes'] for r in rows)
    data = {'startedAt': started, 'endedAt': utc(), 'phase': args.phase, 'workspaceRoot': str(ROOT), 'project': REPOSITORY,
            'worktreeLogicalBytes': total, 'worktreeDecimalGB': total / 10**9, 'worktreeGiB': total / 2**30, 'worktreeCount': len(rows),
            'rows': rows, 'mainRepositorySeparate': main_size, 'exclusions': exclusions, 'registration': git(CURRENT, 'worktree', 'list', '--porcelain'),
            'limitations': '逻辑长度不跟链接，hardlink 副本重复计数；不含其它项目、用户目录、共享 store、镜像/业务数据；活动目录扫描不是一致快照；不代表物理分配或可归因净释放。用途分类不能代安全预检。'}
    if args.output:
        dest = args.output.resolve()
        cleanup_root = OUT.parent.resolve()
        if cleanup_root not in dest.parents:
            raise ValueError('输出必须在此受控清理报告目录下')
        if dest.exists():
            raise ValueError('已有快照，禁止覆盖原件；读取原快照或选新的准确阶段名')
        dest.parent.mkdir(parents=True, exist_ok=True)
        raw = (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode()
        dest.write_bytes(gzip.compress(raw, mtime=0))
    groups = collections.Counter()
    for row in rows:
        for key, item in row['groups'].items():
            groups[key] += item['logicalBytes']
    top = sorted([{'path': r['path'], 'logicalBytes': r['logicalBytes']} for r in rows], key=lambda r: r['logicalBytes'], reverse=True)[:10]
    print(json.dumps({'phase': args.phase, 'count': len(rows), 'logicalBytes': total, 'GB': total / 10**9, 'GiB': total / 2**30, 'mainRepoSeparateBytes': main_size.get('logicalBytes'), 'groups': dict(groups), 'top10': top, 'errors': sum(len(r['errors']) for r in rows)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
