"""正式 Git 成功后仅核已声明 junction 与普通空目录；不删除。"""
import os
import sys
import stat
from common import *

def main():
    key = sys.argv[1]; root = ROOT / TARGETS[key]
    mapping = load(OUT / f'mapping-{key}.json.gz')
    gate(root)
    expected = {r['path']: r for r in mapping['links'] if r['tag'] == 0xa0000003}
    files, links, nested, errors = scanner.scan(root)
    assert not files and not nested and not errors
    assert {r['path'] for r in links} == set(expected)
    for link in links:
        old = expected[link['path']]
        assert old['insideCandidate'] and link['target'] == old['target']
        assert native.raw_link(root / link['path'])['rawSha256'] == old['rawSha256']
    dirs = []; stack = [root]
    while stack:
        p = stack.pop(); dirs.append(str(p))
        with os.scandir(p) as entries:
            for entry in entries:
                info = entry.stat(follow_symlinks=False)
                if info.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT: continue
                assert entry.is_dir(follow_symlinks=False)
                stack.append(Path(entry.path))
    write(f'residual-{key}.json', {'key': key, 'recordedAt': utc(), 'path': str(root), 'safe': True,
                                'files': files, 'links': links, 'directoriesDeepestFirst': sorted(dirs,key=lambda p:len(Path(p).parts),reverse=True)})
    print({'key': key, 'ordinaryFiles': 0, 'junctions': len(links), 'ordinaryDirectories': len(dirs)})

if __name__ == '__main__':
    main()
