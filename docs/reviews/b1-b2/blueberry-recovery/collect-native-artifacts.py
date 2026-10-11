"""只保存明确的原生源码/清理JSON，不按ZIP路径解压，不保存凭据或覆盖历史。"""
import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

run_id, capture = sys.argv[1:3]
if not run_id.isdigit() or not re.fullmatch(r"[a-z0-9-]+", capture):
    raise ValueError("需要准确run与独有目录")
root = Path(__file__).resolve().parent / capture
root.mkdir(exist_ok=False)
api = "repos/xurunxin/WorkMesh"

def get(path):
    return subprocess.run(["gh", "api", f"{api}/{path}"], capture_output=True, check=True).stdout

artifacts = json.loads(get(f"actions/runs/{run_id}/artifacts?per_page=100"))["artifacts"]
selected = [a for a in artifacts if a["name"].startswith("connector-platform-raw-")]
if len(selected) != 3:
    raise RuntimeError("缺三OS原生工件，不能冒完整")
receipts = []
for artifact in selected:
    raw = get(f"actions/artifacts/{artifact['id']}/zip")
    archive = zipfile.ZipFile(io.BytesIO(raw))
    directory = root / artifact["name"]
    directory.mkdir()
    saved = []
    for filename in ["connector-source-before.json", "connector-source-after.json", "connector-cleanup.json"]:
        names = [name for name in archive.namelist() if name.split("/")[-1] == filename]
        if len(names) > 1 or (filename != "connector-cleanup.json" and not names):
            raise RuntimeError("来源JSON缺失或重复")
        if not names:
            continue
        data = archive.read(names[0])
        json.loads(data.decode("utf-8-sig"))
        (directory / filename).write_bytes(data)
        saved.append({"member": names[0], "path": str((directory / filename).relative_to(root)),
                      "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    receipts.append({"id": artifact["id"], "name": artifact["name"], "archiveBytes": len(raw),
                     "archiveSha256": hashlib.sha256(raw).hexdigest(), "files": saved})
(root / "receipt.json").write_text(json.dumps({"runId": int(run_id), "artifacts": receipts,
    "source": "gh api artifacts/id/zip原始stdout；选定JSON原字节保存，完整ZIP仅保hash/长度，不冒已保全全工件"}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"runId": int(run_id), "artifacts": len(receipts), "savedFiles": sum(len(r["files"]) for r in receipts)}))
