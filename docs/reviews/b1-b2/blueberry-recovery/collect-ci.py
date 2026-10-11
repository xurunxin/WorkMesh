"""按准确 run/job 保存原始可得字节；不覆盖历史快照，不把部分状态冒完成。"""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO = "repos/xurunxin/WorkMesh"


def api(path):
    return subprocess.run(["gh", "api", f"{REPO}/{path}"], capture_output=True, check=True).stdout


def persist(path, data):
    if path.exists() and path.read_bytes() != data:
        raise RuntimeError(f"禁止覆盖历史证据：{path}")
    path.write_bytes(data)


run_id, capture = sys.argv[1:3]
if not run_id.isdigit() or not re.fullmatch(r"[a-z0-9-]+", capture):
    raise ValueError("需要准确 run id 与独有快照名")
directory = BASE / capture
directory.mkdir(exist_ok=True)
run_bytes = api(f"actions/runs/{run_id}")
jobs_bytes = api(f"actions/runs/{run_id}/jobs?per_page=100")
persist(directory / "run.json", run_bytes)
persist(directory / "jobs.json", jobs_bytes)
run, jobs = json.loads(run_bytes), json.loads(jobs_bytes)["jobs"]
requested = {int(value) for value in sys.argv[3:]}
if requested - {job["id"] for job in jobs}:
    raise ValueError("job 不属于准确 run")
logs = []
for job in jobs:
    if job["id"] not in requested:
        continue
    if job["status"] != "completed":
        raise RuntimeError("不能将运行中日志冒完整日志")
    raw = api(f"actions/jobs/{job['id']}/logs")
    redacted, count = re.subn(rb"\bwm[a-z]_[A-Za-z0-9_-]{43,}", b"[REDACTED]", raw)
    filename = f"job-{job['id']}-original.log"
    persist(directory / filename, redacted)
    logs.append({"jobId": job["id"], "name": job["name"], "conclusion": job["conclusion"],
                 "path": filename, "bytes": len(redacted), "sha256": hashlib.sha256(redacted).hexdigest(),
                 "redactions": count, "source": "gh api job logs 的原始 stdout 字节；只作明确凭据形态脱敏"})
receipt = {"capturedAt": datetime.now(timezone.utc).isoformat(), "runId": int(run_id),
           "head": run["head_sha"], "event": run["event"], "url": run["html_url"],
           "status": run["status"], "conclusion": run["conclusion"], "logs": logs}
persist(directory / "receipt.json", (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode())
print(json.dumps({"head": run["head_sha"], "status": run["status"], "conclusion": run["conclusion"], "logs": len(logs)}))
