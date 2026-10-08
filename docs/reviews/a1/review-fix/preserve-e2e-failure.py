"""保全首次 E2E 失败；trace 中的临时凭据脱敏，原 SHA 留在清单。"""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

source = Path(sys.argv[1]).resolve(strict=True)
destination = Path(sys.argv[2]).resolve()
if destination.exists():
    raise RuntimeError("禁止覆盖已保全的首败")
if not source.is_dir() or "workmesh-a1-01a11ac2-playwright" not in source.parts:
    raise RuntimeError("拒绝读取非本任务测试输出")
if not destination.is_relative_to(Path.cwd().resolve() / "docs/reviews/a1/review-fix"):
    raise RuntimeError("证据输出必须在本任务目录中")

sha = lambda data: hashlib.sha256(data).hexdigest()
secrets = set()

def collect(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in {"csrftoken", "bootstraptoken", "installation_token", "password"} and isinstance(item, str) and item:
                secrets.add(item)
        name = str(value.get("name", "")).lower()
        text = value.get("value")
        if isinstance(text, str):
            if name in {"x-workmesh-bootstrap-token", "x-csrf-token", "x-workmesh-installation-token", "workmesh_session"}:
                secrets.add(text)
            if name in {"cookie", "set-cookie"}:
                secrets.update(re.findall(r"workmesh_session=([^;\s]+)", text))
        for item in value.values():
            collect(item)
    elif isinstance(value, list):
        for item in value:
            collect(item)
    elif isinstance(value, str) and value.startswith(("{", "[")):
        try:
            collect(json.loads(value))
        except (ValueError, RecursionError):
            pass

files = []
for path in sorted(source.rglob("*")):
    if not path.is_file():
        continue
    if not path.resolve().is_relative_to(source):
        raise RuntimeError("测试输出路径越界")
    data = path.read_bytes()
    files.append((path.relative_to(source).as_posix(), data))
    if path.suffix == ".zip":
        with zipfile.ZipFile(io.BytesIO(data)) as trace:
            for name in trace.namelist():
                for line in trace.read(name).decode("utf-8", errors="ignore").splitlines():
                    try:
                        collect(json.loads(line))
                    except ValueError:
                        pass

def redact(data):
    updated = data
    for secret in sorted(secrets, key=len, reverse=True):
        updated = updated.replace(secret.encode(), b"[REDACTED]")
    return updated

entries = []
with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED) as archive:
    for name, original in files:
        retained = original
        trace_entries = []
        if name.endswith(".zip"):
            buffer = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(original)) as trace, zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as sanitized:
                for member in trace.infolist():
                    raw = trace.read(member)
                    # 图片和视频保持原字节；安装表单两类凭据均为 password 输入。
                    safe = raw if member.filename.endswith((".jpeg", ".jpg", ".png", ".webm")) else redact(raw)
                    if any(secret.encode() in safe for secret in secrets):
                        raise RuntimeError("脱敏后仍含凭据")
                    sanitized.writestr(member, safe)
                    trace_entries.append({"member": member.filename, "originalSha256": sha(raw), "retainedSha256": sha(safe), "redacted": raw != safe})
            retained = buffer.getvalue()
        elif not name.endswith((".png", ".webm")):
            retained = redact(original)
        if not name.endswith(".zip") and any(secret.encode() in retained for secret in secrets):
            raise RuntimeError("失败产物仍含凭据")
        archive.writestr(name, retained)
        entries.append({"member": name, "originalBytes": len(original), "originalSha256": sha(original), "retainedBytes": len(retained), "retainedSha256": sha(retained), "traceEntries": trace_entries})
index = {"source": str(source), "archive": str(destination.relative_to(Path.cwd())), "sha256": sha(destination.read_bytes()),
         "secretValuesRedacted": len(secrets), "entries": entries,
         "note": "首败截图、视频及上下文保全；trace 为脱敏副本，不冒称原字节；原 SHA 与成员逐项记录。未保存 .auth 或 HTML 报告中的凭据。"}
destination.with_suffix(".index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"files": len(entries), "secretValuesRedacted": len(secrets), "archiveSha256": index["sha256"]}))
