"""只从已入库原件计算已观察耗时，不补造缺失请求或回执。"""
import hashlib
import json
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parents[4]
evidence = root / 'docs/reviews/ta01-product'
names = ['ci562-arm64-personal-first-failure', 'ci562-arm64-team-first-failure',
         'ci562-arm64-enterprise-first-failure', 'ci563-arm64-team-native-observation',
         'ci563-amd64-team-native-observation', 'ci562-amd64-enterprise-first-failure']
results = []
for name in names:
    index_bytes = (evidence / (name + '.json')).read_bytes()
    index = json.loads(index_bytes)
    archive_bytes = (evidence / (name + '.zip')).read_bytes()
    assert hashlib.sha256(archive_bytes).hexdigest() == index['selectedZipSha256']
    with zipfile.ZipFile(evidence / (name + '.zip')) as archive:
        serial = archive.read('server-install/serial.log')
    assert hashlib.sha256(serial).hexdigest() == index['members']['server-install/serial.log']['sha256']
    lines, all_uptimes = [], []
    for line in serial.decode(errors='replace').splitlines():
        uptime = re.match(r'^\[\s*(\d+(?:\.\d+)?)\]', line)
        if not uptime:
            continue
        all_uptimes.append(float(uptime[1]))
        start = re.search(r'\{"tag": "ta01-(?:failure|install-action|progress|installer-phase)"', line)
        if start:
            record, _ = json.JSONDecoder().raw_decode(line, start.start())
            lines.append({'guestKernelUptimeSeconds': float(uptime[1]), **record})
    phases = {}
    for record in index['records']:
        if record.get('tag') == 'ta01-installer-phase':
            key = record['phase']
            row = phases.setdefault(key, {'observedInvocations': 0, 'elapsedMilliseconds': 0, 'nodeCpuMicroseconds': 0})
            row['observedInvocations'] += 1
            row['elapsedMilliseconds'] += record['elapsedMilliseconds']
            row['nodeCpuMicroseconds'] += record['userCpuMicroseconds'] + record['systemCpuMicroseconds']
    actions = [row for row in index['records'] if row.get('tag') == 'ta01-install-action']
    first_failure = next((row for row in lines if row.get('tag') == 'ta01-failure' and row.get('stage') == 'caught'), None)
    result = {'index': name + '.json', 'indexSha256': hashlib.sha256(index_bytes).hexdigest(),
              'sourceHead': index['sourceHead'], 'hostTotalSeconds': index['totalSeconds'],
              'receiptCount': len(index['receipts']), 'firstCaughtFailure': first_failure,
              'lastTaggedRecord': lines[-1] if lines else None,
              'lastObservedGuestKernelUptimeSeconds': max(all_uptimes) if all_uptimes else None,
              'observedInstallerPhases': phases, 'lastActions': actions[-4:]}
    if first_failure:
        result['observedSerialSecondsAfterFirstFailure'] = max(all_uptimes) - first_failure['guestKernelUptimeSeconds']
    results.append(result)
print(json.dumps({'说明': '各类阶段求和只覆盖已有记录；Node CPU不含Docker子进程。guest kernel uptime与host total是不同钟，不能直接相减。串口最后记录不证明后续请求、恢复结果或资源收尾。',
                  'results': results}, ensure_ascii=False, indent=2))
