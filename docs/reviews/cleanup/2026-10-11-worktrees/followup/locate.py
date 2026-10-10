"""最小读取历史会话元数据/用户任务标题及 daemon 安全记录，定位旧构建。"""
import re
from common import OUT, ROOT, CURRENT, MAIN, TARGETS, utc, write, sha, call, load

def main():
    session_root = ROOT.parent / 'codex-home/sessions/2026/10'
    rows = []
    for day in ('07', '08', '11'):
        for path in (session_root / day).glob('*.jsonl'):
            with path.open(encoding='utf-8') as stream:
                first = stream.readline()
                import json
                meta = json.loads(first)['payload']
                cwd = meta.get('cwd', '')
                if not any(cwd.endswith(n) for n in TARGETS.values()):
                    continue
                user = None
                for i, line in enumerate(stream, 2):
                    payload = json.loads(line).get('payload', {})
                    if payload.get('type') == 'message' and payload.get('role') == 'user':
                        text = '\n'.join(v.get('text', '') for v in payload.get('content', []) if isinstance(v, dict))
                        if 'Title:' in text and '# AGENTS.md' not in text:
                            user = {'line': i, 'originalText': text, 'originalLineSha256': sha(line.encode())}
                            break
                rows.append({'source': str(path), 'metadataLine': 1, 'metadataOriginalLineSha256': sha(first.encode()),
                             'metadata': {k: meta.get(k) for k in ('id', 'timestamp', 'cwd', 'originator', 'cli_version', 'git')},
                             'firstTask': user})
    log_path = ROOT.parent / 'daemon.log'
    logs = []
    with log_path.open(encoding='utf-8') as stream:
        for i, line in enumerate(stream, 1):
            if any(n in line for n in TARGETS.values()) and re.search(r'\[(machine|workspace|step)\]', line):
                # 仅 workspace/step 行，没有环境、模型、完整命令行或秘密。
                assert not re.search(r'Bearer |wmi_|wms_|ghp_', line)
                logs.append({'line': i, 'originalText': line, 'sha256': sha(line.encode())})
    write('build-provenance.json', {'recordedAt': utc(), 'sessions': rows, 'daemonSource': str(log_path), 'daemonSelectedLines': logs,
                                  'limitations': '只读所需标题与元数据，不保存完整会话；标题+cwd+branch+当前 todo 元数据共同绑定，不能冒平台全历史 build registry'})
    print('历史构建已定位：', [(r['metadata']['cwd'].split('\\')[-1], r['firstTask']['originalText'].split('Title:', 1)[1].split('\n')[0]) for r in rows if r['firstTask']])

if __name__ == '__main__':
    main()
