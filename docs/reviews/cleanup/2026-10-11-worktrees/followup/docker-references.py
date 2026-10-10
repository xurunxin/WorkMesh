"""只读所有容器（含停止容器）的名称/挂载；不读取 Env、不清 Docker。"""
import subprocess
import sys
from common import utc, write, TARGETS

def main():
    calls = []
    def run(*args):
        started = utc(); p = subprocess.run(list(args), capture_output=True)
        r = {'input': list(args), 'startedAt': started, 'endedAt': utc(), 'exit': p.returncode,
             'stdout': p.stdout.decode('utf-8', 'replace'), 'stderr': p.stderr.decode('utf-8', 'replace')}
        calls.append(r); assert p.returncode == 0, r
        return r['stdout']
    ids = run('docker', 'ps', '-a', '--format', '{{.ID}}').splitlines()
    for identifier in ids:
        run('docker', 'inspect', '--format', '{{.Name}} {{json .Mounts}}', identifier)
    hits = [r for r in calls[1:] if any(n in r['stdout'] for n in TARGETS.values())]
    write('docker-' + sys.argv[1] + '.json', {'recordedAt': utc(), 'calls': calls, 'candidateHits': hits, 'complete': True})
    print({'containers': len(ids), 'candidateHits': len(hits)})
    assert not hits

if __name__ == '__main__':
    main()
