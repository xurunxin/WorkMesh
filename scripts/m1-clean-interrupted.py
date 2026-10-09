"""核归属和无活动引用后，保全中断现场，只清精确登记的本人闲置容器。"""
import datetime
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
evidence = root / 'docs/plan/agent-mcp-m1/product-evidence'
rows = []
for run_id in sys.argv[1:]:
    if not re.fullmatch(r'm1-[a-f0-9]{12}', run_id):
        raise SystemExit('Invalid run identity')
    registry = json.loads((evidence / f'{run_id}-resources.json').read_text(encoding='utf8'))
    record = dict(runId=run_id, reason='turn interrupted; final command output/exit were not retained',
                  exitCode=None, resources=[], observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    for entry in registry['resources']:
        inspect = subprocess.run(['docker', 'inspect', entry['id']], capture_output=True)
        if inspect.returncode:
            record['resources'].append(dict(id=entry['id'], alreadyAbsent=True))
            continue
        actual = json.loads(inspect.stdout)[0]
        if actual['Name'] != '/' + entry['name'] or actual['Config']['Labels'].get('workmesh.m1.owner') != run_id:
            raise SystemExit('Ownership mismatch; stop target')
        task_secrets = [setting.split('=', 1)[1] for setting in actual['Config']['Env']
                        if any(part in setting.split('=', 1)[0] for part in ('PASSWORD', 'SECRET_KEY'))]
        log = subprocess.run(['docker', 'logs', entry['id']], capture_output=True)
        data = log.stdout + log.stderr
        for value in task_secrets:
            data = data.replace(value.encode(), b'[fixture secret]')
        (evidence / f'{run_id}-interrupted-{entry["role"]}.log').write_bytes(data)
        if entry['role'] == 'postgres':
            query = "SELECT json_build_object('sessions',(SELECT json_agg(row_to_json(s)) FROM (SELECT id,state,revision FROM agent_sessions) s),'waits',(SELECT json_agg(row_to_json(w)) FROM (SELECT id,agent_session_id,status,continuation_turn_id,terminal_reason FROM workbench_execution_waits) w),'turns',(SELECT json_agg(row_to_json(t)) FROM (SELECT id,conversation_id,status,attempt_no FROM workbench_turns) t));"
            snapshot = subprocess.run(['docker', 'exec', entry['id'], 'psql', '-U', 'workmesh', '-d', 'workmesh_m1_test', '-Atc', query], capture_output=True)
            (evidence / f'{run_id}-interrupted-state.log').write_bytes(snapshot.stdout + snapshot.stderr)
        cleanup = []
        for args in [['stop', '--time', '10', entry['id']], ['rm', entry['id']]]:
            result = subprocess.run(['docker', *args], capture_output=True)
            cleanup.append(dict(args=args, exitCode=result.returncode,
                                stdout=result.stdout.decode('utf8', errors='replace'), stderr=result.stderr.decode('utf8', errors='replace')))
            if result.returncode:
                raise SystemExit('Cleanup failed; stop target')
        record['resources'].append(dict(id=entry['id'], name=entry['name'], ownerVerified=True, cleanup=cleanup))
    rows.append(record)
    (evidence / f'{run_id}-interrupted-cleanup.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
# Preserve current client artifacts from this interrupted combination, including
# already tracked historical files, before later runs can replace their names.
with zipfile.ZipFile(evidence / 'interrupted-client-artifacts.zip', 'w', zipfile.ZIP_DEFLATED) as saved:
    for directory in ['ci-logs/mcp-coverage', 'ci-logs/execution-recovery']:
        for path in (root / directory).rglob('*'):
            if path.is_file():
                saved.writestr(path.relative_to(root).as_posix(), path.read_bytes())
print(json.dumps(dict(cleanedRunIds=[row['runId'] for row in rows], sharedResourcesTouched=False)))
