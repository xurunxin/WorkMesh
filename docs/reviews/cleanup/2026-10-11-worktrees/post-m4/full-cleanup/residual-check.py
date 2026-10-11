"""只允许预先声明的链接本体及普通空目录；无普通文件才能收尾。"""
import sys
sys.dont_write_bytecode=True
import os
import stat
from pathlib import Path
import audit
import preserve

def main():
    key=sys.argv[1];root=audit.ROOT/key;a=audit.a
    assert key not in audit.DENIED and root!=audit.CURRENT and not a.usage.directory_gate(root)
    mapping=a.load(audit.OUT/f'final-mapping-{key}.json.gz')
    expected={x['path']:x for x in mapping['links']}
    scanned=a.scan(root,full=True)
    assert not scanned['files'] and not scanned['errors'] and not scanned['nestedGit']
    for link in scanned['links']:
        old=expected[link['path']]
        assert link['target']==old['target'] and link['attributes']==old['attributes']
        assert preserve.h.native.raw_link(root/link['path'])['rawSha256']==old['rawSha256']
    dirs=[];stack=[root]
    while stack:
        p=stack.pop();dirs.append(str(p))
        with os.scandir(p) as entries:
            for entry in entries:
                s=entry.stat(follow_symlinks=False)
                if s.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:continue
                assert entry.is_dir(follow_symlinks=False)
                stack.append(Path(entry.path))
    a.write(f'residual-{key}.json',dict(path=str(root),safe=True,files=[],links=scanned['links'],
        directoriesDeepestFirst=sorted(dirs,key=lambda x:len(Path(x).parts),reverse=True)))
    print(dict(target=key,ordinaryFiles=0,links=len(scanned['links']),directories=len(dirs)))

if __name__=='__main__':main()
