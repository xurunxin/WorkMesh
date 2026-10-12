"""在独有快照中验证文档检查的拒绝行为，不改产品文件。"""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile

repo = Path(__file__).resolve().parents[3]
node = str(Path(sys.argv[1]).resolve()) if len(sys.argv) > 1 else shutil.which("node")
assert subprocess.check_output([node, "--version"]).decode().strip() == "v22.19.0"
temp_root = (repo / ".tmp").resolve()
temp_root.mkdir(exist_ok=True)
folder = Path(tempfile.mkdtemp(prefix="docs-negative-", dir=temp_root)).resolve()
assert folder.is_relative_to(temp_root)
files = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "docs/documentation-maintenance.md",
         "docs/skills/zh-tech-writing/README.md"]
files += [str(p.relative_to(repo).as_posix()) for p in (repo / "docs/integration").glob("*.md")]
required = files + ["scripts/check-integration-docs.mjs", "OPENAPI.yaml", "apps/mcp/src/index.ts",
                    "apps/mcp/src/discovery.ts", "docs/integration/examples/human.mjs",
                    "docs/skills/zh-tech-writing/source.json"]
source = json.loads((repo / "docs/skills/zh-tech-writing/source.json").read_text())
required += ["docs/skills/zh-tech-writing/" + item["path"] for item in source["files"]]
try:
    for path in files:
        text = re.sub(r"```[^\n]*\n[\s\S]*?```", "", (repo / path).read_text(encoding="utf8"))
        for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
            if re.match(r"^(https?:|mailto:|#)", link):
                continue
            target = (folder / path).parent / link.split("#")[0]
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_text("placeholder", encoding="utf8")
    for path in required:
        target = folder / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / path, target)
    command = [node, str(folder / "scripts/check-integration-docs.mjs")]
    def run():
        return subprocess.run(command, capture_output=True, text=True, encoding="utf8")
    baseline = run()
    assert baseline.returncode == 0, baseline.stderr
    cases = []
    for name, path, before, after in [
        ("missing-link", "docs/integration/README.md", b"(getting-started.md)", b"(missing-guide.md)"),
        ("unknown-rest-endpoint", "docs/integration/reference.md", b"GET /readyz", b"GET /not-supported"),
        ("unknown-mcp-tool", "docs/integration/reference.md", b"| `verify_connection`", b"| `invented_tool`"),
        ("modified-skill-source", "docs/skills/zh-tech-writing/upstream/LICENSE", b"MIT License", b"Changed License"),
    ]:
        file = folder / path
        original = file.read_bytes()
        assert before in original
        file.write_bytes(original.replace(before, after))
        result = run()
        assert result.returncode != 0, name
        file.write_bytes(original)
        cases.append({"case": name, "rejected": True})
    result = {"command": "python docs/reviews/api-mcp-docs/check-negative-cases.py <node22>",
              "baseline": json.loads(baseline.stdout), "negativeCases": cases,
              "fixture": "独有临时快照，未修改产品文件"}
    (repo / "docs/reviews/api-mcp-docs/static-negative-results.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print("静态检查正例与四项拒绝例通过")
finally:
    assert folder.resolve().is_relative_to(temp_root) and folder.name.startswith("docs-negative-")
    shutil.rmtree(folder)
