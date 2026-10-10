"""只读核 reparse 本体、hardlink/属性、reflog 与依赖锁版本来源。"""
import sys
sys.dont_write_bytecode = True
import base64
import collections
import ctypes
from ctypes import wintypes
import gzip
import hashlib
import json
import os
import re
import stat
import subprocess
from audit import OUT, CURRENT, ROOT, MAIN, TARGETS, utc, write, call

K = ctypes.WinDLL('kernel32', use_last_error=True)
K.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
K.CreateFileW.restype = wintypes.HANDLE
K.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
K.CloseHandle.argtypes = [wintypes.HANDLE]

def raw_link(path):
    handle = K.CreateFileW(str(path), 0, 7, None, 3, 0x02200000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        buffer = ctypes.create_string_buffer(16384)
        count = wintypes.DWORD()
        if not K.DeviceIoControl(handle, 0x900a8, None, 0, buffer, len(buffer), ctypes.byref(count), None):
            raise ctypes.WinError(ctypes.get_last_error())
        b = buffer.raw[:count.value]
        return {'tag': int.from_bytes(b[:4], 'little'), 'rawBytes': len(b), 'rawSha256': hashlib.sha256(b).hexdigest(), 'rawBase64': base64.b64encode(b).decode()}
    finally:
        K.CloseHandle(handle)

def exclusive_open(path):
    handle = K.CreateFileW(str(path), 0x80000000, 0, None, 3, 0x00200000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    K.CloseHandle(handle)

def load(name):
    return json.loads(gzip.decompress((OUT / name).read_bytes()))

def git(*args):
    return subprocess.run(['git', '-C', str(CURRENT), *args], capture_output=True, check=True).stdout

def main():
    # 每个 immutable 历史锁文件独立保留 blob、commit、原字节哈希；不查共享 FETCH_HEAD。
    commits = git('log', MAIN, '-12', '--format=%H', '--', 'pnpm-lock.yaml').decode().splitlines()
    locks = []
    for commit in commits:
        blob = git('rev-parse', commit + ':pnpm-lock.yaml').decode().strip()
        b = git('cat-file', 'blob', blob)
        locks.append({'commit': commit, 'blob': blob, 'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b), 'text': b.decode()})
    for n, name in TARGETS.items():
        root = ROOT / name
        mapping = load(f'mapping-{n}.json.gz')
        stats, ro, special, package_files = [], [], [], {}
        for r in mapping['files']:
            rel = r['path']
            s = (root / rel).lstat()
            assert not s.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT
            stats.append({'path': rel, 'attributes': s.st_file_attributes, 'nlink': s.st_nlink, 'fileId': s.st_ino, 'device': s.st_dev})
            if s.st_file_attributes & stat.FILE_ATTRIBUTE_READONLY:
                ro.append(rel)
            if rel.startswith('node_modules/.pnpm/'):
                folder = rel.split('/')[2]
                package_files.setdefault(folder, []).append(rel)
        packages = []
        for folder, paths in package_files.items():
            if folder in ('node_modules',) or folder.endswith('.yaml'):
                continue
            wanted = folder.split('@', 2)
            # 普通包/作用域包的安装目录名：去掉 peer 后缀。
            name_match = re.match(r'^(@?[^@]+)@([^_]+)', folder)
            assert name_match, folder
            namepart = name_match.group(1).replace('+', '/')
            meta_rel = 'node_modules/.pnpm/' + folder + '/node_modules/' + namepart + '/package.json'
            if meta_rel not in paths:
                special.append({'folder': folder, 'reason': '找不到普通文件 package.json；需另保全而非猜版本'})
                continue
            meta_bytes = (root / meta_rel).read_bytes()
            meta = json.loads(meta_bytes)
            key = meta['name'] + '@' + meta['version']
            match = next((l for l in locks if re.search(r'^  [\'\"]?' + re.escape(key) + r'(?:[\'\"]?:|\()', l['text'], re.M)), None)
            if not match:
                special.append({'folder': folder, 'package': key, 'reason': '12 个主线可达锁版本均未命中；需内容保全'})
            packages.append({'folder': folder, 'package': key, 'packageJsonPath': meta_rel, 'packageJsonBytes': len(meta_bytes), 'packageJsonSha256': hashlib.sha256(meta_bytes).hexdigest(), 'lockSource': {k: match[k] for k in ('commit', 'blob', 'sha256', 'bytes')} if match else None})
        reflog = call(root, 'reflog', 'show', '--format=%H %gD %gs', 'HEAD')
        reflog_heads = sorted({line.split(' ')[0] for line in reflog['stdout'].splitlines()})
        reflog_proofs = [call(CURRENT, 'merge-base', '--is-ancestor', h, MAIN) for h in reflog_heads]
        links = []
        for link in mapping['links']:
            links.append({**link, **raw_link(root / link['path'])})
        write(f'metadata-{n}.json.gz', {'todo': n, 'recordedAt': utc(), 'files': stats, 'readOnlyFiles': ro, 'hardlinkedFileCount': sum(r['nlink'] > 1 for r in stats), 'links': links, 'packages': packages, 'unmappedPackages': special, 'reflog': reflog, 'reflogAncestry': reflog_proofs})
        print(json.dumps({'todo': n, 'readonly': len(ro), 'hardlinks': sum(r['nlink'] > 1 for r in stats), 'tags': dict(collections.Counter(r['tag'] for r in links)), 'packages': len(packages), 'unmappedPackages': special, 'unmergedReflog': sum(r['exit'] != 0 for r in reflog_proofs)}, ensure_ascii=False), flush=True)
    write('lock-history-sources.json', [{k: l[k] for k in ('commit', 'blob', 'sha256', 'bytes')} for l in locks])

if __name__ == '__main__':
    main()
