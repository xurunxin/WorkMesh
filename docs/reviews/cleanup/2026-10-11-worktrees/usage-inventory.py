"""WorkMesh 开工前/合入后只读占用盘点；不跟随链接、不执行任何删除。"""
import sys
sys.dont_write_bytecode = True
import argparse
import collections
import datetime
import gzip
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

def directory_gate(path):
    # absolute 不解析链接；从卷根逐级 lstat，不能先访问可能位于 junction 下的子路径。
    path = path.absolute()
    for ancestor in [*reversed(path.parents), path]:
        try:
            info = ancestor.lstat()
        except FileNotFoundError:
            return {'blockedAt': str(ancestor), 'reason': '路径不存在，未遍历', 'errors': []}
        except OSError as error:
            return {'blockedAt': str(ancestor), 'reason': '祖先元数据读取失败，未遍历',
                    'errors': [{'path': str(ancestor), 'error': str(error)}]}
        if info.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            return {'blockedAt': str(ancestor), 'reason': '祖先或目录本体是 reparse point，未遍历', 'errors': []}
        if not stat.S_ISDIR(info.st_mode):
            return {'blockedAt': str(ancestor), 'reason': '路径不是目录，未遍历', 'errors': []}
    return None

def scan(path):
    blocked = directory_gate(path)
    if blocked:
        return {'ordinaryFiles': 0, 'logicalBytes': 0, 'linksNotFollowed': 0,
                'groups': {}, 'complete': False, **blocked}
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
    return {'ordinaryFiles': count, 'logicalBytes': total, 'linksNotFollowed': links, 'groups': dict(groups), 'errors': errors, 'complete': not errors}

def write_snapshot(dest, data):
    dest = dest.resolve()
    cleanup_root = OUT.parent.resolve()
    if cleanup_root not in dest.parents:
        raise ValueError('输出必须在此受控清理报告目录下')
    dest.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode()
    # 独占创建由文件系统原子判定；并发同名写入不能覆盖先生成的原件。
    with dest.open('xb') as snapshot:
        snapshot.write(gzip.compress(raw, mtime=0))

def main():
    parser = argparse.ArgumentParser(description='只读盘点本机 WorkMesh；不删除任何路径')
    parser.add_argument('--phase', choices=['before', 'after', 'opening'], default='opening')
    parser.add_argument('--output', type=Path, help='受控清理报告目录中的 JSON.gz；缺省只打印摘要')
    args = parser.parse_args()
    started = utc()
    rows, exclusions, root_errors = [], [], []
    root_blocked = directory_gate(ROOT)
    if root_blocked:
        exclusions.append({'path': str(ROOT), **root_blocked})
        root_errors.extend(root_blocked['errors'])
        paths = []
    else:
        try:
            paths = list(ROOT.iterdir())
        except OSError as error:
            root_errors.append({'path': str(ROOT), 'error': str(error)})
            paths = []
    # 只列指定 workspace 根的直接子目录；归属通过 Git remote 实核。
    for path in paths:
        if not path.name.startswith('01a'):
            continue
        blocked = directory_gate(path)
        if blocked:
            exclusions.append({'path': str(path), **blocked})
            root_errors.extend(blocked['errors'])
            continue
        remote = git(path, 'remote', 'get-url', 'origin')
        if remote['exit'] or remote['stdout'].strip() != REPOSITORY:
            exclusions.append({'path': str(path), 'reason': '未确认 WorkMesh 归属；未遍历'})
            continue
        rows.append({'path': str(path), 'startedAt': utc(), 'remote': remote, 'head': git(path, 'rev-parse', 'HEAD'), **scan(path), 'endedAt': utc()})
    # 主仓库只是只读大小对照，永不成为脚本的回收候选；其它平台缓存不遍历。
    main_repo = ROOT / 'DzkLDn6UW-IbfoTJzN9Ro' / 'repo'
    main_size = {'path': str(main_repo), 'protected': True, **scan(main_repo)}
    total = sum(r['logicalBytes'] for r in rows)
    worktrees_complete = not root_blocked and not root_errors and all(r['complete'] for r in rows)
    complete = worktrees_complete and main_size['complete']
    error_count = len(root_errors) + sum(len(r['errors']) for r in rows) + len(main_size['errors'])
    data = {'startedAt': started, 'endedAt': utc(), 'phase': args.phase, 'workspaceRoot': str(ROOT), 'project': REPOSITORY,
            'complete': complete, 'errors': error_count, 'rootErrors': root_errors,
            'worktreeLogicalBytes': total if worktrees_complete else None,
            'worktreeDecimalGB': total / 10**9 if worktrees_complete else None,
            'worktreeGiB': total / 2**30 if worktrees_complete else None,
            'observedWorktreeLogicalBytes': total, 'worktreeCount': len(rows),
            'rows': rows, 'mainRepositorySeparate': main_size, 'exclusions': exclusions, 'registration': git(CURRENT, 'worktree', 'list', '--porcelain'),
            'limitations': '逻辑长度不跟链接，hardlink 副本重复计数；不含其它项目、用户目录、共享 store、镜像/业务数据；活动目录扫描不是一致快照；不代表物理分配或可归因净释放。用途分类不能代安全预检。'}
    if args.output:
        write_snapshot(args.output, data)
    groups = collections.Counter()
    for row in rows:
        for key, item in row['groups'].items():
            groups[key] += item['logicalBytes']
    top = sorted([{'path': r['path'], 'logicalBytes': r['logicalBytes']} for r in rows], key=lambda r: r['logicalBytes'], reverse=True)[:10]
    print(json.dumps({'phase': args.phase, 'complete': complete, 'count': len(rows),
                      'logicalBytes': data['worktreeLogicalBytes'], 'GB': data['worktreeDecimalGB'], 'GiB': data['worktreeGiB'],
                      'observedWorktreeLogicalBytes': total,
                      'mainRepoSeparateBytes': main_size['logicalBytes'] if main_size['complete'] else None,
                      'mainRepoObservedBytes': main_size['logicalBytes'], 'mainRepoComplete': main_size['complete'],
                      'groups': dict(groups), 'top10': top, 'errors': error_count}, ensure_ascii=False))
    return 0 if complete else 1

if __name__ == '__main__':
    sys.exit(main())
