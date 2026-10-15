"""Run installed Linux release in an exclusive full TCG guest; preserve failures."""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import threading
import time
import urllib.request

REPO = Path(__file__).resolve().parents[2]
GUEST_VCPUS = 4
PROFILES = ('personal', 'team', 'enterprise')
spec = importlib.util.spec_from_file_location("tcg_research_common", REPO / "docs/reviews/b-ship/tcg/tools/run.py")
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
sha, execute, IMAGES = common.sha, common.execute, common.IMAGES


def valid_receipt(value, native_diagnostic=False):
    phases = {'before-reboot', 'after-reboot', 'failure'}
    if native_diagnostic:
        phases.add('native-diagnostic')
    return (isinstance(value, dict) and value.get('phase') in phases
            and not __import__('re').search(r'wm[ips]_[A-Za-z0-9_-]{43}', json.dumps(value)))


def complete_reboot_checks(value, profiles=PROFILES):
    if (not isinstance(profiles, (list, tuple)) or not profiles
            or any(not isinstance(profile, str) or profile not in PROFILES for profile in profiles)
            or len(set(profiles)) != len(profiles)):
        return False
    entries = value.get('checks', [])
    required = {'authenticatedApiAfterReboot', 'authenticatedMcpAfterReboot',
                'artifactBytesAfterReboot', 'newOutboxDeliveredAfterReboot'}
    return (isinstance(entries, list) and len(entries) == len(profiles)
            and all(isinstance(entry, dict) and isinstance(entry.get('checks'), list)
                    and required.issubset(entry['checks']) for entry in entries)
            and {entry.get('profile') for entry in entries} == set(profiles))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", choices=IMAGES, required=True)
    parser.add_argument("--artifacts", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--native-diagnostic", action="store_true")
    parser.add_argument("--profile", choices=PROFILES)
    options = parser.parse_args()
    profiles = [options.profile] if options.profile else list(PROFILES)
    root = Path(options.root).resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    artifacts = Path(options.artifacts).resolve()
    manifest = json.loads((artifacts / "manifest.json").read_text())
    if manifest["arch"] != options.arch or manifest["source"]["commit"] != options.source:
        raise RuntimeError("artifact source/architecture mismatch")
    served = {"manifest.json", *[entry["path"] for entry in manifest["files"] + manifest["chunks"] + manifest["bootstrapChunks"]]}
    receipts, events = [], []
    began = time.monotonic()
    result = {"sourceHead": options.source, "sourceTree": manifest["source"]["tree"], "arch": options.arch,
              "manifestSha256": sha(artifacts / "manifest.json"), "archiveSha256": sha(artifacts / "manifest.json"),
              "accelerator": "tcg", "guestRamMiB": 4096, "guestVcpus": GUEST_VCPUS,
              "scripts": {p.name: sha(p) for p in Path(__file__).parent.glob("*.py")},
              "startedUtc": time.time(), "status": "running", "nativeDiagnostic": options.native_diagnostic,
              "profilesRequested": profiles, "scope": "single-configuration" if options.profile else "all-profiles"}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = self.path.removeprefix("/distribution/")
            if not self.path.startswith("/distribution/") or path not in served:
                self.send_error(404)
                return
            source_path = artifacts / path
            self.send_response(200)
            self.send_header("Content-Length", str(source_path.stat().st_size))
            self.end_headers()
            with source_path.open("rb") as source:
                while block := source.read(1024 * 1024):
                    self.wfile.write(block)

        def do_POST(self):
            size = int(self.headers.get("Content-Length", "0"))
            if self.path != "/receipt" or size > 1024 * 1024:
                self.send_error(400)
                return
            value = json.loads(self.rfile.read(size))
            if not valid_receipt(value, options.native_diagnostic):
                self.send_error(400)
                return
            receipts.append({**value, "hostUtc": time.time(), "hostElapsed": time.monotonic() - began})
            self.send_response(200)
            self.end_headers()

        def log_message(self, *_):
            pass

    collector = ThreadingHTTPServer(("127.0.0.1", 18080), Handler)
    threading.Thread(target=collector.serve_forever, daemon=True).start()
    process = None
    def interrupted(_signal, _frame):
        raise InterruptedError("product guest canceled")
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    try:
        expected, machine = IMAGES[options.arch]
        cache = root.parent / "image-cache"
        cache.mkdir(mode=0o700, exist_ok=True)
        image = cache / (options.arch + ".img")
        url = "https://cloud-images.ubuntu.com/noble/20260926/noble-server-cloudimg-" + options.arch + ".img"
        if not image.exists():
            urllib.request.urlretrieve(url, image)
        if sha(image) != expected:
            raise RuntimeError("pinned guest image digest mismatch")
        overlay = root / "root.qcow2"
        execute(["qemu-img", "create", "-f", "qcow2", "-F", "qcow2", "-b", str(image), str(overlay), "40G"])
        guest = (Path(__file__).parent / "guest.py").read_bytes()
        wrapper = b'''#!/bin/sh
set -eu
test ! -e /root/node_modules
test ! -e /repo
test ! -e /workspace
test ! -e /workmesh
test -z "$(command -v node || true)"
python3 /opt/server-install/guest.py
if test -f /root/server-install/reboot; then
  rm /root/server-install/reboot
  systemctl --no-block reboot
else
  systemctl --no-block poweroff
fi
'''
        service = b'''[Unit]
Description=WorkMesh server installed candidate acceptance
After=cloud-final.service network-online.target docker.service
Wants=network-online.target docker.service
[Service]
Type=oneshot
StandardOutput=journal+console
StandardError=journal+console
ExecStart=/opt/server-install/finish.sh
TimeoutStartSec=7200
[Install]
WantedBy=cloud-init.target
'''
        files = [("/opt/server-install/guest.py", guest, "0644"), ("/opt/server-install/finish.sh", wrapper, "0755"),
                 ("/etc/systemd/system/server-install.service", service, "0644"),
                 ("/opt/server-install/expected.json", json.dumps({"manifestSha256": result["manifestSha256"], "sourceHead": options.source, "arch": options.arch, "nativeDiagnostic": options.native_diagnostic, "profiles": profiles}).encode(), "0644")]
        if options.native_diagnostic:
            files.append(("/opt/server-install/native_diagnostic.py", (Path(__file__).parent / "native_diagnostic.py").read_bytes(), "0644"))
            files.append(("/opt/server-install/core_pipe.py", (Path(__file__).parent / "core_pipe.py").read_bytes(), "0644"))
            files.append(("/opt/server-install/core_metadata.py", (Path(__file__).parent / "core_metadata.py").read_bytes(), "0644"))
        cloud = "#cloud-config\nusers:\n  - name: wmprobe\n    uid: 22020\n    lock_passwd: true\n    shell: /bin/sh\npackage_update: true\npackages:\n  - docker.io\n  - docker-compose-v2\n  - openssl\nwrite_files:\n"
        if options.native_diagnostic:
            cloud = cloud.replace("write_files:\n", "  - gdb\nwrite_files:\n")
        # Docker is prepared before the guest disables its outbound default route.
        cloud = cloud.replace("#cloud-config\n", '#cloud-config\napt:\n  conf: |\n    APT::Install-Recommends "false";\n    APT::Install-Suggests "false";\n', 1)
        for path, data, mode in files:
            cloud += f"  - path: {path}\n    encoding: b64\n    permissions: '{mode}'\n    content: {base64.b64encode(data).decode()}\n"
        cloud += "runcmd:\n  - [systemctl, daemon-reload]\n  - [systemctl, enable, server-install.service]\n  - [systemctl, start, --no-block, server-install.service]\n"
        (root / "user-data").write_text(cloud)
        (root / "meta-data").write_text("instance-id: server-product-" + options.arch + "\nlocal-hostname: server-product\n")
        seed = root / "seed.iso"
        execute(["genisoimage", "-quiet", "-output", str(seed), "-volid", "cidata", "-joliet", "-rock", str(root / "user-data"), str(root / "meta-data")])
        qmp = root / "qmp.sock"
        args = ["qemu-system-" + machine, "-accel", "tcg", "-m", "4096", "-smp", str(GUEST_VCPUS), "-display", "none",
                "-serial", "file:" + str(root / "serial.log"), "-qmp", "unix:" + str(qmp) + ",server=on,wait=off",
                "-netdev", "user,id=net0", "-device", "virtio-net-pci,netdev=net0"]
        if options.arch == "arm64":
            firmware = Path("/usr/share/AAVMF/AAVMF_CODE.fd")
            variables = root / "vars.fd"
            variables.write_bytes(Path("/usr/share/AAVMF/AAVMF_VARS.fd").read_bytes())
            result["firmwareSha256"] = sha(firmware)
            args += ["-machine", "virt", "-cpu", "max", "-drive", "if=pflash,format=raw,readonly=on,file=" + str(firmware),
                     "-drive", "if=pflash,format=raw,file=" + str(variables)]
        args += ["-drive", "if=virtio,format=qcow2,file=" + str(overlay), "-drive", "if=virtio,format=raw,readonly=on,file=" + str(seed)]
        result.update(imageSha256=expected, imageUrl=url, seedSha256=sha(seed), qemuCommand=args,
                      qemuVersion=execute([args[0], "--version"]).splitlines()[0])
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=(root / "qemu-stderr.log").open("w"))
        def read_qmp():
            channel = socket.socket(socket.AF_UNIX)
            for _ in range(100):
                try:
                    channel.connect(str(qmp))
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
                value = json.loads(line)
                if "event" in value:
                    events.append({"event": value["event"], "hostElapsed": time.monotonic() - began})
        threading.Thread(target=read_qmp, daemon=True).start()
        peak = 0
        while process.poll() is None:
            status = Path(f"/proc/{process.pid}/status")
            if status.exists():
                for line in status.read_text().splitlines():
                    if line.startswith("VmRSS:"):
                        peak = max(peak, int(line.split()[1]) * 1024)
            if time.monotonic() - began > 150 * 60:
                raise TimeoutError("product guest total budget reached")
            if any(r["phase"] == "failure" for r in receipts):
                raise RuntimeError("installed product assertion failed")
            time.sleep(1)
        if options.native_diagnostic:
            if process.returncode or not any(r["phase"] == "native-diagnostic" for r in receipts):
                raise RuntimeError("missing native diagnosis")
            result.update(status="diagnostic-only", qemuExitCode=process.returncode)
            raise RuntimeError("native diagnostic cannot satisfy product acceptance")
        before = [r for r in receipts if r["phase"] == "before-reboot"]
        after = [r for r in receipts if r["phase"] == "after-reboot"]
        if process.returncode or len(before) != 1 or len(after) != 1 or before[0]["bootId"] == after[0]["bootId"]:
            raise RuntimeError("missing full product reboot/exit evidence")
        if not any(e["event"] == "RESET" for e in events) or not any(e["event"] == "SHUTDOWN" for e in events):
            raise RuntimeError("missing QMP lifecycle")
        accepted = before[0].get("profiles", [])
        if (before[0].get("profilesRequested") != profiles or after[0].get("profilesRequested") != profiles
                or len(accepted) != len(profiles) or {entry.get("profile") for entry in accepted} != set(profiles)
                or any(entry.get("status") != "passed" for entry in accepted)):
            raise RuntimeError("missing supported profile acceptance")
        if after[0].get("restartedProfiles") != profiles or not complete_reboot_checks(after[0], profiles):
            raise RuntimeError("missing reboot recovery")
        result.update(status="passed", qemuExitCode=process.returncode, qemuPeakRssBytes=peak,
                      overlayAllocatedBytes=overlay.stat().st_blocks * 512, rebootSeconds=after[0]["hostElapsed"] - before[0]["hostElapsed"])
    except Exception as error:
        result.update(status="diagnostic-only" if options.native_diagnostic else "failed", errorType=type(error).__name__)
        raise
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        collector.shutdown()
        result.update(receipts=receipts, qmpEvents=events, endedUtc=time.time(), totalSeconds=time.monotonic() - began)
        (root / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"arch": options.arch, "status": result["status"]}), flush=True)


if __name__ == "__main__":
    main()
