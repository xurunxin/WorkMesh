"""复核方案材料、源正文及实际 Git blob，不运行产品验收。"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--ref", default=":", help="默认核暂存区；提交后传 HEAD")
args = parser.parse_args()


def git(*argv):
    return subprocess.check_output(["git", *argv], cwd=ROOT)


def digest(data):
    return hashlib.sha256(data).hexdigest()


manifest = json.loads((OUT / "source-manifest.json").read_text(encoding="utf-8"))
for entry in manifest["files"]:
    path = entry["path"]
    if not path.startswith("docs/plan/backend-only/") and path != "docs/plan/backend-only.md":
        raise RuntimeError("文件越过本轮范围：" + path)
    data = (ROOT / path).read_bytes()
    assert digest(data) == entry["fileSha256"], path
    revision = (":" if args.ref == ":" else args.ref + ":") + path
    committed = git("cat-file", "blob", revision)
    assert committed == data, "Git blob 字节不一致：" + path
    assert git("rev-parse", revision).decode().strip() == entry["gitBlob"], path
    if "bodySha256" in entry:
        assert data.endswith(b"\n"), path
        assert digest(data[:-1]) == entry["bodySha256"], path

expected = json.loads((OUT / "sources/expected-bodies.json").read_text(encoding="utf-8"))
source_paths = {
    "latestPlan": "sources/plan-4L0f8ekmDAa144DUqvFlx.md",
    "historicalPlan": "sources/plan-eeEM_cmzdO-i7EqTiz7XF.md",
    "spec": "sources/spec.md",
    "decisions": "sources/user-decisions.md",
}
for key, relative in source_paths.items():
    assert (OUT / relative).read_bytes() == expected[key].encode("utf-8") + b"\n", relative
corrections = json.loads((OUT / "review-corrections.json").read_text(encoding="utf-8"))
assert corrections["sourcePath"] == source_paths["latestPlan"]
assert corrections["sourceDocId"] == manifest["currentPlan"]["docId"]
revised_plan = expected["latestPlan"]
for edit in corrections["edits"]:
    assert revised_plan.count(edit["old"]) == 1, "方案修订锚点不唯一"
    revised_plan = revised_plan.replace(edit["old"], edit["new"], 1)
assert (ROOT / corrections["activePath"]).read_bytes() == revised_plan.encode("utf-8") + b"\n"
returned = (OUT / "sources/todos-response.txt").read_text(encoding="utf-8")
assert returned.split("\nSpec:\n", 1)[1].split("\n\nSaved plan:\n", 1)[0] == expected["spec"]
transcript = json.loads((OUT / "sources/conversation-response.json").read_text(encoding="utf-8"))["text"]
assert expected["decisions"] in transcript

inv = json.loads((OUT / "test-inventory.json").read_text(encoding="utf-8"))
outside_scripts = {"scripts/verify-a2-backend-lite-api.mjs", "scripts/verify-a2-backend-lite.mjs"}
assert outside_scripts <= {entry["path"] for entry in inv["files"]}, "遗漏目录外 Lite 验证入口"
for entry in inv["files"]:
    data = git("show", inv["sourceHead"] + ":" + entry["path"])
    assert digest(data) == entry["gitBlobSha256"], entry["path"]
    if entry["path"] in outside_scripts:
        assert entry["assertions"], entry["path"]
        assert entry["disposition"]["plannedTests"], entry["path"]
        assert entry["disposition"]["executionCommand"].startswith("node scripts/"), entry["path"]
        assert entry["disposition"]["owner"].startswith("#61"), entry["path"]
    for target in entry["disposition"]["existingBackendTests"]:
        assert (ROOT / target).is_file(), target
changed = git("diff", "--name-only", manifest["sourceHead"]).decode().splitlines()
assert all(p == "docs/plan/backend-only.md" or p.startswith("docs/plan/backend-only/") for p in changed), changed
assert len(manifest["followupSpecs"]) == 31
assert all(e["specComplete"] for e in manifest["followupSpecs"])
print(json.dumps({"result": "passed", "gitRef": args.ref, "documentFiles": len(manifest["files"]), "indexedTestFiles": len(inv["files"]), "followupSpecs": len(manifest["followupSpecs"]), "productChanges": 0}))
