"""发布前解析和恢复来源核验；不执行归档内容或删除任何现场。"""
import sys
sys.dont_write_bytecode=True
import ast
import collections
import zipfile
import audit

a=audit.a;OUT=audit.OUT

def main():
    plan=a.load(OUT/'execution-plan.json');catalog=a.load(OUT/'catalog.json.gz')
    archive=OUT/plan['archive']['path']
    assert a.sha(archive.read_bytes())==plan['archive']['sha256']
    members={};kinds=collections.Counter();files=0;staged=0
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for info in z.infolist():
            data=z.read(info);members[info.filename]=dict(bytes=len(data),sha256=a.sha(data),crc32=info.CRC)
    def check(row):
        source=row.get('source')
        if row['kind']=='unique-archive':
            assert source['zip'].endswith('/'+plan['archive']['path']) and source['zipSha256']==plan['archive']['sha256']
            actual=members[source['member']]
            assert actual['sha256']==source['sha256'] and actual['bytes']==source['bytes']
            if 'windowsSha256' in row and not row.get('sanitized'):
                assert row['windowsSha256']==source['sha256'] and row['bytes']==source['bytes']
        elif row['kind']=='existing-git':
            blob=catalog['blobs'][source['blob']]
            assert source['gitSha256']==blob['gitSha256']
            if 'windowsSha256' in row and not row.get('sanitized'):
                transformed=blob['transforms'][source['reconstruction']]
                assert transformed['sha256']==row['windowsSha256'] and transformed['bytes']==row['bytes']
        elif row['kind']=='existing-zip':
            assert source['sha256'] in catalog['members']
            if not row.get('sanitized'):assert row['windowsSha256']==source['sha256'] and row['bytes']==source['bytes']
        elif row['kind']=='existing-sanitized-archive':assert row['sanitized'] and source['mappingProof'] and source['redactionReport']['crcVerified']
        elif row['kind']=='existing-shared-CAS':assert source['sha256']==row['windowsSha256'] and source['bytes']==row['bytes']
        else:assert row['kind'] in ('administration','rebuildable-dependency','rebuildable-cache','rebuildable-git-index','rebuildable-private-test-state','rebuildable-native-runtime')
    for target in plan['targets']:
        assert target['safe'] and target['key'] not in audit.DENIED
        mapping=a.load(OUT/f"final-mapping-{target['key']}.json.gz")
        assert mapping['preservationCompleted'] and not mapping['errors']
        assert sum(x['bytes'] for x in mapping['files'])==target['logicalBytes']
        for row in mapping['files']:check(row);kinds[row['kind']]+=1;files+=1
        for row in mapping['index']:check(row);staged+=1
    for path in OUT.glob('*.py'):ast.parse(path.read_text(encoding='utf-8-sig'),filename=str(path))
    a.write('preservation-verification.json',dict(recordedAt=a.utc(),success=True,targets=len(plan['targets']),files=files,indexEntries=staged,
        archiveMembers=len(members),archiveBytes=archive.stat().st_size,kinds=dict(kinds),gitBlobs=len(catalog['blobs']),
        sourceZipCrcVerified=sum(x['crcVerified'] for x in catalog['zipProofs']),historicalInvalidZips=[x for x in catalog['zipProofs'] if not x['crcVerified']],
        scope='最终成员 SHA/长度/CRC 全核；Git 变换及已核源目录关联；Python AST解析；每目标现场仍须删除前另核身份/hash/活动/远端main'))
    print(dict(success=True,targets=len(plan['targets']),files=files,indexEntries=staged,archiveMembers=len(members)))

if __name__=='__main__':main()
