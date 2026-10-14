"""Parse an owned guest crash in anonymous RAM; persist only safe metadata."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import signal
import sys
from native_diagnostic import safe_trace, process_identity, binary_hash

OWNER = Path('/opt/server-install/core-owner.json')
RESULT = Path('/root/server-install/native-core-trace.json')
MAX_BYTES = 512 * 1024 * 1024


def memory_core(stream, maximum=MAX_BYTES):
    descriptor = os.memfd_create('workmesh-native-core', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    digest, size = hashlib.sha256(), 0
    try:
        while block := stream.read(1024 * 1024):
            size += len(block)
            if size > maximum:
                raise ValueError('native core memory budget reached')
            digest.update(block)
            view = memoryview(block)
            while view:
                written = os.write(descriptor, view)
                view = view[written:]
        import fcntl
        fcntl.fcntl(descriptor, fcntl.F_ADD_SEALS,
                    fcntl.F_SEAL_WRITE | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SEAL)
        return descriptor, size, digest.hexdigest()
    except BaseException:
        os.close(descriptor)
        raise


def main():
    pid = int(sys.argv[1])
    owner = json.loads(OWNER.read_text())
    if owner['pid'] != pid:
        return
    def deadline(_number, _frame):
        raise TimeoutError('native core capture deadline reached')
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(90)
    target = Path('/proc') / str(pid)
    result = {'naturalRun': True, 'captured': False}
    descriptor = None
    try:
        # The PID is registered after checking the exact installation/container
        # identity. core_pipe_limit retains its proc entries until this exits.
        actual = process_identity(pid)
        if actual != owner:
            raise ValueError('native core process identity changed')
        executable_hash = binary_hash(pid)
        descriptor, size, digest = memory_core(sys.stdin.buffer)
        completed = subprocess.run(['gdb', '--nx', '--quiet', '--batch',
            '-iex', 'set auto-load off', '-iex', 'set debuginfod enabled off',
            '-iex', 'set print frame-arguments none',
            '-iex', 'set sysroot ' + str(target / 'root'), '--se', str(target / 'exe'),
            '--core', '/proc/self/fd/' + str(descriptor),
            '-ex', 'set pagination off', '-ex', 'set print frame-arguments none',
            '-ex', 'thread apply all bt 12'], stdin=subprocess.DEVNULL,
            capture_output=True, pass_fds=(descriptor,), timeout=60)
        result.update(captured=True, coreBytes=size, coreSha256=digest,
                      targetBinarySha256=executable_hash,
                      trace=safe_trace(completed.stdout, completed.stderr, completed.returncode))
    except Exception as error:
        result['captureErrorType'] = type(error).__name__
    finally:
        signal.alarm(0)
        if descriptor is not None:
            os.close(descriptor)
        temporary = RESULT.with_name(RESULT.name + '.' + str(os.getpid()) + '.tmp')
        with temporary.open('x') as output:
            os.chmod(temporary, 0o600)
            json.dump(result, output)
        os.replace(temporary, RESULT)


if __name__ == '__main__':
    main()
