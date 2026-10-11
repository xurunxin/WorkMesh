"""紧邻前只读引用和推送/运行字节复核；失败不发删除。"""
import subprocess
from audit import OUT, CURRENT, ROOT, utc, sha, load, write

def main():
    name = '01a12766-4132-7d8c-a542-dcbfb2008b49'
    commit = '80a490bb0caf6ccc16af24bcb320b45236e4be97'
    result = dict(startedAt=utc(),success=False,calls=[],errors=[])
    try:
        binding = load(OUT/'preflight-binding.json')
        assert binding['success'] and binding['commit'] == commit
        assert commit in load(OUT/'remote-preflight.json')['result']['content'][0]['text']
        assert 'pushed' in load(OUT/'preflight-push-receipt.json')['result']['content'][0]['text']
        for row in binding['files']:
            assert sha((CURRENT/row['path']).read_bytes()) == row['windowsSha256'],row['path']
        assert not any(name in row['inspectedReferences'] for row in load(OUT/'process-before-delete.json')['processes'])
        for identifier in ('OHtiaCWGLuE1ZKuaYcslS','iCMNjXqZQLp65ZUMZg0nr','ti53hOGbvnBNrvjXXveGO'):
            assert name not in load(OUT/('recovery-before-'+identifier+'.json'))['result']['content'][0]['text']
        board = load(OUT/'board-before-delete.json')['result']['content'][0]['text']
        assert '#60 [building]' in board
        result['boardSource'] = 'board-before-delete.json（仅当前本卡building，#5review；旧目录不是当前build）'
        def run(*argv):
            start = utc()
            p = subprocess.run(argv,capture_output=True)
            row = dict(input=list(argv),startedAt=start,endedAt=utc(),exit=p.returncode,
                stdout=p.stdout.decode('utf-8','replace'),stderr=p.stderr.decode('utf-8','replace'))
            result['calls'].append(row)
            assert p.returncode == 0
            return row['stdout']
        ids = run('docker','ps','-a','--format','{{.ID}}').splitlines()
        for identifier in ids:
            stdout = run('docker','inspect','--format','{{.Name}} {{json .State.Status}} {{json .Mounts}}',identifier)
            assert name not in stdout
        result.update(success=True,containerCount=len(ids),containerCandidateReferences=0,boundFiles=len(binding['files']))
    except (AssertionError,OSError,ValueError) as error:
        result['errors'].append(dict(type=type(error).__name__,message=str(error)))
    result['endedAt'] = utc()
    write('references-before-delete.json',result)
    print({k:result.get(k) for k in ('success','containerCount','boundFiles','errors')})
    return 0 if result['success'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
