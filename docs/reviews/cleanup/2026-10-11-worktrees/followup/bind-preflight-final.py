"""按先行提交的固定文件集合分列Git/Windows字节；文本变换须逐字节证实。"""
import sys
from common import *

def main():
    commit = sys.argv[1]
    assert call(CURRENT,'rev-parse','HEAD')['stdout'].strip() == commit
    rows = []
    prefix = str(OUT.relative_to(CURRENT)).replace('\\','/')
    entries = git('ls-tree','-r','-z',commit,'--',prefix).split(b'\0')
    for entry in entries:
        if not entry: continue
        meta, raw_path = entry.split(b'\t'); blob = meta.decode().split()[2]; rel=raw_path.decode()
        p = CURRENT/rel; b = p.read_bytes(); original = git('cat-file','blob',blob)
        choices={'identity':original,'LF-to-CRLF':original.replace(b'\n',b'\r\n'),
                 'CRLF-to-LF':original.replace(b'\r\n',b'\n')}
        transform=next((k for k,v in choices.items() if v==b),None)
        assert transform is not None, rel
        if p.suffix in ('.zip','.gz'): assert transform=='identity', rel
        rows.append({'path':rel,'blob':blob,'gitBytes':len(original),'gitSha256':sha(original),
                     'windowsBytes':len(b),'windowsSha256':sha(b),'byteEqual':original==b,'transformation':transform})
    assert len(rows)==57
    write('preflight-binding.json',{'recordedAt':utc(),'commit':commit,'success':True,'files':rows,
                                  'pushSource':'preflight-push-receipt.json；原输入/返回行及远端ref独立回读，非FETCH_HEAD',
                                  'firstFailure':'原严格identity binder拒绝execute-target.ps1的LF-to-CRLF现场变换；原失败不覆盖。固定提交集合包含57文件，后续回执不冒先行提交文件。'})
    print({'commit':commit,'files':len(rows),'allMapped':True,'textVariants':sum(not r['byteEqual'] for r in rows)})

if __name__ == '__main__':
    main()
