"""Guest-only native crash diagnosis; never a product acceptance result."""
import hashlib
import re
import os
import subprocess
import time
from pathlib import Path


def safe_trace(stdout, stderr, returncode):
    # GDB disables frame arguments. Only native runtime symbol prefixes are
    # projected; paths, addresses, locals and all other text stay out of receipts.
    text = stdout.decode(errors='replace')
    symbols = re.findall(r'^#\d+\s+(?:0x[0-9a-f]+\s+in\s+)?'
                         r'(v8::[A-Za-z0-9_:~]+|node::[A-Za-z0-9_:~]+|'
                         r'(?:OSSL|X509|SSL|EVP|CRYPTO|RSA|EC|BIO|RAND)_[A-Za-z0-9_]+)\b', text, re.M)
    combined = text + '\n' + stderr.decode(errors='replace')
    groups = {
        'registerAccessFailed': ["Couldn't get registers", "Couldn't write extended state", "Couldn't read extended state", 'Could not fetch register', 'Bad address'],
        'namespaceMismatch': ['different PID namespaces'],
        'targetSymbolsUnavailable': ['Could not load shared library symbols', 'Unable to find dynamic linker', 'No symbol table is loaded', 'not in executable format'],
        'threadDebugUnavailable': ['Unable to find libthread_db', 'Cannot find new threads', 'Cannot find user-level thread'],
        'inferiorUnavailable': ['No such process', 'program is not being run', 'Selected thread is running', 'No stack'],
        'memoryUnavailable': ['Cannot access memory'],
        'debuggerInternalError': ['internal-error:', 'internal error'],
        'permissionRejected': ['Operation not permitted', 'Permission denied'],
    }
    return {'exitCode': returncode, 'stdoutSha256': hashlib.sha256(stdout).hexdigest(),
            'stderrSha256': hashlib.sha256(stderr).hexdigest(),
            'stdoutBytes': len(stdout), 'stderrBytes': len(stderr),
            'sigsegv': 'received signal SIGSEGV' in text or 'terminated with signal SIGSEGV' in text,
            'symbols': [symbol[:160] for symbol in symbols[:40]],
            'categories': [name for name, needles in groups.items() if any(needle in combined for needle in needles)],
            'ptraceRejected': 'Operation not permitted' in stderr.decode(errors='replace')}


class NativeDiagnosticError(RuntimeError):
    def __init__(self, trace):
        super().__init__('native debugger attachment failed')
        self.native_trace = trace


def process_identity(pid):
    target = Path('/proc') / str(pid)
    # comm may contain spaces or parentheses; starttime is field 22 after comm.
    start_ticks = target.joinpath('stat').read_text().rsplit(')', 1)[1].split()[19]
    executable = target.joinpath('exe').stat()
    return {'pid': pid, 'startTicks': int(start_ticks), 'executableDevice': executable.st_dev,
            'executableInode': executable.st_ino, 'executableBytes': executable.st_size}


def binary_hash(pid):
    digest = hashlib.sha256()
    target = Path('/proc') / str(pid)
    with target.joinpath('exe').open('rb') as executable:
        while block := executable.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def node_process_pid(container_pid):
    assert isinstance(container_pid, int) and container_pid > 0
    proc = Path('/proc')
    target = proc / str(container_pid)
    expected = (target / 'root/usr/local/bin/node').stat()
    children = (target / 'task' / str(container_pid) / 'children').read_text().split()
    if len(children) > 16:
        raise ValueError('native target process tree is ambiguous')
    matches = []
    for pid in [container_pid, *map(int, children)]:
        if pid < 1:
            raise ValueError('native target PID invalid')
        try:
            process = proc / str(pid)
            fields = (process / 'stat').read_text().rsplit(')', 1)[1].split()
            if pid != container_pid and int(fields[1]) != container_pid:
                continue
            executable = (process / 'exe').stat()
            if (executable.st_dev, executable.st_ino) == (expected.st_dev, expected.st_ino):
                matches.append(pid)
        except (OSError, IndexError):
            continue
    if len(matches) != 1:
        raise ValueError('native target must be one owned Node process')
    return matches[0]


class NativeCrashWatcher:
    def __init__(self, pid, *, container_init_pid=None):
        import json
        assert isinstance(pid, int) and pid > 1
        memory = Path('/proc/meminfo').read_text()
        if not re.search(r'^SwapTotal:\s+0 kB$', memory, re.M):
            raise RuntimeError('native core diagnosis requires a swap-free guest')
        self.settings = {Path('/proc/sys/kernel') / name: (Path('/proc/sys/kernel') / name).read_text()
                         for name in ['core_pattern', 'core_pipe_limit']}
        self.changed = []
        self.identity = process_identity(pid)
        self.container_init_pid = container_init_pid
        owner = Path('/opt/server-install/core-owner.json')
        with owner.open('x') as output:
            os.chmod(owner, 0o600)
            json.dump(self.identity, output)
        try:
            for name, value in [('core_pipe_limit', '1\n'),
                                ('core_pattern', '|/usr/bin/python3 /opt/server-install/core_pipe.py %P\n')]:
                file = Path('/proc/sys/kernel') / name
                file.write_text(value)
                self.changed.append(file)
        except BaseException:
            self.restore()
            raise

    def restore(self):
        for file in reversed(self.changed):
            file.write_text(self.settings[file])
        self.changed.clear()

    def finish(self):
        import json
        try:
            registration = {'registeredTarget': self.identity}
            if self.container_init_pid is not None:
                registration['containerInitPid'] = self.container_init_pid
            result = Path('/root/server-install/native-core-trace.json')
            for _ in range(90):
                if result.exists():
                    return {**json.loads(result.read_text()), **registration}
                time.sleep(1)
            return {'naturalRun': True, 'captured': False, **registration}
        finally:
            self.restore()


class NativeDebugger:
    def __init__(self, pid):
        assert isinstance(pid, int) and pid > 1
        target = Path('/proc') / str(pid)
        digest = hashlib.sha256()
        with (target / 'exe').open('rb') as executable:
            while block := executable.read(1024 * 1024):
                digest.update(block)
        self.binary_sha256 = digest.hexdigest()
        self.process = subprocess.Popen(['gdb', '--nx', '--quiet', '--batch', '-iex', 'set auto-load off',
            '-iex', 'set debuginfod enabled off',
            '-iex', 'set sysroot ' + str(target / 'root'), '--se', str(target / 'exe'), '--pid', str(pid),
            '-ex', 'set pagination off', '-ex', 'set print frame-arguments none',
            '-ex', 'set print elements 0',
            '-ex', 'handle SIGPIPE SIGUSR1 SIGUSR2 SIGALRM SIGTERM nostop noprint pass',
            '-ex', 'handle SIGSEGV stop print pass',
            '-ex', 'continue', '-ex', 'thread apply all bt 12', '-ex', 'detach'],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for _ in range(30):
            status = Path('/proc') / str(pid) / 'status'
            if status.exists() and re.search(r'^TracerPid:\s+' + str(self.process.pid) + r'$', status.read_text(), re.M):
                return
            if self.process.poll() is not None:
                stdout, stderr = self.process.communicate()
                raise NativeDiagnosticError(safe_trace(stdout, stderr, self.process.returncode))
            time.sleep(1)
        self.process.terminate()
        stdout, stderr = self.process.communicate(timeout=10)
        raise NativeDiagnosticError({**safe_trace(stdout, stderr, self.process.returncode), 'attachmentDeadline': True})

    def finish(self):
        interrupted = False
        try:
            stdout, stderr = self.process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            interrupted = True
            self.process.terminate()
            stdout, stderr = self.process.communicate(timeout=10)
        return {**safe_trace(stdout, stderr, self.process.returncode), 'interruptedWithoutCrash': interrupted,
                'targetBinarySha256': self.binary_sha256}


class NativeProbeError(RuntimeError):
    def __init__(self, trace):
        super().__init__('native probe did not establish the original business boundary')
        self.native_trace = trace


def observe_native_action(action, prepare, business_started):
    from concurrent.futures import ThreadPoolExecutor
    known_errors = {'RuntimeError', 'AssertionError', 'TimeoutExpired', 'TimeoutError', 'PermissionError',
                    'FileNotFoundError', 'OSError', 'ValueError', 'KeyError', 'NativeDiagnosticError'}
    error_type = lambda error: type(error).__name__ if type(error).__name__ in known_errors else 'OtherError'
    def registration():
        return prepare(), time.time()

    outcome, original_error = None, None
    with ThreadPoolExecutor(max_workers=1) as pool:
        capture = pool.submit(registration)
        try:
            outcome = action()
        except BaseException as error:
            original_error = error
        trace = {'target': 'team-rollback-commit', 'operationSucceeded': original_error is None,
                 'preparedBeforeBusiness': False}
        try:
            watcher, prepared_at = capture.result()
        except BaseException as error:
            # prepare owns its partial rollback. Never retry denied setup or
            # switch to another capture mechanism after its refusal.
            trace['preparationErrorType'] = error_type(error)
        else:
            trace['preparedUtcEpoch'] = prepared_at
            try:
                started_at = business_started()
                if type(started_at) in [int, float]:
                    trace['businessStartedUtcEpoch'] = started_at
                    trace['preparedBeforeBusiness'] = prepared_at <= started_at
            except BaseException as error:
                trace['businessBoundaryErrorType'] = error_type(error)
            try:
                # finish owns restoration in its finally. Calling restore again
                # after a refusal would retry a protected kernel-setting write.
                trace.update(watcher.finish())
            except BaseException as error:
                trace['finishErrorType'] = error_type(error)
        if original_error is not None:
            original_error.native_trace = trace
            raise original_error
        if not trace['preparedBeforeBusiness'] or 'finishErrorType' in trace:
            raise NativeProbeError(trace)
        return outcome, trace
