from pathlib import Path
import hashlib, json, sys, uuid, zipfile
root = Path('docs/reviews/backend-retirement')
manifest_path = root / 'log-source-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
paths = [Path(p) for p in sys.argv[1:]]
if not paths:
    raise SystemExit('Pass only finished log paths; never archive an active writer')
archive = root / 'raw-logs' / ('run-' + uuid.uuid4().hex[:12] + '.zip')
records = []
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as output:
    for path in paths:
        entry = path.relative_to(root).as_posix()
        raw = path.read_bytes()
        if raw.startswith('阅读视图；'.encode('utf8')):
            raise SystemExit('Already a reading view: ' + str(path))
        output.writestr(entry, raw)
        digest = hashlib.sha256(raw).hexdigest()
        text = '\n'.join(line.rstrip() for line in raw.decode('utf8').splitlines()).rstrip()
        header = f'阅读视图；原始字节：{archive.relative_to(root).as_posix()} 内 {entry}；SHA-256：{digest}'
        view = (header + ('\n' + text if text else '') + '\n').encode('utf8')
        records.append({'path': path.as_posix(), 'archive': archive.as_posix(), 'entry': entry,
                        'rawSha256': digest, 'rawBytes': len(raw), 'viewSha256': hashlib.sha256(view).hexdigest(),
                        'viewTransform': 'decode UTF-8; strip line-end whitespace and terminal blank lines; source bytes unchanged in ZIP',
                        '_view': view})
with zipfile.ZipFile(archive) as source:
    for record in records:
        assert hashlib.sha256(source.read(record['entry'])).hexdigest() == record['rawSha256']
for record in records:
    Path(record['path']).write_bytes(record.pop('_view'))
manifest['records'].extend(records)
manifest['archives'].append({'path': archive.as_posix(), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()})
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'archive': archive.as_posix(), 'verifiedEntries': len(records)}))
