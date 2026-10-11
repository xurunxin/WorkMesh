"""按真实Git blob核三个OS原字节摘要与checkout树，不忽略源码/空白/BOM差异。"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

capture, branch_head = sys.argv[1:3]
if not re.fullmatch(r"ci\d+-artifacts", capture) or not re.fullmatch(r"[a-f0-9]{40}", branch_head):
    raise ValueError("需要工件目录和准确提交")
root = Path(__file__).resolve().parent
directory = root / capture
sources = [json.loads(p.read_bytes()) for p in sorted(directory.glob("*/connector-source-after.json"))]
if {s["platform"] for s in sources} != {"win32", "linux", "darwin"} or len(sources) != 3:
    raise RuntimeError("缺三个实际OS")
receipt = json.loads((directory / "receipt.json").read_bytes())
for artifact in receipt["artifacts"]:
    for file in artifact["files"]:
        data = (directory / file["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != file["sha256"]:
            raise RuntimeError("原件字节与下载来源不一致")
blobs = list(dict.fromkeys(row["committedBlob"] for source in sources for row in source["files"]))
result = subprocess.run(["git", "cat-file", "--batch"], input=("\n".join(blobs) + "\n").encode(), capture_output=True, check=True)
raw, position, hashes = result.stdout, 0, {}
for blob in blobs:
    end = raw.index(b"\n", position)
    identity, kind, size = raw[position:end].decode().split()
    if identity != blob or kind != "blob":
        raise RuntimeError("Git原件类型不符")
    start = end + 1
    data = raw[start:start + int(size)]
    position = start + int(size) + 1
    hashes[blob] = (hashlib.sha256(data).hexdigest(), hashlib.sha256(data.replace(b"\n", b"\r\n")).hexdigest()
                    if b"\0" not in data and b"\r\n" not in data else None)
rows = []
tree_entries = subprocess.run(["git", "ls-tree", "-r", "-z", branch_head], capture_output=True, check=True).stdout
path_blobs = {}
for entry in tree_entries.split(b"\0"):
    if entry:
        metadata, path = entry.split(b"\t", 1)
        path_blobs[path.decode()] = metadata.decode().split()[2]
for source in sources:
    crlf, failures = [], []
    # 按该OS的实际目录读取准确前置原件，不用另一个OS的快照。
    before_path = next(p for p in directory.glob("*/connector-source-before.json") if json.loads(p.read_bytes())["platform"] == source["platform"])
    before = json.loads(before_path.read_bytes())
    if before["files"] != source["files"] or before["head"] != source["head"]:
        raise RuntimeError("前后源码原字节/提交改变")
    for file in source["files"]:
        if file["committedBlob"] != path_blobs.get(file["path"]) or file["indexBlob"] != file["committedBlob"] or file["canonicalGitBlob"] != file["committedBlob"]:
            raise RuntimeError("准确路径的三方Git blob不符")
        lf, converted = hashes[file["committedBlob"]]
        if file["rawSha256"] == lf:
            continue
        if file["rawSha256"] == converted:
            crlf.append(file["path"])
        else:
            failures.append(file["path"])
    if failures or source["mismatches"] or source["changed"] or source["removed"] or not source["sameHead"]:
        raise RuntimeError("运行字节或三方Git身份不符")
    rows.append({"platform": source["platform"], "arch": source["arch"], "node": source["node"],
                 "head": source["head"], "tree": source["tree"], "files": len(source["files"]), "crlfOnly": crlf, "rawByteMismatches": failures})
checkouts = {s["head"] for s in sources}
if len(checkouts) != 1:
    raise RuntimeError("三个OS checkout不符")
checkout = next(iter(checkouts))
commit = json.loads(subprocess.run(["gh", "api", f"repos/xurunxin/WorkMesh/git/commits/{checkout}"], capture_output=True, check=True).stdout)
tree = subprocess.run(["git", "rev-parse", branch_head + "^{tree}"], capture_output=True, check=True).stdout.decode().strip()
if commit["tree"]["sha"] != tree or any(s["tree"] != tree for s in sources) or branch_head not in [checkout, *[p["sha"] for p in commit["parents"]]]:
    raise RuntimeError("准确分支与runner树/parent绑定不符")
output = root / (capture.replace("-artifacts", "-source-equivalence") + ".json")
proof = {"runId": receipt["runId"], "head": branch_head, "checkout": checkout, "tree": tree,
    "parents": [p["sha"] for p in commit["parents"]], "rows": rows,
    "rule": "逐Git原blob核运行原字节SHA；仅无NUL且无原CRLF的文本另接受完整LF到CRLF等价，不忽略空格/BOM/源码差异"}
if output.exists():
    if json.loads(output.read_bytes()) != proof:
        raise RuntimeError("不得覆盖不同的历史等价证明")
else:
    output.write_bytes((json.dumps(proof, ensure_ascii=False, indent=2) + "\n").encode())
print(json.dumps({"platforms": len(rows), "byteMismatches": 0, "checkoutTreeMatchesBranch": True}))
