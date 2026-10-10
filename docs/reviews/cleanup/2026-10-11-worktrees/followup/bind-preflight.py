"""成功推送后绑定准确提交与先行保全全部字节，不发删除。"""
import sys
from common import *

def main():
    commit = sys.argv[1]
    assert call(CURRENT,'rev-parse','HEAD')['stdout'].strip() == commit
    rows = []
    for p in sorted(OUT.iterdir()):
        if not p.is_file() or p.name == 'preflight-binding.json': continue
        rel = str(p.relative_to(CURRENT)).replace('\\','/')
        b = p.read_bytes(); blob = git('rev-parse',commit+':'+rel).decode().strip(); original = git('cat-file','blob',blob)
        equal = original == b
        assert equal, rel
        rows.append({'path':rel,'blob':blob,'gitBytes':len(original),'gitSha256':sha(original),
                     'windowsBytes':len(b),'windowsSha256':sha(b),'byteEqual':equal})
    write('preflight-binding.json',{'recordedAt':utc(),'commit':commit,'success':True,'files':rows,
                                  'pushSource':'preflight-push-receipt.json（本文件后续写入，独立保存原push返回），不使用FETCH_HEAD'})
    print({'commit':commit,'files':len(rows),'allByteEqual':True})

if __name__ == '__main__':
    main()
