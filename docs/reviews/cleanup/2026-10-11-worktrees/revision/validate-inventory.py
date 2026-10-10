"""保存定向回归原输出与受测字节指纹；不运行真实盘点或工作树清理。"""
import sys
sys.dont_write_bytecode = True
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

DIRECTORY = Path(os.path.abspath(__file__)).parent
REPOSITORY = DIRECTORY.parents[4]


def run(argv):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(argv, cwd=REPOSITORY, capture_output=True,
                            env={**os.environ, 'PYTHONUTF8': '1'})
    return {'input': argv, 'cwd': str(REPOSITORY), 'startedAt': started,
            'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'exit': result.returncode, 'stdout': result.stdout.decode('utf-8'),
            'stderr': result.stderr.decode('utf-8')}


def main():
    fingerprints = []
    for path in [DIRECTORY.parent / 'usage-inventory.py', DIRECTORY.parent / 'usage-inventory.test.py', Path(__file__)]:
        raw = path.read_bytes()
        relative = path.relative_to(REPOSITORY).as_posix()
        blob = run(['git', 'hash-object', f'--path={relative}', str(path)])
        if blob['exit']:
            raise RuntimeError(blob)
        fingerprints.append({'path': relative, 'windowsBytes': len(raw),
                             'windowsSha256': hashlib.sha256(raw).hexdigest(),
                             'normalizedGitBlob': blob['stdout'].strip(), 'blobCall': blob})
    calls = [run(['git', 'rev-parse', 'HEAD']),
             run([sys.executable, '-B', str(DIRECTORY.parent / 'usage-inventory.test.py')]),
             run(['git', 'diff', '--check'])]
    data = {'schemaVersion': 1, 'scope': '仅当前构建受控回归；没有运行真实盘点、删除或历史目标现场核查',
            'sourceFingerprints': fingerprints, 'calls': calls,
            'passed': all(call['exit'] == 0 for call in calls)}
    # 每次验证必须指定新文件名，已存在回执不覆盖。
    destination = DIRECTORY / sys.argv[1]
    if destination.parent != DIRECTORY or destination.suffix != '.json':
        raise ValueError('回执必须是本 revision 目录内的新 JSON 文件名')
    with destination.open('x', encoding='utf-8', newline='\n') as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps({'receipt': str(destination), 'passed': data['passed'],
                      'results': [{'input': call['input'], 'exit': call['exit']} for call in calls]}, ensure_ascii=False))
    return 0 if data['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
