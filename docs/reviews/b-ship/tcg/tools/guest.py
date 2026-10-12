"""研究夹具：真实 Secret Service 与完整 guest 重启；不是连接器安装验收。"""
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import time
import urllib.request

STATE = Path.home() / ".local/share/tcg-probe"
STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
MARKER = STATE / "state.json"


def command(args, *, data=None):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=120, check=True).stdout


def report(value):
    # 只发允许列出的诊断字段；秘密和解锁口令不进入输出。
    payload = json.dumps(value).encode()
    request = urllib.request.Request("http://10.0.2.2:18080/receipt", payload,
                                     {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError("receipt rejected")


def api(path, value):
    request = urllib.request.Request("http://10.0.2.2:18080/api/" + path,
                                     json.dumps(value).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def secret_owner():
    owner = command(["dbus-send", "--session", "--print-reply", "--dest=org.freedesktop.DBus",
                     "/org/freedesktop/DBus", "org.freedesktop.DBus.GetConnectionUnixProcessID",
                     "string:org.freedesktop.secrets"]).decode()
    service_pid = int(re.search(r"uint32\s+(\d+)", owner).group(1))
    service_exe = str((Path("/proc") / str(service_pid) / "exe").resolve())
    if not service_exe.endswith("/gnome-keyring-daemon"):
        raise RuntimeError("unexpected Secret Service owner")
    if (Path("/proc") / str(service_pid)).stat().st_uid != os.getuid():
        raise RuntimeError("Secret Service owner differs")
    return {"secretServiceExecutable": service_exe, "secretServiceUid": os.getuid()}


def main():
    command(["gnome-keyring-daemon", "--unlock", "--components=secrets"],
            data=b"tcg-research-fixture-only\n")
    common = {
        "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
        "uid": os.getuid(), "arch": os.uname().machine,
        "kernel": os.uname().release, "guestUtc": time.time(),
        "dbusSessionPresent": bool(os.environ.get("DBUS_SESSION_BUS_ADDRESS")),
        "secretBackend": "gnome-keyring/Secret Service",
    }
    if not MARKER.exists():
        secret = (json.dumps(api("start", {})).encode() if os.environ.get("TCG_API_PROBE") == "1"
                  else os.urandom(32).hex().encode())
        digest = hashlib.sha256(secret).hexdigest()
        command(["secret-tool", "store", "--label=TCG research fixture",
                 "application", "workmesh-tcg-research", "slot", "reboot"], data=secret)
        loaded = command(["secret-tool", "lookup", "application", "workmesh-tcg-research",
                          "slot", "reboot"]).strip()
        common.update(secret_owner())
        if hashlib.sha256(loaded).hexdigest() != digest:
            raise RuntimeError("first read mismatch")
        # 只持久化摘要和非秘密身份；不能把这个夹具当真实 pending/API 回执。
        state = {"digest": digest, "firstBootId": common["bootId"],
                 "identity": hashlib.sha256(os.urandom(32)).hexdigest(),
                 "originalUserAgent": "workmesh-tcg-research", "phase": "reboot"}
        MARKER.write_text(json.dumps(state))
        os.chmod(MARKER, 0o600)
        os.sync()
        report({**common, "phase": "before-reboot", "firstReadMatches": True,
                "persistentIdentity": state["identity"], "secretDigest": digest})
        return
    state = json.loads(MARKER.read_text())
    loaded = command(["secret-tool", "lookup", "application", "workmesh-tcg-research",
                      "slot", "reboot"]).strip()
    common.update(secret_owner())
    matches = hashlib.sha256(loaded).hexdigest() == state["digest"]
    changed = common["bootId"] != state["firstBootId"]
    replay = api("replay", json.loads(loaded)["request"]) if os.environ.get("TCG_API_PROBE") == "1" else None
    report({**common, "phase": "after-reboot", "secretMatches": matches,
            "bootIdChanged": changed, "persistentIdentity": state["identity"],
            "secretDigest": hashlib.sha256(loaded).hexdigest(), "apiReplay": replay})
    if not matches or not changed:
        raise RuntimeError("reboot invariant failed")
    state["phase"] = "complete"
    MARKER.write_text(json.dumps(state))
    command(["secret-tool", "clear", "application", "workmesh-tcg-research", "slot", "reboot"])
    os.sync()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # subprocess 的 stdout/stderr 可能含秘密；不打印 repr 或捕获输出。
        report({"phase": "failure", "errorType": type(error).__name__, "uid": os.getuid(),
                "failedCommand": Path(error.cmd[0]).name if isinstance(error, subprocess.CalledProcessError) else None})
        raise SystemExit(1)
