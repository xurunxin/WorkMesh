"""Guest-only native crash diagnosis; never a product acceptance result."""
import hashlib
import re
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
    return {'exitCode': returncode, 'stdoutSha256': hashlib.sha256(stdout).hexdigest(),
            'stderrSha256': hashlib.sha256(stderr).hexdigest(),
            'stdoutBytes': len(stdout), 'stderrBytes': len(stderr),
            'sigsegv': 'received signal SIGSEGV' in text,
            'symbols': [symbol[:160] for symbol in symbols[:40]],
            'ptraceRejected': 'Operation not permitted' in stderr.decode(errors='replace')}


class NativeDiagnosticError(RuntimeError):
    def __init__(self, trace):
        super().__init__('native debugger attachment failed')
        self.native_trace = trace


class NativeDebugger:
    def __init__(self, pid):
        assert isinstance(pid, int) and pid > 1
        self.process = subprocess.Popen(['gdb', '--nx', '--quiet', '--batch', '-iex', 'set auto-load off', '--pid', str(pid),
            '-ex', 'set pagination off', '-ex', 'set print frame-arguments none',
            '-ex', 'set print elements 0',
            '-ex', 'handle SIGPIPE SIGUSR1 SIGUSR2 SIGALRM SIGTERM nostop noprint pass',
            '-ex', 'handle SIGSEGV stop print pass',
            '-ex', 'continue', '-ex', 'thread apply all bt 12', '-ex', 'detach'],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for _ in range(30):
            status = Path('/proc') / str(pid) / 'status'
            if status.exists() and re.search(r'^TracerPid:\s+[1-9]\d*$', status.read_text(), re.M):
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
        return {**safe_trace(stdout, stderr, self.process.returncode), 'interruptedWithoutCrash': interrupted}
