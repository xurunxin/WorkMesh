"""精确声明 M5/M4 共享 native 身份的已完成派生链接退休计数。"""
import sys
sys.dont_write_bytecode=True
import audit

a,OUT=audit.a,audit.OUT


def main():
    canonical=a.load(OUT/'runtime-shared-source.json')
    identity=(canonical['device'],canonical['fileId'])
    roots=[]
    for target in a.load(OUT/'execution-plan.json')['targets']:
        mapping_path=OUT/('final-mapping-'+target['key']+'.json.gz')
        mapping=a.load(mapping_path)
        files=[f for f in mapping['files'] if (f['device'],f['fileId'])==identity]
        if files:
            assert all(f['windowsSha256']==canonical['sha256'] and f['bytes']==canonical['bytes'] and f['nlink']==canonical['nlink'] for f in files)
            roots.append(dict(key=target['key'],mapping=mapping_path.name,mappingSha256=a.sha(mapping_path.read_bytes()),
                files=[dict(path=f['path'],bytes=f['bytes'],nlink=f['nlink'],windowsSha256=f['windowsSha256']) for f in files],count=len(files)))
    assert sorted(r['count'] for r in roots)==[17,24]
    a.write('hardlink-retirement-policy.json',dict(recordedAt=a.utc(),device=identity[0],fileId=identity[1],
        canonical=canonical,roots=roots,rule='仅扣除同身份、已证明完整回收且目录/登记不存在的本轮精确映射路径数；其它nlink漂移仍停门。公共本体保留，字节/属性/mtime/exclusive-open仍逐项重核。'))
    print(dict(roots=len(roots),derivedPaths=sum(r['count'] for r in roots),baselineNlink=canonical['nlink']))


if __name__=='__main__':main()
