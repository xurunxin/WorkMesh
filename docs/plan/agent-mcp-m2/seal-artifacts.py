"""封存交付字节索引；实时回执按自身archive索引独立，不自引用循环。"""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
excluded=["artifact-manifest.json","static-checks.json","input/stage-receipt.json"]
entries=[]
for p in sorted([*OUT.rglob("*"),ROOT/"docs/adr/0082-parent-child-status-projection.md"]):
    if not p.is_file():continue
    rel=str(p.relative_to(ROOT)).replace("\\","/")
    local=str(p.relative_to(OUT)).replace("\\","/") if p.is_relative_to(OUT) else None
    if local in excluded or (local and local.startswith("input/static-run-")):continue
    b=p.read_bytes()
    entries.append({"path":rel,"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),
       "gitBlobId":None,"kind":"本轮实际工作树字节；提交时stage另核，不能将SHA256当GitBlob"})
(OUT/"artifact-manifest.json").write_text(json.dumps({
  "status":"交付静态文件工作树字节索引",
  "entries":entries,
  "excluded":{"self":"artifact-manifest.json避免自引用",
     "mutableReceipt":"static-checks.json及input/static-run-*由该回执单独记录原输出member/hash/native exit/runtime；input/stage-receipt.json为独立stage字节索引排除自身",
     "gitFinalHead":"最终回复精确head；提交后逐staged/blob核验，不循环追写未来自身head"},
  "newline":"文件原字节；源ZIP成员Git/worktree分列，不能宣称CRLF等同GitBlob"
},ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
print(json.dumps({"sealedFiles":len(entries)},ensure_ascii=False))
