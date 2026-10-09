"""保全实际日志原字节，再生成可读副本；不豁免仓库空白检查。"""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
evidence = root / 'docs/plan/agent-mcp-m0/product-evidence'
index_path = evidence / 'raw-output-index.json'
rows = json.loads(index_path.read_text(encoding='utf8')) if index_path.exists() else []
known = {row['path']: row for row in rows}
for path in sorted(evidence.glob('*.log')):
    original = path.read_bytes()
    current_hash = hashlib.sha256(original).hexdigest()
    if path.name in known and known[path.name]['readableSha256'] == current_hash:
        continue
    original_hash = current_hash
    archive = evidence / ('raw-output-' + original_hash + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as saved:
        saved.writestr('output.log', original)
    with zipfile.ZipFile(archive) as saved:
        assert saved.read('output.log') == original
    text = original.decode('utf8')
    # 可读副本统一LF、去行尾空白和连续结尾空行；原始字节仅在ZIP内。
    readable = ('\n'.join(line.rstrip() for line in text.splitlines()).rstrip() + '\n').encode('utf8')
    path.write_bytes(readable)
    rows.append(dict(path=path.name, originalBytes=len(original), originalSha256=original_hash,
        archive=archive.name, archiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
        member='output.log', readableBytes=len(readable), readableSha256=hashlib.sha256(readable).hexdigest(),
        mapping='原始脱敏运行输出ZIP；可读副本只规范空白/换行，不改退出码或测试结论'))
index_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
print(json.dumps(dict(rawOutputs=len(rows), archivesVerified=True), ensure_ascii=False))
