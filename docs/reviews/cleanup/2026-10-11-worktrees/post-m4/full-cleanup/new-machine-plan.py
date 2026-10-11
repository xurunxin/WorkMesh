"""跨机器只读部署计划：不读取秘密、不安装、不启动、不删除。"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Git 只读检查失败：' + ' '.join(args))
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--store-base', required=True, help='新机器自己选定的 pnpm store 基目录绝对路径；不是 v3 子目录')
    args = parser.parse_args()
    root = Path.cwd().resolve()
    if Path(git(root, 'rev-parse', '--show-toplevel')).resolve() != root:
        raise RuntimeError('请在目标 WorkMesh 仓库根目录执行')
    remote = git(root, 'remote', 'get-url', 'origin').removesuffix('.git').rstrip('/')
    if remote not in ('https://github.com/xurunxin/WorkMesh', 'git@github.com:xurunxin/WorkMesh'):
        raise RuntimeError('不是准确 WorkMesh 远端；不输出可能含凭据的 URL')
    manifest = json.loads((root / 'package.json').read_text(encoding='utf-8-sig'))
    if manifest['packageManager'] != 'pnpm@9.15.4':
        raise RuntimeError('管理器版本已改变，请按新锁重新核验部署说明')
    store = Path(args.store_base).expanduser()
    if not store.is_absolute():
        raise RuntimeError('store-base 必须是新机器实际选定的绝对路径')
    store = store.resolve()
    # 任务可写依赖放进该仓库忽略的 .tmp，不能覆盖公共 CAS。
    virtual = root / '.tmp' / 'workmesh-virtual-store'
    if store == root or store in root.parents or root in store.parents:
        raise RuntimeError('共享 store 须独立于任务仓库，不放进源码或其祖先')
    for path in (root / '.tmp', virtual):
        if path.is_symlink() or (path.exists() and getattr(path.lstat(), 'st_file_attributes', 0) & 1024):
            raise RuntimeError('任务私有目录已有链接，不能盲目使用')
    lock = (root / 'pnpm-lock.yaml').read_bytes()
    command = ['pnpm', 'install', '--frozen-lockfile', '--store-dir', str(store),
               '--virtual-store-dir', str(virtual), '--package-import-method=copy', '--side-effects-cache=false']
    output = dict(
        applied=False, workspace=str(root), branch=git(root, 'branch', '--show-current'),
        head=git(root, 'rev-parse', 'HEAD'), dirty=bool(git(root, 'status', '--porcelain=v1')),
        expectedNode=(root / '.node-version').read_text(encoding='utf-8').strip(),
        expectedPnpm='9.15.4', lockSha256=hashlib.sha256(lock).hexdigest(),
        storeBase=str(store), storeExists=store.is_dir(), privateVirtualStore=str(virtual),
        existingEnvironment=(root / 'node_modules').exists() or virtual.exists(),
        offlineDependencyPreparation=command[:2] + ['--offline', '--ignore-scripts'] + command[2:],
        fullDependencyInstallation=command,
        nextReadOnlyChecks=[['node', '--version'], ['pnpm', '--version'], ['docker', 'version']],
        limitation='命令数组仅供审阅；没有验证当地工具版本、缓存完整性或部署。新环境确认工具版本后才执行。冷缓存需要用户恢复工作后允许联网准备；离线忽略脚本不代表完整可运行环境。',
    )
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
