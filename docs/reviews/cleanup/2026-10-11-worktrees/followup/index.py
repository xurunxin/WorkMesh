"""实际暂存后生成Git blob与运行字节双列索引，不递归写自身HEAD。"""
from common import *

def main():
    files=[]
    for p in sorted(OUT.iterdir()):
        if not p.is_file() or p.name=='evidence-index.json': continue
        rel=str(p.relative_to(CURRENT)).replace('\\','/'); b=p.read_bytes()
        blob=git('rev-parse',':'+rel).decode().strip(); original=git('cat-file','blob',blob)
        transforms={'identity':original,'LF-to-CRLF':original.replace(b'\n',b'\r\n'),'CRLF-to-LF':original.replace(b'\r\n',b'\n')}
        transform=next((k for k,v in transforms.items() if v==b),None)
        assert transform is not None,rel
        if p.suffix in ('.zip','.gz'): assert transform=='identity'
        files.append({'path':rel,'gitBlob':blob,'gitBytes':len(original),'gitSha256':sha(original),
                      'windowsBytes':len(b),'windowsSha256':sha(b),'transformation':transform,'byteEqual':b==original})
    write('evidence-index.json',{'recordedAt':utc(),'sourceMain':MAIN,'preflightCommit':load(OUT/'preflight-binding.json')['commit'],
                                 'files':files,'selfExclusion':'索引不把自身SHA写入自身；全部受测源码/操作/数据绑定实际staged blob，最终head/CI独立回读'})
    print({'indexedFiles':len(files),'binaryAllEqual':True,'textVariants':sum(not r['byteEqual'] for r in files)})

if __name__ == '__main__':
    main()
