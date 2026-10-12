"""独有目录内运行 QEMU TCG 双架构完整 guest，保存脱敏可复核回执。"""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import threading
import time
import urllib.request

IMAGES = {
    "amd64": ("6a81c37564db9b1ee84e141922625e1d7c5b389b99bb3c572e0243607d5bb4d2", "x86_64"),
    "arm64": ("1d6bffe64b848468ac97f821d369a4846d983de1800ccf6b5ec8853e85cefc55", "aarch64"),
}


def sha(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def execute(args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", required=True, choices=IMAGES)
    parser.add_argument("--root", default="/data")
    parser.add_argument("--source", required=True)
    parser.add_argument("--api-url")
    parser.add_argument("--deadline-seconds", type=int, default=2400)
    options = parser.parse_args()
    root = Path(options.root).resolve()
    root.mkdir(exist_ok=True, parents=True)
    work = root / options.arch
    work.mkdir(exist_ok=False)
    receipts = []
    events = []
    start = time.monotonic()
    manifest = {"sourceHead": options.source, "arch": options.arch,
                "hostArch": os.uname().machine, "startedUtc": time.time(),
                "accelerator": "tcg", "guestRamMiB": 1536, "guestVcpus": 2,
                "scripts": {path.name: sha(path) for path in Path("/probe").glob("*.py")},
                "qemuVersion": execute(["qemu-system-x86_64", "--version"]).splitlines()[0],
                "packages": execute(["dpkg-query", "-W", "qemu-system-x86", "qemu-system-arm",
                                     "qemu-efi-aarch64", "genisoimage"]),
                "status": "running"}
    result = work / "result.json"

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            size = int(self.headers.get("Content-Length", "0"))
            if self.path in {"/api/start", "/api/replay"} and options.api_url and size <= 32768:
                request = urllib.request.Request(options.api_url + self.path[4:], self.rfile.read(size),
                                                 {"Content-Type": "application/json"})
                try:
                    with urllib.request.urlopen(request, timeout=120) as response:
                        data = response.read(32768)
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(data)
                except Exception:
                    self.send_error(502, "private API probe failed")
                return
            if self.path != "/receipt" or size > 4096:
                self.send_error(400)
                return
            value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            allowed = {"bootId", "uid", "arch", "kernel", "guestUtc", "dbusSessionPresent",
                       "secretBackend", "phase", "firstReadMatches", "persistentIdentity",
                       "secretDigest", "secretMatches", "bootIdChanged", "errorType", "apiReplay"}
            if not isinstance(value, dict) or set(value) - allowed:
                self.send_error(400)
                return
            receipts.append({**value, "hostUtc": time.time(), "hostElapsed": time.monotonic() - start})
            self.send_response(200)
            self.end_headers()
        def log_message(self, *_):
            pass

    server = HTTPServer(("127.0.0.1", 18080), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    process = None
    try:
        image = root / (options.arch + ".img")
        expected, machine_arch = IMAGES[options.arch]
        url = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-" + options.arch + ".img"
        if not image.exists():
            urllib.request.urlretrieve(url, image)
        actual = sha(image)
        manifest.update(imageUrl=url, imageSha256=actual, imageBytes=image.stat().st_size)
        if actual != expected:
            raise RuntimeError("official image digest mismatch; do not refresh silently")
        overlay = work / "root.qcow2"
        execute(["qemu-img", "create", "-f", "qcow2", "-F", "qcow2", "-b", str(image), str(overlay), "8G"])
        guest = Path("/probe/guest.py").read_bytes()
        wrapper = '''#!/bin/sh
set -eu
runuser -u wmprobe -- env TCG_API_PROBE=API_ENABLED dbus-run-session -- python3 /opt/tcg/guest.py
if grep -q '"phase": "reboot"' /home/wmprobe/.local/share/tcg-probe/state.json; then
  systemctl --no-block reboot
else
  systemctl --no-block poweroff
fi
'''
        wrapper = wrapper.replace("API_ENABLED", "1" if options.api_url else "0")
        service = '''[Unit]
Description=WorkMesh TCG research only
After=cloud-final.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/opt/tcg/finish.sh
TimeoutStartSec=600
[Install]
WantedBy=multi-user.target
'''
        files = [("/opt/tcg/guest.py", guest, "0644"),
                 ("/opt/tcg/finish.sh", wrapper.encode(), "0755"),
                 ("/etc/systemd/system/tcg-probe.service", service.encode(), "0644")]
        config = "#cloud-config\nusers:\n  - name: wmprobe\n    uid: 22020\n    lock_passwd: true\n    shell: /bin/sh\npackage_update: true\npackages:\n  - dbus\n  - gnome-keyring\n  - libsecret-tools\n  - python3\nwrite_files:\n"
        for path, data, permissions in files:
            config += "  - path: " + path + "\n    encoding: b64\n    permissions: '" + permissions + "'\n    content: " + base64.b64encode(data).decode() + "\n"
        config += "runcmd:\n  - [systemctl, daemon-reload]\n  - [systemctl, enable, tcg-probe.service]\n  - [systemctl, start, --no-block, tcg-probe.service]\n"
        (work / "user-data").write_text(config)
        (work / "meta-data").write_text("instance-id: workmesh-tcg-" + options.arch + "\nlocal-hostname: workmesh-tcg\n")
        seed = work / "seed.iso"
        execute(["genisoimage", "-quiet", "-output", str(seed), "-volid", "cidata", "-joliet", "-rock",
                 str(work / "user-data"), str(work / "meta-data")])
        qmp_path = str(work / "qmp.sock")
        args = ["qemu-system-" + machine_arch, "-accel", "tcg", "-m", "1536", "-smp", "2",
                "-display", "none", "-serial", "file:" + str(work / "serial.log"),
                "-qmp", "unix:" + qmp_path + ",server=on,wait=off",
                "-netdev", "user,id=net0", "-device", "virtio-net-pci,netdev=net0"]
        if options.arch == "arm64":
            firmware = Path("/usr/share/AAVMF/AAVMF_CODE.fd")
            variables = work / "vars.fd"
            variables.write_bytes(Path("/usr/share/AAVMF/AAVMF_VARS.fd").read_bytes())
            manifest["firmwareSha256"] = sha(firmware)
            args += ["-machine", "virt", "-cpu", "max", "-drive", "if=pflash,format=raw,readonly=on,file=" + str(firmware),
                     "-drive", "if=pflash,format=raw,file=" + str(variables)]
        args += ["-drive", "if=virtio,format=qcow2,file=" + str(overlay),
                 "-drive", "if=virtio,format=raw,readonly=on,file=" + str(seed)]
        manifest.update(qemuCommand=args, seedSha256=sha(seed),
                        overlayIdentity=str(overlay), bootLaunchUtc=time.time())
        stderr = (work / "qemu-stderr.log").open("w")
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=stderr)

        def qmp_reader():
            for _ in range(100):
                try:
                    channel = socket.socket(socket.AF_UNIX)
                    channel.connect(qmp_path)
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                return
            stream = channel.makefile("rwb")
            stream.readline()
            stream.write(b'{"execute":"qmp_capabilities"}\n')
            stream.flush()
            for line in stream:
                message = json.loads(line)
                if "event" in message:
                    events.append({"event": message["event"], "hostUtc": time.time(),
                                   "hostElapsed": time.monotonic() - start})
            channel.close()

        threading.Thread(target=qmp_reader, daemon=True).start()
        peak_rss = 0
        while process.poll() is None:
            status = Path("/proc") / str(process.pid) / "status"
            if status.exists():
                for line in status.read_text().splitlines():
                    if line.startswith("VmRSS:"):
                        peak_rss = max(peak_rss, int(line.split()[1]) * 1024)
            if time.monotonic() - start > options.deadline_seconds:
                raise TimeoutError("research deadline reached")
            if any(item["phase"] == "failure" for item in receipts):
                raise RuntimeError("guest probe failed")
            time.sleep(1)
        after = [item for item in receipts if item["phase"] == "after-reboot"]
        before = [item for item in receipts if item["phase"] == "before-reboot"]
        if process.returncode != 0 or len(before) != 1 or len(after) != 1:
            raise RuntimeError("missing guest reboot receipts")
        elapsed = after[0]["hostElapsed"] - before[0]["hostElapsed"]
        if not any(event["event"] == "RESET" for event in events):
            raise RuntimeError("missing QMP RESET")
        manifest.update(status="passed", rebootSeconds=elapsed,
                        withinExistingReplayWindow=elapsed < 15 * 60,
                        qemuPeakRssBytes=peak_rss, qemuExitCode=process.returncode,
                        overlayAllocatedBytes=overlay.stat().st_blocks * 512,
                        realApiReplay=after[0].get("apiReplay") or "not-tested", sourceConnectorConsumer="not-tested",
                        finalNoSourceInstallation="not-tested")
    except Exception as error:
        manifest.update(status="failed", errorType=type(error).__name__, safeError=str(error))
        raise
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        server.shutdown()
        manifest.update(endedUtc=time.time(), totalSeconds=time.monotonic() - start,
                        receipts=receipts, qmpEvents=events)
        result.write_text(json.dumps(manifest, indent=2) + "\n")
        print(json.dumps({"arch": options.arch, "status": manifest["status"], "result": str(result)}), flush=True)


if __name__ == "__main__":
    main()
