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
spec = importlib.util.spec_from_file_location("tcg_research_common", REPO / "docs/reviews/b-ship/tcg/tools/run.py")
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
sha, execute, IMAGES = common.sha, common.execute, common.IMAGES


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", choices=IMAGES, required=True)
    parser.add_argument("--artifacts", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--source", required=True)
    options = parser.parse_args()
    root = Path(options.root).resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    artifacts = Path(options.artifacts).resolve()
    manifest = json.loads((artifacts / "manifest.json").read_text())
    if manifest["arch"] != options.arch or manifest["sourceCommit"] != options.source:
        raise RuntimeError("artifact source/architecture mismatch")
    served = {"manifest.json", "install.sh", "SHA256SUMS", manifest["archive"]["name"]}
    served.update(f["path"] for f in manifest["installerFiles"])
    upgrade = artifacts.parent / "connector-upgrade"
    upgraded = json.loads((upgrade / "manifest.json").read_text())
    if upgraded["sourceCommit"] != options.source or upgraded["arch"] != options.arch or upgraded["connectorVersion"] == manifest["connectorVersion"]:
        raise RuntimeError("second version identity mismatch")
    served.update("upgrade/" + path for path in {"manifest.json", "install.sh", "SHA256SUMS", upgraded["archive"]["name"], *[f["path"] for f in upgraded["installerFiles"]]})
    receipts, events = [], []
    began = time.monotonic()
    result = {"sourceHead": options.source, "sourceTree": manifest["sourceTree"], "arch": options.arch,
              "manifestSha256": sha(artifacts / "manifest.json"), "archiveSha256": manifest["archive"]["sha256"], "upgradeManifestSha256": sha(upgrade / "manifest.json"),
              "accelerator": "tcg", "guestRamMiB": 1536, "guestVcpus": 2,
              "scripts": {p.name: sha(p) for p in Path(__file__).parent.glob("*.py")},
              "startedUtc": time.time(), "status": "running"}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = self.path.removeprefix("/distribution/")
            if not self.path.startswith("/distribution/") or path not in served:
                self.send_error(404)
                return
            source_path = upgrade / path.removeprefix("upgrade/") if path.startswith("upgrade/") else artifacts / path
            self.send_response(200)
            self.send_header("Content-Length", str(source_path.stat().st_size))
            self.end_headers()
            with source_path.open("rb") as source:
                while block := source.read(1024 * 1024):
                    self.wfile.write(block)

        def do_POST(self):
            size = int(self.headers.get("Content-Length", "0"))
            if self.path != "/receipt" or size > 32768:
                self.send_error(400)
                return
            value = json.loads(self.rfile.read(size))
            if not isinstance(value, dict) or value.get("phase") not in {"before-reboot", "after-reboot", "failure"}:
                self.send_error(400)
                return
            if __import__("re").search(r"wm[ip]_[A-Za-z0-9_-]{43}", json.dumps(value)):
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
        execute(["qemu-img", "create", "-f", "qcow2", "-F", "qcow2", "-b", str(image), str(overlay), "12G"])
        guest = (Path(__file__).parent / "guest.py").read_bytes()
        wrapper = b'''#!/bin/sh
set -eu
phase=prepare
trap 'status=$?; if test "$status" -ne 0; then python3 /opt/connector-install/failure.py "$status" "$phase"; fi' EXIT
if test ! -f /home/wmprobe/.local/share/connector-install/state.json; then
  runuser -u wmprobe -- python3 /opt/connector-install/guest.py --prepare
  phase=offline-install
  unshare --net -- runuser -u wmprobe -- sh -c '
    set -eu
    test "$(wc -l < /proc/net/route)" -eq 1
    dist="$HOME/.local/share/connector-install/distribution"
    for archive in "$dist"/*.tar.gz; do
      sh "$dist/install.sh" --archive "$archive" --manifest "$dist/manifest.json" --prefix "$HOME/.local" --dry-run
      test ! -e "$HOME/.local/bin/workmesh-connector"
      sh "$dist/install.sh" --archive "$archive" --manifest "$dist/manifest.json" --prefix "$HOME/.local"
    done
    printf "PRIVATE_NETWORK_NAMESPACE_NO_ROUTE_DRY_RUN_AND_INSTALL_PASSED\\n" > "$HOME/.local/share/connector-install/offline-proof"
  '
fi
phase=installed-driver
runuser -u wmprobe -- dbus-run-session -- python3 /opt/connector-install/guest.py
if grep -q '"phase": "reboot"' /home/wmprobe/.local/share/connector-install/state.json; then
  systemctl --no-block reboot
else
  systemctl --no-block poweroff
fi
'''
        service = b'''[Unit]
Description=WorkMesh installed product acceptance
After=cloud-final.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
StandardOutput=journal+console
StandardError=journal+console
ExecStart=/opt/connector-install/finish.sh
TimeoutStartSec=1200
[Install]
WantedBy=cloud-init.target
'''
        failure = b'import json, re, subprocess, sys, urllib.request\ntext = subprocess.run(["journalctl", "-b", "--unit=connector-install.service", "--no-pager", "--output=cat"], capture_output=True).stdout.decode(errors="replace")\ncodes = sorted(set(re.findall(r"\\b(?:INSTALL|CONNECTOR)_[A-Z_]+\\b", text)))\nsignatures = [name for name in ["Illegal instruction", "Killed", "Permission denied", "not found", "cannot find", "cannot change"] if name in text]\nvalue = {"phase":"failure","errorType":"GuestServiceFailure","exitCode":int(sys.argv[1]),"stage":sys.argv[2],"codes":codes,"signatures":signatures}\nrequest = urllib.request.Request("http://10.0.2.2:18080/receipt", json.dumps(value).encode(), {"Content-Type":"application/json"})\nurllib.request.urlopen(request, timeout=30).read()\n'
        files = [("/opt/connector-install/failure.py", failure, "0644"), ("/opt/connector-install/guest.py", guest, "0644"), ("/opt/connector-install/finish.sh", wrapper, "0755"),
                 ("/etc/systemd/system/connector-install.service", service, "0644")]
        cloud = "#cloud-config\nusers:\n  - name: wmprobe\n    uid: 22020\n    lock_passwd: true\n    shell: /bin/sh\npackage_update: true\npackages:\n  - dbus\n  - gnome-keyring\n  - libsecret-tools\nwrite_files:\n"
        for path, data, mode in files:
            cloud += f"  - path: {path}\n    encoding: b64\n    permissions: '{mode}'\n    content: {base64.b64encode(data).decode()}\n"
        cloud += "runcmd:\n  - [systemctl, daemon-reload]\n  - [systemctl, enable, connector-install.service]\n  - [systemctl, start, --no-block, connector-install.service]\n"
        (root / "user-data").write_text(cloud)
        (root / "meta-data").write_text("instance-id: connector-product-" + options.arch + "\nlocal-hostname: connector-product\n")
        seed = root / "seed.iso"
        execute(["genisoimage", "-quiet", "-output", str(seed), "-volid", "cidata", "-joliet", "-rock", str(root / "user-data"), str(root / "meta-data")])
        qmp = root / "qmp.sock"
        args = ["qemu-system-" + machine, "-accel", "tcg", "-m", "1536", "-smp", "2", "-display", "none",
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
            if time.monotonic() - began > 80 * 60:
                raise TimeoutError("product guest total budget reached")
            if any(r["phase"] == "failure" for r in receipts):
                raise RuntimeError("installed product assertion failed")
            time.sleep(1)
        before = [r for r in receipts if r["phase"] == "before-reboot"]
        after = [r for r in receipts if r["phase"] == "after-reboot"]
        if process.returncode or len(before) != 1 or len(after) != 1 or before[0]["bootId"] == after[0]["bootId"]:
            raise RuntimeError("missing full product reboot/exit evidence")
        if not any(e["event"] == "RESET" for e in events) or not any(e["event"] == "SHUTDOWN" for e in events):
            raise RuntimeError("missing QMP lifecycle")
        replay = after[0]["replay"]
        if not replay["exactRequestMatches"] or not replay["sameResponse"] or replay["originalWindowSeconds"] != 900 or not replay["replay"]["encrypted"] or replay["replay"]["remaining"] <= 0:
            raise RuntimeError("original replay contract not proved")
        result.update(status="passed", qemuExitCode=process.returncode, qemuPeakRssBytes=peak,
                      overlayAllocatedBytes=overlay.stat().st_blocks * 512, rebootSeconds=after[0]["hostElapsed"] - before[0]["hostElapsed"])
    except Exception as error:
        result.update(status="failed", errorType=type(error).__name__)
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
