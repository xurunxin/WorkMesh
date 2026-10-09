"""补充工具回执按真实已观察退出码归档；不可得的起止时间不推测。"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import zipfile

BASE = Path(__file__).resolve().parent
if (BASE / 'extra-checks-raw.zip').exists() or (BASE / 'extra-checks.json').exists():
    raise SystemExit('补充原始证据已归档；不以可读副本覆写历史字节')
known = [
    ('ci-validate.log', 'pnpm ci:validate', 1, ['10d2e7'], 'CI 策略拒绝新增 Worker Redis；最终 CI 工作流已恢复原样'),
    ('ci-validate-recheck.log', 'pnpm ci:validate', 1, ['69e9c0'], 'Lite 示例遗漏渠道开关；最终已补默认 false，不改门禁'),
    ('ci-validate-final.log', 'pnpm ci:validate', 0, ['0ebdaf'], '实际 Node 22.19.0；CI/release/Lite/原始证据校验均成功'),
    ('route-policy.log', 'pnpm check:route-policy', 0, ['71d3b8','b60315'], '实际 Node 22.19.0，路由策略产物一致'),
    ('dependency-install.log', 'pnpm install --frozen-lockfile', 0, [], '首轮工具 stdout 与包目录键修正缺口保留；完整冻结安装输出在本日志'),
]
items = []
with zipfile.ZipFile(BASE / 'extra-checks-raw.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for filename, command, code, chunks, note in known:
        body = (BASE / filename).read_bytes()
        archive.writestr(filename, body)
        items.append({'path': filename, 'command': command, 'exitCode': code, 'execCommandChunkIds': chunks, 'callId': None,
                      'startedAt': None, 'finishedAt': None, 'observedBy': '当前 turn 已返回的 exec_command 回执；缺失时间字段不伪补',
                      'rawBytes': len(body), 'rawSha256': hashlib.sha256(body).hexdigest(), 'note': note})
with zipfile.ZipFile(BASE / 'extra-checks-raw.zip') as archive:
    if archive.testzip() is not None:
        raise RuntimeError('补充日志 CRC 校验失败')
    for item in items:
        if archive.read(item['path']) != (BASE / item['path']).read_bytes():
            raise RuntimeError('补充日志字节恢复不一致')
for item in items:
    path = BASE / item['path']
    raw = path.read_bytes()
    text = raw.decode('utf-16') if raw.startswith((b'\xff\xfe',b'\xfe\xff')) else raw.decode('utf-8',errors='replace')
    path.write_text('\n'.join(line.rstrip() for line in text.splitlines()) + '\n',encoding='utf-8')
    item['readableBytes'] = path.stat().st_size
    item['readableSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
(BASE / 'extra-checks.json').write_text(json.dumps({'recordedAt':datetime.now(timezone.utc).isoformat(),'archive':'extra-checks-raw.zip','crc':'通过','checks':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
