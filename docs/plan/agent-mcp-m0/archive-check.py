"""仅核对受控归档；读取当前来源，不访问产品服务或修改文件。"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote
import yaml

directory = Path(__file__).resolve().parent
root = directory.parents[2]
load = lambda path: json.loads((directory / path).read_text(encoding="utf-8"))
digest = lambda data: hashlib.sha256(data).hexdigest()
decisions = load("operation-decisions.json")
meta = load("archive-metadata.json")
observations = load("platform-observation.json")
source = load("source-manifest.json")
generation = load("generation.json")
main = meta["sourceHead"]
git = lambda args: subprocess.check_output(["git", *args], cwd=root)
head = git(["rev-parse", "HEAD"]).decode().strip()
if head != main:
    committed_paths = git(["diff", "--name-only", main, head]).decode().splitlines()
    assert committed_paths and all(path.startswith("docs/plan/agent-mcp-m0/") for path in committed_paths), "来源产品树变化；重新核来源"
assert not meta["newPlanCreated"] and not meta["editPlanCalled"]
assert meta["currentVersion"] is None and meta["platformDocCreatedAt"] is None
plan = (directory / "savedplan.md").read_bytes()
assert plan == (directory / "implementation.md").read_bytes(), "两处计划正文不同"
todo_text = "\n".join(block["text"] for block in observations["todos"]["content"] if block["type"] == "text")
assert "\nSaved plan:\n" in todo_text
prefix = todo_text.split("\nSaved plan:\n", 1)[1].split("\n…(truncated)", 1)[0]
assert plan.decode().startswith(prefix), "权威正文与工具可见前缀不同"
spec = todo_text.split("\nSpec:\n", 1)[1].split("\nSaved plan:\n", 1)[0].rstrip() + "\n"
assert (directory / "spec.md").read_text(encoding="utf-8") == spec, "spec不完整或不同"
conversation = "\n".join(block["text"] for block in observations["conversation"]["content"] if block["type"] == "text")
assert f"[plan](doc:{meta['currentDocId']})" in conversation
assert "A: 允许仅文档落盘（推荐）" in conversation
assert f"{main}\trefs/heads/main" in observations["main"]["content"][0]["text"]
for captured in generation["planFiles"]:
    actual = (directory / captured["path"]).read_bytes()
    assert len(actual) == captured["bytes"] and digest(actual) == captured["sha256"]
openapi = yaml.safe_load((root / "OPENAPI.yaml").read_text(encoding="utf-8"))
operations = {operation["operationId"]: (method.upper(), path) for path, definition in openapi["paths"].items()
              for method, operation in definition.items() if method in ["get", "post", "put", "patch", "delete"] and "operationId" in operation}
records = decisions["operations"]
assert len(records) == len({record["operationId"] for record in records})
assert set(operations) == {record["operationId"] for record in records}
markdown = (directory / "operation-index.md").read_text(encoding="utf-8")
index_ids = re.findall(r"^\| `([^`]+)`<br>", markdown, re.M)
assert len(index_ids) == len(set(index_ids)) and set(index_ids) == set(operations)
allowed = {"Agent可适配", "Human保留", "adapter内部", "部署可选", "领域差异待核"}
for record in records:
    assert operations[record["operationId"]] == (record["rest"]["method"], record["rest"]["path"])
    assert set(record["classification"]) <= allowed and record["classification"]
    assert set(record["applicability"]) == set(record["acceptanceCases"])
    assert record["openApiContract"]["responses"]
    assert record["verificationStatus"].startswith("待产品")
    assert record["agentDiscoveryDecision"]["liveEligibility"].startswith("本轮未求值")
for entry in source["files"]:
    blob = git(["show", f"{main}:{entry['path']}"])
    worktree = (root / entry["path"]).read_bytes()
    assert digest(blob) == entry["gitBlob"]["sha256"] and len(blob) == entry["gitBlob"]["bytes"]
    assert digest(worktree) == entry["worktree"]["sha256"] and len(worktree) == entry["worktree"]["bytes"]
    assert entry["mapping"] in ["字节相同", "仅CRLF/LF转换"]
links = 0
for file in directory.iterdir():
    if file.suffix not in [".md", ".json", ".mjs", ".py"]:
        continue
    data = file.read_bytes()
    text = data.decode("utf-8")
    assert b"\r" not in data and not data.startswith(b"\xef\xbb\xbf"), f"生成文件非UTF-8 LF：{file.name}"
    assert data.endswith(b"\n") and not data.endswith(b"\n\n"), f"文件末空行：{file.name}"
    assert not any(line.rstrip() != line for line in text.splitlines()), f"尾随空白：{file.name}"
    if file.suffix == ".json":
        json.loads(text)
    if file.suffix == ".md":
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            if ":" in target or target.startswith("#"):
                continue
            path = unquote(target.split("#", 1)[0])
            assert (file.parent / path).exists(), f"缺失链接：{file.name} -> {target}"
            links += 1
changed = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"], cwd=root).decode()
for line in changed.splitlines():
    assert line[3:].replace("\\", "/").startswith("docs/plan/agent-mcp-m0/"), f"超范围修改：{line}"
print(json.dumps({"结果": "文档静态核验通过", "operationCount": len(records), "sourceFiles": len(source["files"]),
                  "localLinks": links, "savedPlanPrefixMatch": True, "fullSpecMatch": True,
                  "productChecks": "未运行", "独审": "待平台独审"}, ensure_ascii=False))
