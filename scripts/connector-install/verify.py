"""Independently verify an archived installed-product receipt against Git blobs."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def verify(path, expected_sha, head, arch, run, full_source=False):
    require(re.fullmatch(r"[a-f0-9]{40}", head), "invalid expected commit")
    require(sha(path.read_bytes()) == expected_sha, "provider archive digest differs")
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), "duplicate archive members")
        for name in names:
            require(not name.startswith("/") and ".." not in name.split("/"), "unsafe member")
            require(not re.search(rb"wm[ip]_[A-Za-z0-9_-]{43}", archive.read(name)), "credential in evidence")
        def read(suffix):
            matched = [name for name in names if name.endswith(suffix)]
            require(len(matched) == 1, "missing or ambiguous " + suffix)
            return archive.read(matched[0])
        result = json.loads(read("connector-install/receipts/result.json"))
        manifest_bytes = read("connector-install/receipts/manifest.json")
        manifest = json.loads(manifest_bytes)
        tree = subprocess.check_output(["git", "rev-parse", head + "^{tree}"], text=True).strip()
        require(read("connector-install/source.txt").decode().split()[:2] == [head, tree], "checkout binding differs")
        if full_source:
            require(read("connector-install/source-commit.txt") == subprocess.check_output(["git", "cat-file", "commit", head]), "raw commit/parents differ")
            before_source = json.loads(read("connector-source-before.json"))
            after_source = json.loads(read("connector-source-after.json"))
            for source in [before_source, after_source]:
                require(source["head"] == head and source["tree"] == tree and source["sameHead"] and not source["mismatches"] and not source["changed"] and not source["removed"], "complete source changed")
                require(str(source["runId"]) == str(run) and str(source["runAttempt"]) == "1", "source witness run differs")
            require(before_source["files"] == after_source["files"], "source bytes changed during guest")
        require(read("connector-install/run.txt").decode().split() == [str(run), "1", {"amd64": "X64", "arm64": "ARM64"}[arch]], "run binding differs")
        for line in read("connector-install/input-sha256.txt").decode().splitlines():
            digest, filename = line.split("  ", 1)
            require(sha(subprocess.check_output(["git", "show", head + ":" + filename])) == digest, "input differs: " + filename)
        for filename, digest in result["scripts"].items():
            require(sha(subprocess.check_output(["git", "show", head + ":scripts/connector-install/" + filename])) == digest, "guest input differs")
        require(result["sourceHead"] == manifest["sourceCommit"] == head, "source differs")
        require(result["sourceTree"] == manifest["sourceTree"] == tree, "tree differs")
        require(result["arch"] == manifest["arch"] == arch, "architecture differs")
        require(manifest["lockSha256"] == sha(subprocess.check_output(["git", "show", head + ":pnpm-lock.yaml"])), "lock binding differs")
        require(manifest["publicKeySha256"] == sha(subprocess.check_output(["git", "show", head + ":apps/connector/assets/workmesh-public-key.pem"])), "trusted public key differs")
        require(manifest["nodeVersion"] == subprocess.check_output(["git", "show", head + ":.node-version"], text=True).strip(), "runtime binding differs")
        require(sha(manifest_bytes) == result["manifestSha256"], "manifest digest differs")
        require(result["archiveSha256"] == manifest["archive"]["sha256"], "payload digest differs")
        require(result["status"] == "passed" and result["accelerator"] == "tcg" and result["qemuExitCode"] == 0, "guest did not pass")
        require(len(re.findall(rb"Linux version ", read("connector-install/receipts/serial.log"))) == 2, "two kernel boots missing")
        require({"RESET", "SHUTDOWN"}.issubset({event["event"] for event in result["qmpEvents"]}), "QMP reset/shutdown missing")
        receipts = result["receipts"]
        require(len(receipts) == 2, "unexpected receipts")
        before, after = receipts
        require(before["phase"] == "before-reboot" and after["phase"] == "after-reboot" and before["bootId"] != after["bootId"], "full OS reboot missing")
        for receipt in receipts:
            require(receipt["uid"] == receipt["secretServiceUid"] == 22020 and receipt["secretServiceExecutable"] == "/usr/bin/gnome-keyring-daemon", "real same-user Secret Service missing")
        require({"no-source-or-node", "offline-installer", "dry-run-zero-entry", "version-binding", "native-pty", "full-api-mcp-signed-skill-golden", "real-transaction-rollback-and-same-pending-retry", "concurrent-installed-processes-one-pending-one-credential", "second-version-and-existing-secret", "rollback-retains-exact-pending"}.issubset(before["checks"]), "installed golden/upgrade checks missing")
        require({"system-store-across-full-reboot", "same-pending-after-api-mcp-and-os-restart", "revocation-rejected", "expired-original-replay-rejected", "uninstall-config-and-real-secret-retained"}.issubset(after["checks"]), "recovery/uninstall checks missing")
        replay = after["replay"]
        require(replay["exactRequestMatches"] and replay["sameResponse"] and replay["credentialCount"] == 1 and replay["requestCount"] == 2, "exact replay not proved")
        require(replay["originalWindowSeconds"] == replay["replay"]["seconds"] == 900 and replay["replay"]["encrypted"] and replay["replay"]["remaining"] > 0, "original recovery window not proved")
        return {"arch": arch, "sourceHead": head, "run": run, "status": "verified", "totalSeconds": result["totalSeconds"], "rebootSeconds": result["rebootSeconds"], "remainingSeconds": replay["replay"]["remaining"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--arch", choices=["amd64", "arm64"], required=True)
    parser.add_argument("--run", type=int, required=True)
    parser.add_argument("--require-full-source", action="store_true")
    options = parser.parse_args()
    print(json.dumps(verify(options.archive, options.sha256, options.head, options.arch, options.run, options.require_full_source)))
