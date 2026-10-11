"""绑定已推送的固定提交文件集合，分列 Git 与 Windows 字节。"""
import subprocess
import sys
from audit import OUT, CURRENT, utc, sha, write, call

def git(*args):
    return subprocess.run(['git','-C',str(CURRENT),*args],capture_output=True,check=True).stdout

def main():
    commit = sys.argv[1]
    assert call(CURRENT,'rev-parse','HEAD')['stdout'].strip() == commit
    prefix = str(OUT.relative_to(CURRENT)).replace('\\','/')
    rows = []
    for item in git('ls-tree','-r','-z',commit,'--',prefix,'docs/reviews/cleanup/2026-10-11-worktrees/cleanup-rules.json','.gitattributes').split(b'\0'):
        if not item:
            continue
        meta,path = item.split(b'\t')
        blob = meta.decode().split()[2]
        rel = path.decode()
        original = git('cat-file','blob',blob)
        runtime = (CURRENT / rel).read_bytes()
        choices = {'identity':original,'LF-to-CRLF':original.replace(b'\n',b'\r\n')}
        transform = next((k for k,v in choices.items() if v == runtime),None)
        assert transform is not None,rel
        if rel.endswith(('.zip','.gz')):
            assert transform == 'identity'
        rows.append(dict(path=rel,gitBlob=blob,gitBytes=len(original),gitSha256=sha(original),
                         windowsBytes=len(runtime),windowsSha256=sha(runtime),reconstruction=transform))
    assert rows
    write('preflight-binding.json',dict(recordedAt=utc(),commit=commit,success=True,files=rows,
          pushSource='preflight-push-receipt.json及remote-preflight.json；真实推送返回和远端准确ref独立回读'))
    print(dict(commit=commit,boundFiles=len(rows),success=True))

if __name__ == '__main__':
    main()
