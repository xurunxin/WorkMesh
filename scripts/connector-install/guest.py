"""Guest driver: no WorkMesh source or host Node; all assertions use installed SEA."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import subprocess
import threading
import time
import urllib.request

STATE = Path.home() / ".local/share/connector-install"
STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
MARKER = STATE / "state.json"
PREFIX = Path.home() / ".local"
BINARY = PREFIX / "bin/workmesh-connector"
checks = []


def request(path, value):
    data = json.dumps(value).encode()
    req = urllib.request.Request("http://127.0.0.1:18081/fixture/" + path, data, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def report(value):
    data = json.dumps(value).encode()
    if re.search(rb"wm[ip]_[A-Za-z0-9_-]{43}", data):
        raise RuntimeError("unsafe receipt")
    req = urllib.request.Request("http://10.0.2.2:18080/receipt", data, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError("receipt rejected")


def command(args, data=None, env=None, expected=0):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=150, env=env)
    if re.search(rb"wm[ip]_[A-Za-z0-9_-]{43}", result.stdout + result.stderr):
        raise RuntimeError("secret in process output")
    if result.returncode != expected:
        raise RuntimeError("installed command failed")
    return result


def private(path, value):
    with path.open("x") as file:
        os.chmod(path, 0o600)
        json.dump(value, file)


def connect(fixture, directory, expected=0):
    config = STATE / (fixture["expectation"]["connectionId"] + ".json")
    if not config.exists():
        private(config, fixture["expectation"])
    env = dict(os.environ, WORKMESH_CONNECTOR_DIRECTORY=str(directory))
    return command([str(BINARY), "connect", "--expect", str(config)], (fixture["pairingCode"] + "\n").encode(), env, expected)


def run_client(directory, terminal=False):
    env = dict(os.environ, WORKMESH_CONNECTOR_DIRECTORY=str(directory))
    args = [str(BINARY), "run", "--", "/bin/sh", str(STATE / "client.sh")]
    if not terminal:
        output = command(args, env=env).stdout
    else:
        master, slave = pty.openpty()
        process = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, env=env)
        os.close(slave)
        output = b""
        deadline = time.monotonic() + 150
        try:
            while process.poll() is None:
                if time.monotonic() > deadline:
                    process.terminate()
                    raise RuntimeError("PTY deadline")
                if select.select([master], [], [], 1)[0]:
                    try:
                        output += os.read(master, 65536)
                    except OSError:
                        break
            if process.wait(timeout=10) != 0:
                raise RuntimeError("PTY child failed")
            try:
                while select.select([master], [], [], 0.1)[0]:
                    output += os.read(master, 65536)
            except OSError:
                pass
        finally:
            os.close(master)
        if re.search(rb"wm[ip]_[A-Za-z0-9_-]{43}", output):
            raise RuntimeError("PTY secret leak")
    if "[已隐藏]".encode() not in output or b"CLIENT_OK" not in output:
        raise RuntimeError("token injection/redaction absent")
    checks.append("native-pty" if terminal else "native-store-and-pipe")


def proxy():
    class Forwarder(BaseHTTPRequestHandler):
        def route(self):
            import http.client
            connection = http.client.HTTPConnection("10.0.2.2", 18081, timeout=120)
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size) if size else None
            try:
                connection.request(self.command, self.path, body, dict(self.headers))
                response = connection.getresponse()
                content = response.read()
                self.send_response(response.status)
                for name, value in response.getheaders():
                    if name.lower() not in {"connection", "transfer-encoding", "content-length"}:
                        self.send_header(name, value)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception:
                self.connection.close()
            finally:
                connection.close()
        do_GET = do_POST = do_DELETE = route
        def log_message(self, *_):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", 18081), Forwarder)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def prepare():
    distribution = STATE / "distribution"
    distribution.mkdir(mode=0o700)
    def download(path):
        target = distribution / path
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with urllib.request.urlopen("http://10.0.2.2:18080/distribution/" + path, timeout=180) as response:
            with target.open("wb") as file:
                shutil.copyfileobj(response, file)
        os.chmod(target, 0o600)
    download("manifest.json")
    manifest = json.loads((distribution / "manifest.json").read_text())
    for path in ["install.sh", "SHA256SUMS", manifest["archive"]["name"], *[f["path"] for f in manifest["installerFiles"]]]:
        download(path)
    for f in manifest["installerFiles"]:
        os.chmod(distribution / f["path"], f["mode"])


def main():
    if "--prepare" in __import__("sys").argv:
        prepare()
        return
    if os.getuid() != 22020:
        raise RuntimeError("unexpected UID")
    for name in ["node", "pnpm", "tsx", "node-gyp"]:
        if shutil.which(name):
            raise RuntimeError("source tool visible")
    for path in ["/repo", "/workspace", "/workmesh", "/root/node_modules"]:
        if Path(path).exists():
            raise RuntimeError("source mount visible")
    proxy()
    # Test-only keyring password, stdin only. The product never unlocks the service.
    subprocess.run(["gnome-keyring-daemon", "--unlock", "--components=secrets"], input=b"connector-install-test-only\n",
                   capture_output=True, check=True, timeout=120)
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    if not MARKER.exists():
        distribution = STATE / "distribution"
        manifest = json.loads((distribution / "manifest.json").read_text())
        if (STATE / "offline-proof").read_text().strip() != "PRIVATE_NETWORK_NAMESPACE_NO_ROUTE_DRY_RUN_AND_INSTALL_PASSED":
            raise RuntimeError("offline install proof missing")
        metadata = json.loads(command([str(BINARY), "--version"]).stdout)
        if metadata["sourceCommit"] != manifest["sourceCommit"] or metadata["arch"] != manifest["arch"]:
            raise RuntimeError("installed source mismatch")
        checks.extend(["no-source-or-node", "offline-installer", "dry-run-zero-entry", "version-binding"])
        (STATE / "client.sh").write_text('''#!/bin/sh
set -eu
test -n "$WORKMESH_INSTALLATION_TOKEN"
printf '\033[31m%s\033[0m\n' "$WORKMESH_INSTALLATION_TOKEN"
printf 'CLIENT_OK\n'
''')
        os.chmod(STATE / "client.sh", 0o700)
        golden = request("create", {})
        directory = STATE / "golden"
        connect(golden, directory)
        run_client(directory)
        run_client(directory, terminal=True)
        config = (directory / "config.json").read_bytes()
        if golden["pairingCode"].encode() in config or b"wmi_" in config or (directory / "pending.json").exists():
            raise RuntimeError("configuration secret boundary")
        checks.append("full-api-mcp-signed-skill-golden")
        failed = request("create", {"mode": "fingerprint"})
        failed_dir = STATE / "fingerprint"
        failure = connect(failed, failed_dir, expected=1)
        if b"CONNECTOR_FINGERPRINT_MISMATCH" not in failure.stderr or (failed_dir / "config.json").exists():
            raise RuntimeError("fingerprint rejection")
        broken_env = dict(os.environ, WORKMESH_CONNECTOR_DIRECTORY=str(directory), DBUS_SESSION_BUS_ADDRESS="unix:path=/missing-secret-service")
        failure = command([str(BINARY), "run", "--", "/bin/true"], env=broken_env, expected=1)
        if b"CONNECTOR_SECRET_STORE_UNAVAILABLE" not in failure.stderr:
            raise RuntimeError("store fail closed")
        checks.extend(["fingerprint-zero-config", "store-fail-closed"])
        lost = request("create", {"mode": "lost"})
        recovery_dir = STATE / "recovery"
        connect(lost, recovery_dir, expected=1)
        pending = json.loads((recovery_dir / "pending.json").read_text())
        if pending["userAgent"] != "workmesh-connector/0.1.0" or (recovery_dir / "config.json").exists():
            raise RuntimeError("pending identity")
        request("restart", {"connectionId": lost["expectation"]["connectionId"]})
        private(MARKER, {"phase": "reboot", "bootId": boot, "recoveryConnectionId": lost["expectation"]["connectionId"],
                         "goldenConfigSha256": hashlib.sha256(config).hexdigest(), "checks": checks,
                         "pendingSha256": hashlib.sha256((recovery_dir / "pending.json").read_bytes()).hexdigest()})
        report({"phase": "before-reboot", "bootId": boot, "uid": os.getuid(), "checks": checks, "metadata": metadata})
    else:
        state = json.loads(MARKER.read_text())
        if state["phase"] != "reboot" or state["bootId"] == boot:
            raise RuntimeError("OS did not reboot")
        run_client(STATE / "golden")
        config = (STATE / "golden/config.json").read_bytes()
        if hashlib.sha256(config).hexdigest() != state["goldenConfigSha256"]:
            raise RuntimeError("config changed across reboot")
        directory = STATE / "recovery"
        raw = (directory / "pending.json").read_bytes()
        if hashlib.sha256(raw).hexdigest() != state["pendingSha256"]:
            raise RuntimeError("pending changed across reboot")
        pending = json.loads(raw)
        fixture = {"expectation": json.loads((STATE / (state["recoveryConnectionId"] + ".json")).read_text()),
                   "pairingCode": json.loads(pending["body"])["pairingCode"]}
        connect(fixture, directory)
        replay = request("status", {"connectionId": state["recoveryConnectionId"]})
        run_client(directory)
        request("revoke", {"connectionId": state["recoveryConnectionId"]})
        connect(fixture, directory, expected=1)
        before = config
        command(["sh", str(PREFIX / "lib/workmesh-connector/current/uninstall.sh"), "--prefix", str(PREFIX)])
        if BINARY.exists() or (STATE / "golden/config.json").read_bytes() != before:
            raise RuntimeError("uninstall boundary")
        report({"phase": "after-reboot", "bootId": boot, "uid": os.getuid(), "replay": replay,
                "checks": checks + ["system-store-across-full-reboot", "same-pending-after-api-mcp-and-os-restart", "revocation-rejected", "uninstall-config-retained"]})
        state["phase"] = "complete"
        MARKER.write_text(json.dumps(state))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        report({"phase": "failure", "errorType": type(error).__name__, "checks": checks})
        raise SystemExit(1)
