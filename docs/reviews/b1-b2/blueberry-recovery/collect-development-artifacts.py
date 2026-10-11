"""读取准确CI的开发镜像原件，逐字节核日志、正常安装钩子、镜像与清理。"""
import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

run_id, capture, source_head = sys.argv[1:4]
if not run_id.isdigit() or not re.fullmatch(r"ci\d+-development-artifacts", capture) or not re.fullmatch(r"[a-f0-9]{40}", source_head):
    raise ValueError("需要准确run、独有目录和完整源提交")
root = Path(__file__).resolve().parent / capture
root.mkdir(exist_ok=False)


def api(path):
    return subprocess.run(["gh", "api", "repos/xurunxin/WorkMesh/" + path], capture_output=True, check=True).stdout


run = json.loads(api("actions/runs/" + run_id))
if run["head_sha"] != source_head:
    raise RuntimeError("run不属于准确源提交")
artifacts = json.loads(api("actions/runs/" + run_id + "/artifacts?per_page=100"))["artifacts"]
selected = [item for item in artifacts if item["name"].startswith("source-gates-raw-")]
if len(selected) != 1:
    raise RuntimeError("缺唯一Source gates原件")
artifact = selected[0]
raw = api(f"actions/artifacts/{artifact['id']}/zip")
archive = zipfile.ZipFile(io.BytesIO(raw))
registrations = [name for name in archive.namelist() if re.fullmatch(r"development-images/wm-connector-dev-[a-f0-9]{12}/registration.json", name)]
if len(registrations) != 1:
    raise RuntimeError("缺唯一真实构建登记")
prefix = registrations[0].rsplit("/", 1)[0]
owner = prefix.split("/")[-1]
files = []
objects = {}
for filename in ["registration.json", "builds.json", "builder-before-cleanup.json", "cleanup.json", "result.json", "api.log", "web.log", "worker.log", "mcp.log"]:
    member = prefix + "/" + filename
    if filename.endswith(".log") and member not in archive.namelist():
        continue
    if archive.namelist().count(member) != 1:
        raise RuntimeError("缺真实原件或重复：" + member)
    data = archive.read(member)
    if re.search(rb"\bwm[a-z]_[A-Za-z0-9_-]{43,}", data):
        raise RuntimeError("凭据形态拒绝保存")
    (root / filename).write_bytes(data)
    files.append({"member": member, "path": filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    objects[filename] = json.loads(data) if filename.endswith(".json") else data
registration, builds, cleanup, result = [objects[name + ".json"] for name in ["registration", "builds", "cleanup", "result"]]
tree = subprocess.run(["git", "rev-parse", source_head + "^{tree}"], capture_output=True, check=True).stdout.decode().strip()
checkout = json.loads(api("git/commits/" + registration["head"]))
if registration["indexTree"] != tree or checkout["tree"]["sha"] != tree or source_head not in [checkout["sha"], *[p["sha"] for p in checkout["parents"]]]:
    raise RuntimeError("实际构建上下文不属于准确源提交")
if not result["passed"]:
    receipt = {"runId": int(run_id), "sourceHead": source_head, "checkout": registration["head"], "tree": tree,
               "artifactId": artifact["id"], "artifactName": artifact["name"], "archiveBytes": len(raw), "archiveSha256": hashlib.sha256(raw).hexdigest(),
               "owner": owner, "files": files, "verified": False, "buildResult": result,
               "source": "真实失败原件按原字节保全；缺失镜像日志是未运行，不表示通过；完整ZIP仅在内存读取并保摘要"}
    (root / "receipt.json").write_bytes((json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode())
    print(json.dumps({"runId": int(run_id), "sourceHead": source_head, "owner": owner, "failedEvidenceCaptured": True, "fourBuildsAndCleanupVerified": False}))
    raise SystemExit(0)
if registration["owner"] != owner or result["owner"] != owner or cleanup["owner"] != owner or not result["passed"] or result["buildCount"] != 4:
    raise RuntimeError("构建或清理未完整通过")
if builds["indexTree"] != tree or result["indexTree"] != tree or builds["head"] != registration["head"] or result["head"] != registration["head"]:
    raise RuntimeError("构建来源不一致")
rows = builds["results"]
if [row["name"] for row in rows] != ["api", "web", "worker", "mcp"]:
    raise RuntimeError("缺四个完整镜像")
for row in rows:
    log = objects[row["name"] + ".log"]
    expected_command = ["docker", "buildx", "build", "--builder", owner, "--platform", "linux/amd64",
                        "--progress=plain", "--no-cache", "--load", "--label", "com.workmesh.validation.owner=" + owner,
                        "--label", "com.workmesh.validation.index-tree=" + tree,
                        "--tag", owner + ":" + row["name"], "--file", "infra/docker/" + row["name"] + ".Dockerfile", "-"]
    if row["command"] != expected_command:
        raise RuntimeError("实际完整构建命令不符")
    if row["buildExit"] != 0 or row["archiveExit"] != 0 or not row["normalPostinstallVerified"] or row["user"] != "workmesh" or row["logBytes"] != len(log) or row["logSha256"] != hashlib.sha256(log).hexdigest():
        raise RuntimeError("真实构建/日志不符")
    lines = [line for line in log.decode("utf8").splitlines() if "apps/connector postinstall" in line]
    if lines != row["postinstallLines"] or not any("node scripts/prepare-native.mjs" in line for line in lines) or not any("Done" in line for line in lines):
        raise RuntimeError("缺正常安装钩子原行")
    matches = [item for item in cleanup["results"] if item.get("tag") == owner + ":" + row["name"]]
    if len(matches) != 1 or matches[0].get("exit") != 0 or matches[0].get("imageId") != row["imageId"]:
        raise RuntimeError("镜像定向清理未证明")
builder = [item for item in cleanup["results"] if item.get("builder") == owner]
if len(builder) != 1 or builder[0]["exit"] != 0:
    raise RuntimeError("builder清理未成功")
for kind, name in [("container", "buildx_buildkit_" + owner + "0"), ("volume", "buildx_buildkit_" + owner + "0_state")]:
    matches = [item for item in cleanup["results"] if item.get("kind") == kind and item.get("name") == name]
    if len(matches) != 1 or not matches[0]["absent"]:
        raise RuntimeError("准确builder容器/卷未清理")
receipt = {"runId": int(run_id), "sourceHead": source_head, "checkout": registration["head"], "tree": tree,
           "artifactId": artifact["id"], "artifactName": artifact["name"], "archiveBytes": len(raw), "archiveSha256": hashlib.sha256(raw).hexdigest(),
           "owner": owner, "files": files, "verified": True,
           "source": "完整ZIP仅在内存读取并保摘要；选定四镜像日志及登记/结果/清理JSON保存原字节，不保存其他上下文或凭据"}
(root / "receipt.json").write_bytes((json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode())
print(json.dumps({"runId": int(run_id), "sourceHead": source_head, "owner": owner, "fourBuildsAndCleanupVerified": True}))
