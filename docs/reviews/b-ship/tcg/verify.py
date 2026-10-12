"""从原始回执复核 TCG 重启与加密重放，不信任单个 passed 字段。"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive")
    parser.add_argument("--head", required=True)
    parser.add_argument("--run", required=True)
    parser.add_argument("--arch", required=True, choices=["amd64", "arm64"])
    parser.add_argument("--require-api", action="store_true")
    args = parser.parse_args()
    with zipfile.ZipFile(args.archive) as archive:
        members = archive.namelist()
        if len(members) != len(set(members)) or any(name.startswith("/") or ".." in name.split("/") for name in members):
            raise ValueError("unsafe archive members")
        def read(suffix):
            names = [name for name in members if name.endswith(suffix)]
            if len(names) != 1:
                raise ValueError("missing or duplicate " + suffix)
            return archive.read(names[0])
        result = json.loads(read("result.json"))
        source = read("source.txt").decode().split()
        run = read("run.txt").decode().split()
        assert source[0] == args.head == result["sourceHead"]
        assert run[0] == args.run and run[1] == "1"
        assert result["status"] == "passed" and result["accelerator"] == "tcg"
        assert result["arch"] == args.arch
        inputs = dict(line.split(maxsplit=1) for line in read("input-sha256.txt").decode().splitlines())
        by_name = {Path(path.strip()).name: digest for digest, path in inputs.items()}
        for name, digest in result["scripts"].items():
            assert by_name[name] == digest
        before, after = result["receipts"]
        assert before["phase"] == "before-reboot" and after["phase"] == "after-reboot"
        assert before["bootId"] != after["bootId"] and after["bootIdChanged"] is True
        assert before["uid"] == after["uid"] == 22020
        assert before["arch"] == after["arch"] == {"amd64": "x86_64", "arm64": "aarch64"}[args.arch]
        assert before["dbusSessionPresent"] and after["dbusSessionPresent"]
        assert before["persistentIdentity"] == after["persistentIdentity"]
        assert before["secretDigest"] == after["secretDigest"]
        assert before["firstReadMatches"] and after["secretMatches"]
        elapsed = after["hostElapsed"] - before["hostElapsed"]
        assert 0 < elapsed < 900 and abs(elapsed - result["rebootSeconds"]) < 0.01
        assert any(event["event"] == "RESET" and before["hostElapsed"] < event["hostElapsed"] < after["hostElapsed"] for event in result["qmpEvents"])
        assert any(event["event"] == "SHUTDOWN" for event in result["qmpEvents"])
        serial = read("serial.log")
        assert serial.count(b"Linux version ") >= 2
        if args.require_api:
            for receipt in (before, after):
                assert receipt["secretServiceExecutable"] == "/usr/bin/gnome-keyring-daemon"
                assert receipt["secretServiceUid"] == 22020
            api = json.loads(read("api-receipt.json"))
            first, replay = api
            assert first["encrypted"] and first["windowSeconds"] == 900
            assert replay["exactRequestMatches"] and replay["replayResponseMatches"]
            assert replay["replayStatus"] == 200 and replay["expiredStatus"] == 409
            assert replay["remainingSeconds"] > 0 and replay["expiryMethod"] == "dedicated-test-row-expired"
            assert result["realApiReplay"] == after["apiReplay"]
        assert result["sourceConnectorConsumer"] == "not-tested"
        assert result["finalNoSourceInstallation"] == "not-tested"
        for name in members:
            if not name.endswith("/"):
                assert not re.search(rb"wm[ipt]_[A-Za-z0-9_-]{32,}", archive.read(name)), "secret-shaped bytes: " + name
        print(json.dumps({"head": args.head, "run": args.run, "arch": args.arch,
                          "archiveSha256": hashlib.sha256(Path(args.archive).read_bytes()).hexdigest(),
                          "rebootSeconds": elapsed, "apiChecked": args.require_api, "status": "passed"}))


if __name__ == "__main__":
    main()
