"""正式 Git 移除后的残留检查，只列原 junction 和普通空目录，不执行删除。"""
import sys
sys.dont_write_bytecode = True
import gzip
import json
import os
from pathlib import Path
import stat
from audit import OUT, ROOT, TARGETS, utc, write
from metadata_proof_import import raw_link
sys.path.insert(0, str(OUT.parent))
from inventory import scan

def main():
    n = int(sys.argv[1])
    root = ROOT / TARGETS[n]
    meta = json.loads(gzip.decompress((OUT / f'metadata-{n}.json.gz').read_bytes()))
    expected = {r['path']: r for r in meta['links'] if r['tag'] == 0xa0000003}
    files, links, nested, errors = scan(root)
    assert not files and not nested and not errors, (files[:5], nested, errors)
    assert {r['path'] for r in links} == set(expected)
    for link in links:
        old = expected[link['path']]
        assert old['insideCandidate'] and link['target'] == old['target']
        assert raw_link(root / link['path'])['rawSha256'] == old['rawSha256']
    dirs = []
    stack = [root]
    while stack:
        p = stack.pop()
        dirs.append(str(p))
        with os.scandir(p) as entries:
            for entry in entries:
                s = entry.stat(follow_symlinks=False)
                if s.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                    continue
                assert entry.is_dir(follow_symlinks=False)
                stack.append(Path(entry.path))
    write(f'residual-{n}.json', {'todo': n, 'recordedAt': utc(), 'path': str(root), 'files': files, 'links': links, 'directoriesDeepestFirst': sorted(dirs, key=lambda p: len(Path(p).parts), reverse=True), 'errors': errors, 'safe': True})
    print(json.dumps({'todo': n, 'ordinaryFiles': len(files), 'originalJunctions': len(links), 'ordinaryDirectories': len(dirs), 'safe': True}))

if __name__ == '__main__':
    main()
