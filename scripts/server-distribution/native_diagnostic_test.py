import json
import io
import os
import hashlib
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from native_diagnostic import safe_trace, NativeCrashWatcher, process_identity, binary_hash, node_process_pid
from run import valid_receipt, complete_reboot_checks
from core_pipe import memory_core


class TracePrivacy(unittest.TestCase):
    def test_container_init_cannot_be_registered_as_the_node_program(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'proc/100'
            expected = target / 'root/usr/local/bin/node'
            expected.parent.mkdir(parents=True)
            expected.write_bytes(b'owned Node executable')
            (target / 'task/100').mkdir(parents=True)
            children = target / 'task/100/children'
            children.write_text('101')

            def process(pid, parent, node=False):
                path = root / 'proc' / str(pid)
                path.mkdir(exist_ok=True)
                fields = ['S', str(parent)] + ['0'] * 17 + ['123']
                (path / 'stat').write_text(str(pid) + ' (private name (ignored)) ' + ' '.join(fields))
                if node:
                    os.link(expected, path / 'exe')
                else:
                    (path / 'exe').write_bytes(b'container init')

            process(100, 1)
            process(101, 100, True)
            with patch('native_diagnostic.Path', side_effect=lambda value: root / str(value).lstrip('/')):
                self.assertEqual(node_process_pid(100), 101)
                children.write_text('')
                with self.assertRaises(ValueError):
                    node_process_pid(100)
                process(102, 999, True)
                children.write_text('102')
                with self.assertRaises(ValueError):
                    node_process_pid(100)
                process(103, 100, True)
                children.write_text('101 103')
                with self.assertRaises(ValueError):
                    node_process_pid(100)
                children.write_text('101')
                (target / 'exe').unlink()
                os.link(expected, target / 'exe')
                with self.assertRaises(ValueError):
                    node_process_pid(100)
                children.write_text('')
                self.assertEqual(node_process_pid(100), 100)

    def test_each_reboot_profile_requires_actual_backend_evidence(self):
        required = ['authenticatedApiAfterReboot', 'authenticatedMcpAfterReboot',
                    'artifactBytesAfterReboot', 'newOutboxDeliveredAfterReboot']
        receipt = {'checks': [{'profile': profile, 'checks': required.copy()}
                             for profile in ['personal', 'team', 'enterprise']]}
        self.assertTrue(complete_reboot_checks(receipt))
        for profile in range(3):
            for check in required:
                missing = json.loads(json.dumps(receipt))
                missing['checks'][profile]['checks'].remove(check)
                self.assertFalse(complete_reboot_checks(missing))
        self.assertFalse(complete_reboot_checks({'checks': receipt['checks'][:2]}))
        self.assertFalse(complete_reboot_checks({'checks': [receipt['checks'][0]] * 3}))
        self.assertFalse(complete_reboot_checks({}))

    def test_kernel_settings_restore_only_successful_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            kernel = root / 'proc/sys/kernel'
            kernel.mkdir(parents=True)
            (root / 'opt/server-install').mkdir(parents=True)
            (root / 'proc/meminfo').write_text('SwapTotal: 0 kB\n')
            (kernel / 'core_pattern').write_text('original-pattern\n')
            (kernel / 'core_pipe_limit').write_text('0\n')
            original_write = Path.write_text
            writes = []
            def local_path(value):
                return root / str(value).lstrip('/')
            def reject_pattern(file, value, **kwargs):
                writes.append(file.name)
                if file.name == 'core_pattern':
                    raise PermissionError('owned fixture rejection')
                return original_write(file, value, **kwargs)
            with patch('native_diagnostic.Path', side_effect=local_path), \
                 patch('native_diagnostic.process_identity', return_value={'pid': 42}), \
                 patch.object(Path, 'write_text', reject_pattern):
                with self.assertRaises(PermissionError):
                    NativeCrashWatcher(42)
            self.assertEqual(writes, ['core_pipe_limit', 'core_pattern', 'core_pipe_limit'])
            self.assertEqual((kernel / 'core_pipe_limit').read_text(), '0\n')
            self.assertEqual((kernel / 'core_pattern').read_text(), 'original-pattern\n')

    def test_only_runtime_stack_symbols_escape(self):
        trace = safe_trace(b'Program received signal SIGSEGV\n'
                           b'#0 0x1234 in v8::internal::Runtime_Test (password=DO_NOT_PUBLISH)\n'
                           b'#1 X509_verify_cert (/private/secret.sql)\n'
                           b'Thread name node::DO_NOT_PUBLISH\n'
                           b'#2 untrusted_name (DO_NOT_PUBLISH)\n', b'DO_NOT_PUBLISH', 0)
        self.assertTrue(trace['sigsegv'])
        self.assertEqual(trace['symbols'], ['v8::internal::Runtime_Test', 'X509_verify_cert'])
        for value in ['DO_NOT_PUBLISH', 'secret.sql', '0x1234', 'untrusted_name']:
            self.assertNotIn(value, json.dumps(trace))

    def test_normal_and_denied_attach_do_not_invent_crash(self):
        trace = safe_trace(b'normal output', b'ptrace: Operation not permitted.', 1)
        self.assertFalse(trace['sigsegv'])
        self.assertTrue(trace['ptraceRejected'])
        self.assertEqual(trace['symbols'], [])
        self.assertEqual(trace['categories'], ['permissionRejected'])

    def test_debugger_failures_only_export_fixed_categories(self):
        trace = safe_trace(b'No stack.\n', b"Couldn't write extended state status: Bad address.\n"
                           b'warning: Target and debugger are in different PID namespaces.\n'
                           b'Cannot access memory at address 0x1234 DO_NOT_PUBLISH', 1)
        self.assertEqual(trace['categories'], ['registerAccessFailed', 'namespaceMismatch', 'inferiorUnavailable', 'memoryUnavailable'])
        self.assertFalse(trace['sigsegv'])
        self.assertNotIn('DO_NOT_PUBLISH', json.dumps(trace))
        self.assertNotIn('0x1234', json.dumps(trace))

    def test_collector_requires_diagnostic_mode_and_refuses_each_token_kind(self):
        receipt = {'phase': 'native-diagnostic', 'nativeTrace': {'symbols': []}}
        self.assertFalse(valid_receipt(receipt))
        self.assertTrue(valid_receipt(receipt, True))
        for kind in ['i', 'p', 's']:
            self.assertFalse(valid_receipt({**receipt, 'unsafe': 'wm' + kind + '_' + 'A' * 43}, True))
        self.assertTrue(valid_receipt({'phase': 'failure'}))
        self.assertFalse(valid_receipt({'phase': 'unknown'}, True))

    def test_core_signal_projection_and_anonymous_memory_budget(self):
        self.assertTrue(safe_trace(b'Program terminated with signal SIGSEGV.\n', b'', 0)['sigsegv'])
        raw = b'private dummy bytes'
        if not hasattr(os, 'memfd_create'):
            # Windows cannot run this guest-only capture; never fall back to a
            # disk file. Linux CI executes the real anonymous descriptor path.
            with self.assertRaises(AttributeError):
                memory_core(io.BytesIO(raw), 100)
            return
        identity = process_identity(os.getpid())
        self.assertEqual(identity['pid'], os.getpid())
        self.assertGreater(identity['startTicks'], 0)
        self.assertGreater(identity['executableInode'], 0)
        self.assertGreater(identity['executableBytes'], 0)
        self.assertEqual(len(binary_hash(os.getpid())), 64)
        descriptor, size, digest = memory_core(io.BytesIO(raw), 100)
        try:
            self.assertEqual(size, len(raw))
            self.assertEqual(digest, hashlib.sha256(raw).hexdigest())
            self.assertIn('memfd:workmesh-native-core', os.readlink('/proc/self/fd/' + str(descriptor)))
            os.lseek(descriptor, 0, os.SEEK_SET)
            self.assertEqual(os.read(descriptor, size), raw)
            with self.assertRaises(PermissionError):
                os.write(descriptor, b'untrusted mutation')
        finally:
            os.close(descriptor)
        with self.assertRaises(ValueError):
            memory_core(io.BytesIO(raw), 1)


if __name__ == '__main__':
    unittest.main()
