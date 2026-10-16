"""原固定 QEMU／guest 镜像内的小组件对照；没有完整产品验收结论。"""
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import threading
import time
import urllib.request
import uuid


def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        while block := source.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def main():
    root = Path('/opt/micro')
    run = root / 'guest'
    run.mkdir(exist_ok=False)
    expected_version = 'QEMU emulator version 8.2.2 (Debian 1:8.2.2+ds-0ubuntu1.18)'
    version = subprocess.check_output(['qemu-system-x86_64', '--version']).decode().splitlines()[0]
    assert version == expected_version
    image = root / 'amd64.img'
    if not image.exists():
        urllib.request.urlretrieve('https://cloud-images.ubuntu.com/noble/20260926/noble-server-cloudimg-amd64.img', image)
    assert sha(image) == '6a81c37564db9b1ee84e141922625e1d7c5b389b99bb3c572e0243607d5bb4d2'
    nonce = uuid.uuid4().hex
    names = ['node-rootfs.tar.gz', 'runtime.tar', 'measurement.mjs']
    expected = {'nonce': nonce, 'inputs': {name: sha(root / name) for name in names},
                'nodeSha256': '638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328'}
    receipts = []
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path[1:] not in names:
                self.send_error(404)
                return
            file = root / self.path[1:]
            self.send_response(200)
            self.send_header('Content-Length', str(file.stat().st_size))
            self.end_headers()
            with file.open('rb') as source:
                while block := source.read(1024 * 1024):
                    self.wfile.write(block)
        def do_POST(self):
            size = int(self.headers.get('Content-Length', '0'))
            if self.path != '/receipt' or not 0 < size < 1024 * 1024:
                self.send_error(400)
                return
            value = json.loads(self.rfile.read(size))
            if value.get('nonce') != nonce or value.get('phase') != 'component-measurement':
                self.send_error(400)
                return
            receipts.append(value)
            self.send_response(200)
            self.end_headers()
        def log_message(self, *_):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 18080), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    cloud = '#cloud-config\nwrite_files:\n'
    for name, data in [('guest.py', (root / 'component-tcg-guest.py').read_bytes()), ('expected.json', json.dumps(expected).encode())]:
        cloud += '  - path: /opt/ta01-component-micro/' + name + '\n    permissions: "0644"\n    encoding: b64\n    content: ' + base64.b64encode(data).decode() + '\n'
    cloud += 'runcmd:\n  - [python3, /opt/ta01-component-micro/guest.py]\n'
    (run / 'user-data').write_text(cloud)
    (run / 'meta-data').write_text('instance-id: ta01-micro-' + nonce + '\nlocal-hostname: ta01-micro-' + nonce[:8] + '\n')
    subprocess.run(['genisoimage', '-quiet', '-output', str(run / 'seed.iso'), '-volid', 'cidata', '-joliet', '-rock',
                    str(run / 'user-data'), str(run / 'meta-data')], check=True, capture_output=True)
    subprocess.run(['qemu-img', 'create', '-f', 'qcow2', '-F', 'qcow2', '-b', str(image), str(run / 'root.qcow2'), '40G'],
                   check=True, capture_output=True)
    args = ['qemu-system-x86_64', '-accel', 'tcg', '-m', '4096', '-smp', '4', '-display', 'none',
            '-serial', 'file:' + str(run / 'serial.log'), '-netdev', 'user,id=net0', '-device', 'virtio-net-pci,netdev=net0',
            '-drive', 'if=virtio,format=qcow2,file=' + str(run / 'root.qcow2'),
            '-drive', 'if=virtio,format=raw,readonly=on,file=' + str(run / 'seed.iso')]
    began = time.monotonic()
    result = {'qemuVersion': version, 'imageSha256': sha(image), 'guestVcpus': 4, 'guestRamMiB': 4096,
              'inputs': expected, 'fullProductAcceptance': False, 'qemuCommand': args}
    process = None
    try:
        with (run / 'qemu-stderr.log').open('wb') as error:
            process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=error)
            try:
                result['qemuExitCode'] = process.wait(timeout=1200)
            except subprocess.TimeoutExpired:
                result['deadlineReached'] = True
                process.terminate()
                result['qemuExitCode'] = process.wait(timeout=15)
        result['receipts'] = receipts
        result['status'] = 'component-measured' if len(receipts) == 1 and receipts[0].get('nodeExitCode') == 0 else 'incomplete'
    finally:
        if process and process.poll() is None:
            process.terminate()
            process.wait(timeout=15)
        result['elapsedSeconds'] = time.monotonic() - began
        (run / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        server.shutdown()
        server.server_close()
    print(json.dumps({'status': result['status'], 'elapsedSeconds': result['elapsedSeconds'],
                      'receipts': len(receipts), 'nodeExitCodes': [value.get('nodeExitCode') for value in receipts]}))


if __name__ == '__main__':
    main()
