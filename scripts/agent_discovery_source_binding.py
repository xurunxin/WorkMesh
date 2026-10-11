"""核验注册时原件与 Git 源码；只允许 CRLF/LF checkout 转换。"""
import hashlib
import json


def fingerprint(raw):
    return dict(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())


def verify_registration_sources(root, capture_path, binding_path):
    capture_raw = (root / capture_path).read_bytes()
    capture = json.loads(capture_raw)
    binding = json.loads((root / binding_path).read_bytes())
    if binding['capture'] != dict(path=capture_path, **fingerprint(capture_raw)):
        raise ValueError('M4注册捕获原件已变')
    if binding['conversion'] != 'CRLF_to_LF_only':
        raise ValueError('M4不允许其他源码规范化')
    sources = {entry['path']: entry for entry in binding['sources']}
    if len(sources) != len(binding['sources']) or set(sources) != {entry['path'] for entry in capture['sources']}:
        raise ValueError('M4源码绑定必须完整且唯一')
    for evidence in capture['sources']:
        entry = sources[evidence['path']]
        runtime = (root / entry['runtime']['objectPath']).read_bytes()
        git_source = (root / entry['git']['objectPath']).read_bytes()
        if fingerprint(runtime) != {key: evidence[key] for key in ('bytes', 'sha256')}:
            raise ValueError('M4注册运行原件已变：' + evidence['path'])
        if fingerprint(runtime) != {key: entry['runtime'][key] for key in ('bytes', 'sha256')}:
            raise ValueError('M4运行源码绑定已变：' + evidence['path'])
        git_blob = hashlib.sha1(b'blob ' + str(len(git_source)).encode() + b'\0' + git_source).hexdigest()
        if fingerprint(git_source) != {key: entry['git'][key] for key in ('bytes', 'sha256')} or git_blob != entry['git']['blob']:
            raise ValueError('M4 Git源码原件已变：' + evidence['path'])
        # 不忽略 BOM、空格、单独 CR 或代码差异；原运行原件不改写。
        if b'\r\n' in git_source or runtime.replace(b'\r\n', b'\n') != git_source:
            raise ValueError('M4运行与Git源码不等价：' + evidence['path'])
        checkout = (root / evidence['path']).read_bytes()
        if checkout.replace(b'\r\n', b'\n') != git_source:
            raise ValueError('M4注册捕获源码已变：' + evidence['path'])
    return capture
