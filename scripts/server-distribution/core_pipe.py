"""Parse an owned guest crash in anonymous RAM; persist only safe metadata."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import signal
import sys
import time
import re
from native_diagnostic import safe_trace, process_identity, binary_hash
from core_metadata import core_location

OWNER = Path('/opt/server-install/core-owner.json')
RESULT = Path('/root/server-install/native-core-trace.json')
MAX_BYTES = 512 * 1024 * 1024


def location_metadata(descriptor, target):
    with os.fdopen(os.dup(descriptor), 'rb') as core, target.joinpath('exe').open('rb') as binary:
        return core_location(core, binary)


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
    if len(sys.argv) != 3 or not re.fullmatch('[a-f0-9]{32}', sys.argv[2]):
        raise ValueError('native capture identity invalid')
    capture_id = sys.argv[2]
    owner_file = OWNER.with_name(OWNER.stem + '-' + capture_id + OWNER.suffix)
    result_file = RESULT.with_name(RESULT.stem + '-' + capture_id + RESULT.suffix)
    pid = int(sys.argv[1])
    owner = json.loads(owner_file.read_text())
    if owner['pid'] != pid:
        return
    def deadline(_number, _frame):
        raise TimeoutError('native core capture deadline reached')
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(90)
    began = time.monotonic()
    target = Path('/proc') / str(pid)
    result = {'naturalRun': True, 'captureId': capture_id, 'captured': False, 'coreCaptured': False, 'captureStage': 'identity'}
    descriptor = None
    try:
        # The PID is registered after checking the exact installation/container
        # identity. core_pipe_limit retains its proc entries until this exits.
        actual = process_identity(pid)
        if actual != owner:
            raise ValueError('native core process identity changed')
        result['captureStage'] = 'binary-hash'
        executable_hash = binary_hash(pid)
        result['targetBinarySha256'] = executable_hash
        result['captureStage'] = 'memory-core'
        descriptor, size, digest = memory_core(sys.stdin.buffer)
        result.update(coreCaptured=True, coreBytes=size, coreSha256=digest, captureStage='core-metadata')
        try:
            result['location'] = location_metadata(descriptor, target)
        except ValueError:
            result['locationUnavailable'] = True
        result['captureStage'] = 'debugger'
        remaining = 90 - (time.monotonic() - began) - 1
        if remaining <= 0:
            raise TimeoutError('native debugger budget exhausted')
        completed = subprocess.run(['gdb', '--nx', '--quiet', '--batch',
            '-iex', 'set auto-load off', '-iex', 'set debuginfod enabled off',
            '-iex', 'set print frame-arguments none',
            '-iex', 'set sysroot ' + str(target / 'root'), '--se', str(target / 'exe'),
            '--core', '/proc/self/fd/' + str(descriptor),
            '-ex', 'set pagination off', '-ex', 'set print frame-arguments none',
            '-ex', 'bt 12'], stdin=subprocess.DEVNULL,
            capture_output=True, pass_fds=(descriptor,), timeout=min(60, remaining))
        result.update(captured=True, captureStage='completed',
                      trace=safe_trace(completed.stdout, completed.stderr, completed.returncode))
    except subprocess.TimeoutExpired as error:
        result.update(captureErrorType='TimeoutExpired', debuggerTimedOut=True,
                      trace=safe_trace(error.output or b'', error.stderr or b'', None))
    except Exception as error:
        result['captureErrorType'] = type(error).__name__
    finally:
        signal.alarm(0)
        result['captureElapsedMilliseconds'] = round((time.monotonic() - began) * 1000)
        if descriptor is not None:
            os.close(descriptor)
        temporary = result_file.with_name(result_file.name + '.' + str(os.getpid()) + '.tmp')
        with temporary.open('x') as output:
            os.chmod(temporary, 0o600)
            json.dump(result, output)
        os.replace(temporary, result_file)


if __name__ == '__main__':
    main()
