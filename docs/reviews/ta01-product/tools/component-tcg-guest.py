"""仅在独有合成 QEMU guest 内运行；不是产品安装或验收入口。"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        while block := source.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def main():
    base = Path('/opt/ta01-component-micro')
    expected = json.loads((base / 'expected.json').read_bytes())
    # 在任何路由、挂载或 chroot 操作之前核虚拟机和本次 seed 身份。
    assert Path('/sys/class/dmi/id/sys_vendor').read_text().strip() == 'QEMU'
    assert os.uname().nodename == 'ta01-micro-' + expected['nonce'][:8]
    assert os.geteuid() == 0
    receipt = {'phase': 'component-measurement', 'nonce': expected['nonce'],
               'kernel': os.uname().release, 'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
               'cpuCount': os.cpu_count(), 'accelerator': 'tcg', 'fullProductAcceptance': False}
    started = time.monotonic()
    try:
        for name, checksum in expected['inputs'].items():
            assert name in {'node-rootfs.tar.gz', 'runtime.tar', 'measurement.mjs'}
            target = base / name
            with urllib.request.urlopen('http://10.0.2.2:18080/' + name, timeout=60) as response, target.open('xb') as out:
                while block := response.read(1024 * 1024):
                    out.write(block)
            assert digest(target) == checksum
        subprocess.run(['ip', 'route', 'del', 'default'], check=True, capture_output=True)
        assert b'default' not in subprocess.check_output(['ip', 'route'])
        node_root = base / 'node-root'
        node_root.mkdir(exist_ok=False)
        subprocess.run(['tar', '-xzf', str(base / 'node-rootfs.tar.gz'), '-C', str(node_root)], check=True, capture_output=True)
        component = node_root / 'tmp/probe'
        component.mkdir(parents=True, exist_ok=False)
        subprocess.run(['tar', '-xf', str(base / 'runtime.tar'), '-C', str(component)], check=True, capture_output=True)
        (node_root / 'tmp/measurement.mjs').write_bytes((base / 'measurement.mjs').read_bytes())
        proc = node_root / 'proc'
        proc.mkdir(exist_ok=True)
        subprocess.run(['mount', '-t', 'proc', '-o', 'nosuid,nodev,noexec', 'proc', str(proc)], check=True, capture_output=True)
        null = node_root / 'dev/null'
        if not null.exists():
            subprocess.run(['mknod', '-m', '666', str(null), 'c', '1', '3'], check=True, capture_output=True)
        subprocess.run(['chroot', str(node_root), '/usr/local/bin/node',
            '/tmp/probe/infra/docker/prepare-production-deploy.mjs', '/tmp/probe/pkgs/0'],
            check=True, capture_output=True, timeout=60)
        node_started = time.monotonic()
        result = subprocess.run(['chroot', '--userspec=10001:10001', str(node_root), '/usr/local/bin/node',
            '/tmp/measurement.mjs', '/tmp/probe/pkgs/0', '--segments', '--work-read-fixture'],
            capture_output=True, timeout=600)
        receipt.update(nodeExitCode=result.returncode, nodeSeconds=time.monotonic() - node_started,
                       stdoutSha256=hashlib.sha256(result.stdout).hexdigest(),
                       stderrSha256=hashlib.sha256(result.stderr).hexdigest())
        if result.returncode == 0:
            value = json.loads(result.stdout)
            assert value['executableSha256'] == expected['nodeSha256']
            assert value['unknownRequests'] == 0 and value['workReadFixture'] and len(value['requests']) == 24
            receipt['probe'] = value
        else:
            receipt['errorType'] = 'ComponentProcessFailed'
    except Exception as error:
        allowed = {'AssertionError', 'OSError', 'TimeoutExpired', 'CalledProcessError', 'JSONDecodeError'}
        receipt['errorType'] = type(error).__name__ if type(error).__name__ in allowed else 'OtherError'
    receipt['totalSeconds'] = time.monotonic() - started
    payload = json.dumps(receipt).encode()
    assert len(payload) < 1024 * 1024
    # 单次回执；发送失败不重试、不改业务期限。
    try:
        request = urllib.request.Request('http://10.0.2.2:18080/receipt', payload, {'content-type': 'application/json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            assert response.status == 200
    finally:
        print(json.dumps({'tag': 'ta01-component-finished', 'nodeExitCode': receipt.get('nodeExitCode'),
                          'errorType': receipt.get('errorType')}), flush=True)
        subprocess.run(['systemctl', '--no-block', 'poweroff'], check=True)


if __name__ == '__main__':
    main()
