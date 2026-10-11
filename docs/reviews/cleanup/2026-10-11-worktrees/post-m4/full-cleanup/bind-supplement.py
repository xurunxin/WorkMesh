"""绑定先行推送的追加门禁源码/政策与 Windows 字节；不变更现场。"""
import sys
sys.dont_write_bytecode=True
import subprocess
import re
import audit

a,OUT,CURRENT=audit.a,audit.OUT,audit.CURRENT


def main():
    phase,commit=sys.argv[1:]
    assert phase in ('hardlink','gate-resume') and re.fullmatch('[0-9a-f]{40}',commit)
    names=['verify-target.py','hardlink-retirement-policy.json'] if phase=='hardlink' else ['verify-target.py','execute-target.ps1','gate-resume-decision.json']
    files=[]
    for name in names:
        path=OUT/name;rel=path.relative_to(CURRENT).as_posix()
        query=a.call(CURRENT,'rev-parse',commit+':'+rel)
        assert query['exit']==0
        blob=query['stdout'].strip()
        args=['git','-C',str(CURRENT),'cat-file','blob',blob]
        started=a.utc();result=subprocess.run(args,capture_output=True)
        assert result.returncode==0
        raw=path.read_bytes();git=result.stdout
        if raw==git:conversion='identity'
        else:
            assert raw==git.replace(b'\n',b'\r\n')
            conversion='LF-to-CRLF'
        files.append(dict(path=rel,gitBlob=blob,gitBytes=len(git),gitSha256=a.sha(git),windowsBytes=len(raw),windowsSha256=a.sha(raw),
            reconstruction=conversion,sourceCall=query,objectCall=dict(input=args,startedAt=started,endedAt=a.utc(),exitCode=result.returncode)))
    a.write(phase+'-source-binding.json',dict(recordedAt=a.utc(),commit=commit,files=files,success=True,
        prerequisite='该commit先实际推送并独立回读本会话远端ref；原预检b7与历史原回执不覆盖'))
    print(dict(success=True,phase=phase,commit=commit,files=len(files)))


if __name__=='__main__':main()
