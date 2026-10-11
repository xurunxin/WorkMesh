"""审查修复的准确入口与环境负例；不打印私有配置。"""
import os
import subprocess
import sys

mode = sys.argv[1]
env = dict(os.environ)
if mode in ['ci-conformance', 'native-missing-config']:
    for name in ['M5_CLIENT_EXECUTABLE', 'M5_EVIDENCE_ROOT']:
        env.pop(name, None)
    print('removedEnvironmentNames=M5_CLIENT_EXECUTABLE,M5_EVIDENCE_ROOT', flush=True)
if mode == 'ci-conformance':
    command = ['pnpm.cmd', 'test:conformance:integration']
elif mode == 'native-missing-config':
    command = ['pnpm.cmd', 'test:acceptance:m4']
else:
    raise ValueError('仅执行已列明确入口')
print('command=' + repr(command), flush=True)
result = subprocess.run(command, env=env, capture_output=True)
sys.stdout.buffer.write(result.stdout)
sys.stderr.buffer.write(result.stderr)
if mode == 'native-missing-config':
    assert result.returncode != 0
    assert b'M4_NATIVE_CLIENT_AND_PRIVATE_EVIDENCE_REQUIRED' in result.stderr
    print('negativeCase=missing_native_config; actualExit=' + str(result.returncode) + '; rejectedBeforeFixture=true')
else:
    sys.exit(result.returncode)
