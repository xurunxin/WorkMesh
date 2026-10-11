"""构建四个真实开发镜像；使用独有 builder，保留原始日志并定向收尾。"""
import hashlib
import argparse
import json
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output-root", type=Path, default=Path("ci-logs/development-images"))
ROOT = parser.parse_args().output_root.resolve()
ROOT.mkdir(parents=True, exist_ok=True)
owner = "wm-connector-dev-" + uuid.uuid4().hex[:12]
directory = ROOT / owner
directory.mkdir()


def command(args):
    return subprocess.run(args, capture_output=True, check=True).stdout


def save(name, value):
    (directory / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


source_tree = command(["git", "write-tree"]).decode().strip()
head = command(["git", "rev-parse", "HEAD"]).decode().strip()
targets = ["api", "web", "worker", "mcp"]
tags = {name: owner + ":" + name for name in targets}
baseline = {
    "images": command(["docker", "image", "ls", "--no-trunc", "--format", "{{json .}}"] ).decode(),
    "containers": command(["docker", "ps", "-a", "--no-trunc", "--format", "{{json .}}"] ).decode(),
    "volumes": command(["docker", "volume", "ls", "--format", "{{json .}}"] ).decode(),
}
save("registration.json", {"owner": owner, "registeredAt": datetime.now(timezone.utc).isoformat(),
     "head": head, "indexTree": source_tree, "builder": owner, "tags": tags,
     "context": "git archive准确index tree，二进制管道传入Docker；全部已跟踪文件，排除未跟踪本机环境/秘密，不创建额外工作树或上下文目录",
     "dockerVersion": command(["docker", "version"]).decode(), "baseline": baseline})
results = []
cleanup = []
created = False
failed = False
try:
    command(["docker", "buildx", "create", "--name", owner, "--driver", "docker-container"])
    created = True
    for name in targets:
        args = ["docker", "buildx", "build", "--builder", owner, "--platform", "linux/amd64",
                "--progress=plain", "--load", "--label", "com.workmesh.validation.owner=" + owner,
                "--label", "com.workmesh.validation.index-tree=" + source_tree,
                "--tag", tags[name], "--file", "infra/docker/" + name + ".Dockerfile", "-"]
        log_path = directory / (name + ".log")
        with log_path.open("wb") as log:
            archive = subprocess.Popen(["git", "archive", "--format=tar", source_tree], stdout=subprocess.PIPE, stderr=log)
            build = subprocess.Popen(args, stdin=archive.stdout, stdout=log, stderr=subprocess.STDOUT)
            archive.stdout.close()
            build_code = build.wait()
            archive_code = archive.wait()
        raw = log_path.read_bytes()
        hook_lines = [line for line in raw.decode("utf8", errors="replace").splitlines()
                      if "apps/connector postinstall" in line]
        row = {"name": name, "command": args, "buildExit": build_code, "archiveExit": archive_code,
               "log": log_path.name, "logBytes": len(raw), "logSha256": hashlib.sha256(raw).hexdigest(),
               "postinstallLines": hook_lines}
        if build_code == 0 and archive_code == 0:
            image = json.loads(command(["docker", "image", "inspect", tags[name]]))[0]
            assert image["Config"]["Labels"]["com.workmesh.validation.owner"] == owner
            row.update({"imageId": image["Id"], "user": image["Config"]["User"], "cmd": image["Config"]["Cmd"]})
            row["normalPostinstallVerified"] = any("node scripts/prepare-native.mjs" in line for line in hook_lines) and any("Done" in line for line in hook_lines)
            failed = not row["normalPostinstallVerified"]
        else:
            failed = True
        results.append(row)
        save("builds.json", {"head": head, "indexTree": source_tree, "results": results})
        print(json.dumps({"name": name, "buildExit": build_code, "archiveExit": archive_code,
                          "normalPostinstallVerified": row.get("normalPostinstallVerified", False)}), flush=True)
        if failed:
            break
finally:
    for name, tag in tags.items():
        inspect = subprocess.run(["docker", "image", "inspect", tag], capture_output=True)
        if inspect.returncode:
            cleanup.append({"tag": tag, "state": "absent"})
            continue
        image = json.loads(inspect.stdout)[0]
        expected = next((row.get("imageId") for row in results if row["name"] == name), None)
        if image["Config"]["Labels"].get("com.workmesh.validation.owner") != owner or image["Id"] != expected:
            cleanup.append({"tag": tag, "state": "identity_mismatch_retained"})
            failed = True
            continue
        result = subprocess.run(["docker", "image", "rm", tag], capture_output=True)
        cleanup.append({"tag": tag, "imageId": image["Id"], "exit": result.returncode,
                        "output": (result.stdout + result.stderr).decode("utf8", errors="replace")})
        failed = failed or result.returncode != 0
    if created:
        container_name = "buildx_buildkit_" + owner + "0"
        inspect = subprocess.run(["docker", "inspect", container_name], capture_output=True)
        if inspect.returncode == 0:
            save("builder-before-cleanup.json", json.loads(inspect.stdout))
        result = subprocess.run(["docker", "buildx", "rm", owner], capture_output=True)
        cleanup.append({"builder": owner, "exit": result.returncode,
                        "output": (result.stdout + result.stderr).decode("utf8", errors="replace")})
        failed = failed or result.returncode != 0
        for kind, name in [("container", container_name), ("volume", container_name + "_state")]:
            result = subprocess.run(["docker", kind, "inspect", name], capture_output=True)
            absent = result.returncode != 0 and b"no such" in result.stderr.lower()
            cleanup.append({"kind": kind, "name": name, "absent": absent,
                            "output": result.stderr.decode("utf8", errors="replace")})
            failed = failed or not absent
    save("cleanup.json", {"owner": owner, "results": cleanup,
         "retained": "已有资源与共享node/buildkit基础镜像不删除；只移除准确本任务标签与builder自有缓存/卷，不做全局prune"})
save("result.json", {"owner": owner, "passed": not failed and len(results) == 4,
                     "head": head, "indexTree": source_tree, "buildCount": len(results)})
raise SystemExit(1 if failed or len(results) != 4 else 0)
