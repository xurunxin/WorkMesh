"""准确旧构建定位和只读容器挂载；不读秘密或操作 Docker。"""
import json
import re
import subprocess
from audit import OUT, ROOT, CURRENT, MAIN, utc, sha, write, call

NAMES = ['01a12766-4132-7d8c-a542-dcbfb2008b49', '01a126be-7aba-7b1d-a57a-f58317f89a67',
         '01a1264e-bd35-76d4-b328-03e9b91301f3', '01a127d4-e047-7e57-81c2-3d054851fc88']

def main():
    sessions = []
    for day in ('10', '11'):
        for path in (ROOT.parent / 'codex-home/sessions/2026/10' / day).glob('*.jsonl'):
            with path.open(encoding='utf-8') as stream:
                first = stream.readline()
                meta = json.loads(first)['payload']
                if not any(meta.get('cwd', '').endswith(name) for name in NAMES):
                    continue
                task = None
                for i, line in enumerate(stream, 2):
                    p = json.loads(line).get('payload', {})
                    if p.get('role') == 'user' and p.get('type') == 'message':
                        text = '\n'.join(c.get('text', '') for c in p.get('content', []) if isinstance(c, dict))
                        if 'Title:' in text and '# AGENTS.md' not in text:
                            task = dict(line=i, text=text, originalLineSha256=sha(line.encode()))
                            break
                sessions.append(dict(source=str(path), metadataLineSha256=sha(first.encode()),
                    metadata={k: meta.get(k) for k in ('id','timestamp','cwd','git','cli_version')}, firstTask=task))
    logs = []
    source = ROOT.parent / 'daemon.log'
    with source.open(encoding='utf-8') as stream:
        for i, line in enumerate(stream, 1):
            if any(name in line for name in NAMES) and re.search(r'\[(workspace|step|machine)\]', line):
                assert not re.search(r'Bearer |wmi_|wms_|ghp_', line)
                logs.append(dict(line=i, text=line, sha256=sha(line.encode())))
    write('build-provenance.json', dict(recordedAt=utc(), sessions=sessions, daemonSource=str(source),
          selectedLines=logs, limitation='最小任务标题/构建路径/时间；非全局 build/recovery registry。'))
    calls = []
    def run(*argv):
        started = utc()
        p = subprocess.run(argv, capture_output=True)
        r = dict(input=list(argv), startedAt=started, endedAt=utc(), exit=p.returncode,
                 stdout=p.stdout.decode('utf-8','replace'), stderr=p.stderr.decode('utf-8','replace'))
        calls.append(r)
        assert p.returncode == 0
        return r['stdout']
    ids = run('docker','ps','-a','--format','{{.ID}}').splitlines()
    for identifier in ids:
        run('docker','inspect','--format','{{.Name}} {{json .State.Status}} {{json .Mounts}}',identifier)
    hits = [r for r in calls[1:] if any(n in r['stdout'] for n in NAMES)]
    write('docker-opening.json', dict(recordedAt=utc(), calls=calls, references=hits, complete=True))
    write('git-environment.json', dict(recordedAt=utc(), version=call(CURRENT,'--version'),
          registration=call(CURRENT,'worktree','list','--porcelain'),
          main=call(CURRENT,'show','-s','--format=%H %P %T %s',MAIN),
          merges=call(CURRENT,'log',MAIN,'--first-parent','--merges','-8','--format=%H %P %s')))
    print(dict(sessions=len(sessions), containers=len(ids), containerReferences=len(hits)))

if __name__ == '__main__':
    main()
