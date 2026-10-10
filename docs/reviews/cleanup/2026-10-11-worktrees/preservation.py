"""将 #53 每个普通文件映射到主线可达的精确 Git 对象；只读。"""
import hashlib
import json
import subprocess
from pathlib import Path
from inventory import CURRENT, OUT, ROOT, git, scan, utc, write

MAIN = '87f88b89297c5c1e346f7ef99118c410f4b4a905'
TARGET = ROOT / '01a11e5e-9e0c-704b-a590-3fee492f4f6a'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    head = git(TARGET, 'rev-parse', 'HEAD')
    commit = head['stdout'].strip()
    ancestor = git(CURRENT, 'merge-base', '--is-ancestor', commit, MAIN)
    assert head['exitCode'] == ancestor['exitCode'] == 0
    raw = subprocess.run(['git', '-C', str(CURRENT), 'ls-tree', '-r', '-z', commit], capture_output=True, check=True).stdout
    tree = {}
    for item in raw.split(b'\0'):
        if item:
            meta, name = item.split(b'\t')
            mode, kind, blob = meta.decode().split()
            assert kind == 'blob' and mode in ('100644', '100755')
            tree[name.decode()] = {'blob': blob, 'mode': mode}
    files, links, nested, errors = scan(TARGET)
    assert not links and not nested and not errors
    assert {f['path'] for f in files} == set(tree) | {'.git'}
    # 一个 batch 进程返回原始 blob 字节，避免 PowerShell 文本转换。
    objects = subprocess.run(['git', '-C', str(CURRENT), 'cat-file', '--batch'],
                             input=('\n'.join(v['blob'] for v in tree.values()) + '\n').encode(),
                             capture_output=True, check=True).stdout
    cursor, mapping, failures = 0, [], []
    for path, item in tree.items():
        end = objects.index(b'\n', cursor)
        blob, kind, length = objects[cursor:end].decode().split()
        assert blob == item['blob'] and kind == 'blob'
        start = end + 1
        source = objects[start:start + int(length)]
        cursor = start + int(length) + 1
        actual = (TARGET / path).read_bytes()
        if actual == source:
            transform = 'identity'
        elif actual == source.replace(b'\n', b'\r\n'):
            transform = 'replace-every-LF-with-CRLF'
        else:
            transform = 'unmapped'
            failures.append(path)
        mapping.append({'path': path, 'sourceCommit': commit, 'gitBlob': blob, 'mode': item['mode'],
                        'gitBytes': len(source), 'gitSha256': sha(source), 'windowsBytes': len(actual),
                        'windowsSha256': sha(actual), 'reconstruction': transform})
    pointer = (TARGET / '.git').read_bytes()
    status = git(TARGET, 'status', '--porcelain=v1', '--untracked-files=all')
    ignored = git(TARGET, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory')
    assert not status['stdout'] and not ignored['stdout'] and not failures
    write('preservation-53.json', {'recordedAt': utc(), 'target': str(TARGET), 'main': MAIN,
          'head': head, 'ancestor': ancestor, 'status': status, 'ignored': ignored,
          'files': mapping, 'links': links, 'nestedGit': nested, 'errors': errors,
          'unmapped': failures, 'logicalBytes': sum(f['bytes'] for f in files),
          'gitAdministrativePointer': {'bytes': len(pointer), 'sha256': sha(pointer), 'text': pointer.decode(),
          'role': 'linked worktree 的本机登记指针，不含产品成果；移除时由 Git 管理登记'},
          'method': '精确 commit:path → blob 原字节；Windows 字节逐值验证为 identity 或明确可逆 CRLF 变换，不用归一化哈希代原字节'})
    sources = []
    for p in sorted((CURRENT / 'docs/reviews/cleanup').iterdir()):
        if p.is_file():
            rel = p.relative_to(CURRENT).as_posix()
            obj = subprocess.run(['git', '-C', str(CURRENT), 'rev-parse', MAIN + ':' + rel], capture_output=True, check=True).stdout.decode().strip()
            data = subprocess.run(['git', '-C', str(CURRENT), 'cat-file', 'blob', obj], capture_output=True, check=True).stdout
            actual = p.read_bytes()
            sources.append({'path': rel, 'main': MAIN, 'blob': obj, 'gitBytes': len(data), 'gitSha256': sha(data),
                            'windowsBytes': len(actual), 'windowsSha256': sha(actual),
                            'byteEqual': actual == data, 'CRLFEqual': actual == data.replace(b'\n', b'\r\n')})
            # 完整读取全部 JSON；历史拒绝原件保留在 main，不复制敏感 RAW 字节。
            if p.suffix == '.json':
                json.loads(data)
    write('historical-sources.json', sources)
    print(json.dumps({'files': len(mapping), 'bytes': sum(f['bytes'] for f in files), 'unmapped': failures,
                      'transforms': {t: sum(f['reconstruction'] == t for f in mapping) for t in ['identity', 'replace-every-LF-with-CRLF']},
                      'historicalSources': len(sources)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
