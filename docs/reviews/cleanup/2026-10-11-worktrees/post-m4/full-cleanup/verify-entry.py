"""真实当前入口的只读计划和拒绝边界；不建立或覆盖环境。"""
import sys
sys.dont_write_bytecode = True
import json
import os
from pathlib import Path
import subprocess
import audit

a, OUT, CURRENT = audit.a, audit.OUT, audit.CURRENT


def main():
    phase=sys.argv[1] if len(sys.argv)>1 else 'opening'
    assert phase in ('opening','ending')
    config_call = a.call(CURRENT,'rev-parse','--path-format=absolute','--git-common-dir')
    assert config_call['exit'] == 0
    config = Path(config_call['stdout'].strip()) / 'config'
    paths = [config,CURRENT/'package.json',CURRENT/'pnpm-lock.yaml']
    before = {str(p):a.sha(p.read_bytes()) for p in paths}
    expectations = [('plan',0,None),('finish-plan',0,None),
        ('install',1,'干净工作树'),('thin',1,'先保全并提交'),('hydrate',1,'未启用每工作树配置')]
    calls = []
    for mode, code, reason in expectations:
        args = [sys.executable,'-B',str(OUT/'rebuild-environment.py'),mode]
        if mode == 'hydrate':
            args += ['--path','docs/plan/agent-mcp-m5']
        started = a.utc()
        result = subprocess.run(args,cwd=CURRENT,capture_output=True,env={**os.environ,'PYTHONIOENCODING':'utf-8'})
        stdout, stderr = result.stdout.decode('utf-8'),result.stderr.decode('utf-8')
        record = dict(input=args,startedAt=started,endedAt=a.utc(),exitCode=result.returncode,stdout=stdout,stderr=stderr)
        calls.append(record)
        assert result.returncode == code,record
        if reason:
            assert reason in stderr
        else:
            data = json.loads(stdout)
            assert data['pnpmVersion'] == '9.15.4' and data['importMethod'] == 'copy' and not data['applied']
            if mode == 'finish-plan':
                assert data['cleanupCandidates'] == [str(CURRENT)] and data['ownerGap']
    after = {str(p):a.sha(p.read_bytes()) for p in paths}
    assert before == after
    name='entry-verification-ending.json' if phase=='ending' else 'entry-verification.json'
    a.write(name,dict(recordedAt=a.utc(),calls=calls,configLocator=config_call,
        hashesBefore=before,hashesAfter=after,unchanged=True,success=True,
        scope='真实 plan/finish-plan 与当前 dirty/未启用每树配置的安全拒绝，不冒新任务完整业务安装'))
    print(json.dumps(dict(success=True,calls=len(calls),configAndSourceUnchanged=True)))


if __name__ == '__main__':
    main()
