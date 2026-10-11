"""只验证可移植计划及拒绝边界；不建立新环境。"""
import sys
sys.dont_write_bytecode = True
import json
import subprocess
import audit

a, OUT, CURRENT = audit.a, audit.OUT, audit.CURRENT


def main():
    files = [CURRENT/'package.json', CURRENT/'pnpm-lock.yaml', CURRENT/'.node-version']
    before = {str(p): a.sha(p.read_bytes()) for p in files}
    calls = []
    for store, code, reason in [('X:/packages/.pnpm-store', 0, None), ('relative-store', 1, '必须'), (str(CURRENT), 1, '独立于任务仓库')]:
        args = [sys.executable, '-B', str(OUT/'new-machine-plan.py'), '--store-base', store]
        started = a.utc()
        p = subprocess.run(args, cwd=CURRENT, capture_output=True)
        row = dict(input=args, startedAt=started, endedAt=a.utc(), exitCode=p.returncode,
                   stdout=p.stdout.decode('utf-8'), stderr=p.stderr.decode('utf-8'))
        calls.append(row)
        assert p.returncode == code, row
        if reason:
            assert reason in row['stderr']
        else:
            plan = json.loads(row['stdout'])
            assert not plan['applied'] and plan['expectedNode'] == '22.19.0' and plan['expectedPnpm'] == '9.15.4'
            assert '--package-import-method=copy' in plan['fullDependencyInstallation']
    after = {str(p): a.sha(p.read_bytes()) for p in files}
    assert before == after
    a.write('new-machine-verification.json', dict(recordedAt=a.utc(), success=True, calls=calls,
            hashesBefore=before, hashesAfter=after, scope='本机只读计划/相对store与仓库内store拒绝；未执行新机器安装、容器部署或产品验收'))
    print(json.dumps(dict(success=True, calls=len(calls), newEnvironmentDeployed=False)))


if __name__ == '__main__':
    main()
