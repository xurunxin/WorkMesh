"""独审补件：按当前新时间只读核公共 native 身份，不倒填旧采样。"""
import sys
sys.dont_write_bytecode = True
import os
from pathlib import Path
import audit

a, OUT = audit.a, audit.OUT


def main():
    started = a.utc()
    source = a.load(OUT/'runtime-shared-source.json')
    path = Path(source['path'])
    stat = os.stat(path, follow_symlinks=False)
    observed = dict(path=str(path), device=stat.st_dev, fileId=stat.st_ino,
                    bytes=stat.st_size, attributes=stat.st_file_attributes, nlink=stat.st_nlink,
                    sha256=a.sha(path.read_bytes()))
    fields = ('device', 'fileId', 'bytes', 'attributes', 'sha256')
    assert all(observed[key] == source[key] for key in fields)
    a.write('shared-native-identity-review.json', dict(startedAt=started, endedAt=a.utc(),
        input=[sys.executable, '-B', *sys.argv], source='runtime-shared-source.json',
        sourceSha256=a.sha((OUT/'runtime-shared-source.json').read_bytes()),
        observed=observed, comparedFields=list(fields), success=True,
        note='当前新时点身份/属性/字节只读复核；不覆盖或倒填audit-after；nlink变化独立记录，物理释放未知'))
    print(a.json.dumps(dict(success=True, observed=observed), ensure_ascii=False))


if __name__ == '__main__':
    main()
