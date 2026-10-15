import json
import io
import os
import hashlib
import unittest
import tempfile
import ast
import re
import struct
from types import SimpleNamespace
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
from native_diagnostic import safe_trace, NativeCrashWatcher, process_identity, binary_hash, node_process_pid
from run import valid_receipt, complete_reboot_checks
from core_pipe import memory_core
from core_metadata import core_location
import core_pipe


class ProxyProgress(unittest.TestCase):
    @staticmethod
    def environment():
        source = Path(__file__).with_name('guest.py').read_text(encoding='utf8')
        nodes = [node for node in ast.parse(source).body if isinstance(node, (ast.ClassDef, ast.FunctionDef))
                 and node.name in {'McpProxyProgress', 'proxy'}]
        # The HTTP test uses plain loopback sockets; TLS trust is not under test.
        context = SimpleNamespace(load_cert_chain=lambda *_: None, wrap_socket=lambda sock, **_: sock)
        def loopback_server(address, handler):
            assert address == ('0.0.0.0', 0)
            return ThreadingHTTPServer(('127.0.0.1', 0), handler)
        env = {'threading': threading, 'time': time, 'deque': deque,
               'BaseHTTPRequestHandler': BaseHTTPRequestHandler, 'ThreadingHTTPServer': loopback_server,
               'http': SimpleNamespace(client=http.client),
               'ssl': SimpleNamespace(SSLContext=lambda _: context, PROTOCOL_TLS_SERVER=0)}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), '<proxy-progress>', 'exec'), env)
        return env

    def test_bounded_concurrent_progress_never_exports_error_body_or_identity(self):
        observer = self.environment()['McpProxyProgress']()
        private = 'wmi_' + 'x' * 43
        def observe(_):
            token = observer.begin()
            observer.update(token, 'upstream-headers', 200)
            observer.failure(token, TimeoutError(private))
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(observe, range(140)))
        value = observer.snapshot()
        self.assertEqual(value['requestsObserved'], 128)
        self.assertTrue(value['truncated'])
        self.assertEqual(len(value['requests']), 8)
        self.assertEqual([row['sequence'] for row in value['requests']], list(range(121, 129)))
        self.assertTrue(all(row['failed'] and row['errorType'] == 'TimeoutError' for row in value['requests']))
        self.assertNotIn(private, json.dumps(value))
        value['requests'][0]['stage'] = private
        self.assertNotIn(private, json.dumps(observer.snapshot()))

    def test_unknown_stage_status_and_error_type_cannot_enter_projection(self):
        observer = self.environment()['McpProxyProgress']()
        token = observer.begin()
        with self.assertRaises(ValueError):
            observer.update(token, 'private-stage')
        for status in [True, 'private-status', 99, 600]:
            with self.assertRaises(ValueError):
                observer.update(token, 'upstream-headers', status)
        class PrivateError(Exception):
            pass
        observer.failure(token, PrivateError('private-message'))
        self.assertEqual(observer.snapshot()['requests'][0]['errorType'], 'OtherError')
        self.assertNotIn('private', json.dumps(observer.snapshot()))

    def test_real_http_identifies_waiting_for_body_and_preserves_single_request(self):
        env = self.environment()
        release, headers, complete = threading.Event(), threading.Event(), threading.Event()
        requests = []
        private = 'wmi_' + 'x' * 43
        class Upstream(BaseHTTPRequestHandler):
            def do_POST(self):
                requests.append(self.rfile.read(int(self.headers['content-length'])))
                self.send_response(200)
                self.send_header('Content-Length', '100')
                self.end_headers()
                self.wfile.write(b'x')
                self.wfile.flush()
                release.wait(5)
                self.wfile.write(b'y' * 99)
            def log_message(self, *_):
                pass
        upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        thread = threading.Thread(target=upstream.serve_forever, daemon=True)
        thread.start()
        server = env['proxy'](0, upstream.server_port, Path('/unused-test-ca'))
        observer = server.workmesh_mcp_progress
        update = observer.update
        def observed_update(token, stage, status=None):
            update(token, stage, status)
            if stage == 'upstream-headers':
                headers.set()
            if stage == 'client-complete':
                complete.set()
        observer.update = observed_update
        def request():
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
            try:
                connection.request('POST', '/mcp', private, {'X-WorkMesh-Installation-Token': private})
                reply = connection.getresponse()
                return reply.status, reply.read()
            finally:
                connection.close()
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(request)
                try:
                    self.assertTrue(headers.wait(3))
                    snapshot = observer.snapshot()
                    self.assertEqual(snapshot['requests'][0]['stage'], 'upstream-headers')
                    self.assertEqual(snapshot['requests'][0]['upstreamStatus'], 200)
                    self.assertFalse(future.done())
                    self.assertNotIn(private, json.dumps(snapshot))
                finally:
                    release.set()
                self.assertEqual(future.result(timeout=3), (200, b'x' + b'y' * 99))
                self.assertTrue(complete.wait(3))
                self.assertEqual(observer.snapshot()['requests'][0]['stage'], 'client-complete')
                self.assertEqual(requests, [private.encode()])
        finally:
            release.set()
            server.shutdown()
            server.server_close()
            upstream.shutdown()
            upstream.server_close()
            thread.join(timeout=3)
            self.assertFalse(thread.is_alive())


class CoreMetadata(unittest.TestCase):
    def test_debugger_stage_projection_only_accepts_exact_public_markers(self):
        private = 'wmi_' + 'x' * 43
        value = safe_trace(('WORKMESH_NATIVE_PHASE:before-binary\n'
            'WORKMESH_NATIVE_PHASE:after-binary\n'
            'WORKMESH_NATIVE_PHASE:after-binary\n'
            'WORKMESH_NATIVE_PHASE:after-core:' + private + '\n'
            'WORKMESH_NATIVE_PHASE:' + private + '\n').encode(), b'', None)
        self.assertEqual(value['debuggerStages'], ['before-binary', 'after-binary'])
        self.assertNotIn(private, json.dumps(value))

    def test_unknown_capture_identity_rejects_before_reading_an_owner_file(self):
        for value in ['../private', 'a' * 31, 'a' * 33, 'G' * 32]:
            with patch.object(core_pipe.sys, 'argv', ['core_pipe.py', '12345', value]), \
                 patch.object(core_pipe, 'OWNER') as owner:
                with self.assertRaises(ValueError):
                    core_pipe.main()
                owner.with_name.assert_not_called()

    @staticmethod
    def fixture(machine=62, mapped_name=b'/usr/local/bin/node', page_offset=0):
        private = ('wmi_' + 'x' * 43).encode()
        start, pc_offset = 0x7F0000000000, 0x1234 - page_offset * 4096
        status = bytearray(336 if machine == 62 else 392)
        struct.pack_into('<h', status, 12, 11)
        struct.pack_into('<Q', status, 112 + (16 if machine == 62 else 32) * 8, start + pc_offset)
        def note(tag, data):
            name = b'CORE\0'
            return (struct.pack('<III', len(name), len(data), tag) + name + b'\0' * 3
                    + data + b'\0' * ((-len(data)) % 4))
        notes = note(1, status) + note(3, private) + note(0x53494749, struct.pack('<iii', 11, 0, 1) + private)
        notes += note(0x46494C45, struct.pack('<QQQQQ', 1, 4096, start, start + 0x4000, page_offset) + mapped_name + b'\0')
        def elf(kind, offset, length, flags, virtual):
            header = struct.pack('<16sHHIQQQIHHHHHH', b'\x7fELF\x02\x01\x01' + b'\0' * 9,
                kind, machine, 1, 0, 64, 0, 0, 64, 56, 1, 64, 0, 0)
            return header + struct.pack('<IIQQQQQQ', 4 if kind == 4 else 1, flags, offset, virtual, 0, length, length, 4096)
        core = elf(4, 120, len(notes), 0, 0) + notes
        binary = elf(3, 0, 0x4000, 5, 0x400000).ljust(0x4000, b'\0')
        return core, binary, private, start + pc_offset

    def test_two_architectures_map_only_public_node_relative_offsets(self):
        for machine in [62, 183]:
            for pages in [0, 1]:
                with self.subTest(machine=machine, pages=pages):
                    core, binary, private, pc = self.fixture(machine, page_offset=pages)
                    value = core_location(io.BytesIO(core), io.BytesIO(binary))
                    self.assertEqual(value, {'architecture': 'amd64' if machine == 62 else 'arm64',
                        'signal': 11, 'signalCode': 1, 'faultModule': 'node', 'executableSegment': True,
                        'nodeFileOffset': 0x1234, 'nodeElfAddress': 0x401234,
                        'publicFrameChain': {'method': 'frame-pointers', 'frames': [], 'stopped': 'stack-unavailable'}})
                    output = json.dumps(value)
                    self.assertNotIn(private.decode(), output)
                    self.assertNotIn(str(pc), output)
                    self.assertNotIn('/usr/local', output)

    @classmethod
    def frame_fixture(cls, machine=62, depth=2):
        core, binary, private, _ = cls.fixture(machine)
        notes = bytearray(core[120:])
        stack = 0x7E0000000000
        sp, fp = stack + 0x100, stack + 0x120
        for register, value in [(19 if machine == 62 else 31, sp), (4 if machine == 62 else 29, fp)]:
            struct.pack_into('<Q', notes, 20 + 112 + register * 8, value)
        header = bytearray(core[:64]); struct.pack_into('<H', header, 56, 2)
        stack_offset = (176 + len(notes) + 4095) & ~4095
        note_header = struct.pack('<IIQQQQQQ', 4, 0, 176, 0, 0, len(notes), len(notes), 4)
        stack_header = struct.pack('<IIQQQQQQ', 1, 6, stack_offset, stack, 0, 8192, 8192, 4096)
        payload = bytearray((private * 200)[:8192].ljust(8192, b'x'))
        for index in range(depth + 1):
            current = fp + index * 0x40
            target = 0x7F0000000000 + 0x2345 + index if index < depth else 0x5E0000000000
            struct.pack_into('<QQ', payload, current-stack, current+0x40, target)
        value = bytes(header) + note_header + stack_header + notes
        return value.ljust(stack_offset, b'\0') + payload, binary, private, sp, fp

    def test_public_frame_chain_both_architectures_does_not_export_stack_values(self):
        for machine in [62, 183]:
            core, binary, private, sp, fp = self.frame_fixture(machine)
            value = core_location(io.BytesIO(core), io.BytesIO(binary))
            self.assertEqual(value['publicFrameChain'], {'method': 'frame-pointers',
                'frames': [{'lookupNodeElfAddress': 0x402344, 'returnSiteNodeElfAddress': 0x402345},
                           {'lookupNodeElfAddress': 0x402345, 'returnSiteNodeElfAddress': 0x402346}],
                'stopped': 'caller-outside-public-node'})
            output = json.dumps(value)
            for forbidden in [private.decode(), str(sp), str(fp), str(0x7F0000002345), str(0x5E0000000000)]:
                self.assertNotIn(forbidden, output)

    def test_frame_chain_invalid_links_and_uncaptured_stack_stop_without_guessing(self):
        core, binary, _, sp, fp = self.frame_fixture()
        stack_offset = struct.unpack_from('<Q', core, 128)[0]
        cases = []
        for invalid in [sp-16, fp+1, fp+1024*1024]:
            changed = bytearray(core); struct.pack_into('<Q', changed, 176+20+112+4*8, invalid)
            cases.append((changed, 'frame-link-invalid'))
        for invalid in [fp, fp-16, fp+8]:
            changed = bytearray(core); struct.pack_into('<Q', changed, stack_offset+0x120, invalid)
            cases.append((changed, 'frame-link-invalid'))
        changed = bytearray(core); struct.pack_into('<Q', changed, 120+32, 0x100)
        cases.append((changed, 'stack-bytes-not-captured'))
        for changed, reason in cases:
            with self.subTest(reason=reason):
                chain = core_location(io.BytesIO(changed), io.BytesIO(binary))['publicFrameChain']
                self.assertEqual(chain['frames'], [])
                self.assertEqual(chain['stopped'], reason)

    def test_frame_chain_has_an_explicit_twelve_frame_budget(self):
        core, binary, _, _, _ = self.frame_fixture(depth=16)
        chain = core_location(io.BytesIO(core), io.BytesIO(binary))['publicFrameChain']
        self.assertEqual(len(chain['frames']), 12)
        self.assertEqual(chain['stopped'], 'depth-limit')

    def test_public_caller_requires_one_exact_node_mapping_and_executable_bytes(self):
        from core_metadata import _public_position
        start = 0x7F0000000000
        mapping = (start, start+0x4000, (0, 4096), b'/usr/local/bin/node')
        segment = (1, 5, 0, 0x400000, 0, 0x4000, 0x4000, 4096)
        self.assertEqual(_public_position(start+0x2344, [mapping], [segment], 0x4000), 0x402344)
        for mappings, segments in [
            ([mapping, (start+0x2300, start+0x2400, (0, 4096), b'/private/path')], [segment]),
            ([(start, start+0x4000, (0, 4096), b'/private/node')], [segment]),
            ([mapping], [(1, 6, *segment[2:])]),
            ([(start, start+0x4000, (2**63, 4096), b'/usr/local/bin/node')], [segment]),
        ]:
            self.assertIsNone(_public_position(start+0x2344, mappings, segments, 0x4000))

    def test_ambiguous_stack_mapping_is_not_used_for_a_frame_chain(self):
        core, binary, _, _, _ = self.frame_fixture()
        header = bytearray(core[:64]); struct.pack_into('<H', header, 56, 3)
        note_header = bytearray(core[64:120]); struct.pack_into('<Q', note_header, 8, 232)
        stack_header = bytearray(core[120:176])
        struct.pack_into('<Q', stack_header, 8, struct.unpack_from('<Q', stack_header, 8)[0]+56)
        changed = bytes(header)+note_header+stack_header+stack_header+core[176:]
        chain = core_location(io.BytesIO(changed), io.BytesIO(binary))['publicFrameChain']
        self.assertEqual(chain, {'method': 'frame-pointers', 'frames': [], 'stopped': 'stack-unavailable'})

    def test_unmapped_or_private_module_never_exports_paths_addresses_or_memory(self):
        core, _, private, pc = self.fixture(mapped_name=b'/private/' + b'wmi_' + b'x' * 43)
        value = core_location(io.BytesIO(core), io.BytesIO(b''))
        self.assertEqual(value['faultModule'], 'other-or-unmapped')
        self.assertNotIn(private.decode(), json.dumps(value))
        self.assertNotIn(str(pc), json.dumps(value))
        self.assertNotIn('nodeElfAddress', value)

    def test_truncation_format_bounds_and_binary_architecture_are_not_guessed(self):
        core, binary, _, _ = self.fixture()
        invalid_offset = bytearray(core); struct.pack_into('<Q', invalid_offset, 32, 2**63)
        invalid_class = bytearray(core); invalid_class[4] = 1
        _, wrong_binary, _, _ = self.fixture(183)
        for bad_core, bad_binary in [(core[:-1], binary), (invalid_offset, binary),
                                      (invalid_class, binary), (core, wrong_binary)]:
            with self.assertRaises(ValueError):
                core_location(io.BytesIO(bad_core), io.BytesIO(bad_binary))

    def test_debugger_timeout_keeps_core_metadata_and_only_safe_partial_output(self):
        base = (Path.cwd() / '.tmp').resolve()
        self.assertTrue(base.is_relative_to(Path.cwd().resolve()))
        base.mkdir(exist_ok=True)
        root = Path(tempfile.mkdtemp(prefix='ta01-core-timeout-', dir=base)).resolve()
        self.assertTrue(root.is_relative_to(base))
        capture_id = 'c' * 32
        owner_base, result_base = root / 'owner.json', root / 'result.json'
        owner_file, result_file = root / ('owner-' + capture_id + '.json'), root / ('result-' + capture_id + '.json')
        temporary = result_file.with_name(result_file.name + '.' + str(os.getpid()) + '.tmp')
        owner = {'pid': 12345}
        owner_file.write_text(json.dumps(owner), encoding='utf8')
        private = 'wmi_' + 'x' * 43
        timeout = __import__('subprocess').TimeoutExpired('gdb', 60,
            output=('Program terminated with signal SIGSEGV.\n#0 0x123 in v8::internal::Probe(' + private + ') at /private/file.cc:2\n').encode(),
            stderr=private.encode())
        try:
            with tempfile.TemporaryFile() as synthetic:
                descriptor = os.dup(synthetic.fileno())
                with patch.object(core_pipe, 'OWNER', owner_base), patch.object(core_pipe, 'RESULT', result_base), \
                     patch.object(core_pipe.sys, 'argv', ['core_pipe.py', '12345', capture_id]), \
                     patch.object(core_pipe.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(b'synthetic'))), \
                     patch.object(core_pipe.signal, 'SIGALRM', 999, create=True), \
                     patch.object(core_pipe.signal, 'signal'), patch.object(core_pipe.signal, 'alarm', create=True) as alarm, \
                     patch.object(core_pipe, 'process_identity', return_value=owner), \
                     patch.object(core_pipe, 'binary_hash', return_value='b' * 64), \
                     patch.object(core_pipe, 'memory_core', return_value=(descriptor, 9, 'a' * 64)), \
                     patch.object(core_pipe, 'location_metadata', return_value={'signal': 11}), \
                     patch.object(core_pipe.subprocess, 'run', side_effect=timeout) as run, \
                     patch.object(core_pipe.os, 'close', wraps=os.close) as close:
                    core_pipe.main()
                    close.assert_called_once_with(descriptor)
                    self.assertEqual([call.args[0] for call in alarm.call_args_list], [90, 0])
                    self.assertEqual(run.call_args.kwargs['timeout'], 60)
                    self.assertIn('bt 12', run.call_args.args[0])
                    self.assertIn('set auto-solib-add off', run.call_args.args[0])
                    self.assertNotIn('--readnever', run.call_args.args[0])
                    command = run.call_args.args[0]
                    self.assertLess(command.index('file ' + str(Path('/proc') / str(owner['pid']) / 'exe')),
                                    command.index('core-file /proc/self/fd/' + str(descriptor)))
                    self.assertNotIn('thread apply all bt 12', run.call_args.args[0])
            value = json.loads(result_file.read_text(encoding='utf8'))
            self.assertEqual(value['captureId'], capture_id)
            self.assertIsInstance(value['handlerStartedUtcEpoch'], float)
            self.assertGreater(value['handlerStartedUtcEpoch'], 0)
            self.assertTrue(value['coreCaptured'])
            self.assertFalse(value['captured'])
            self.assertEqual(value['coreBytes'], 9)
            self.assertEqual(value['targetBinarySha256'], 'b' * 64)
            self.assertTrue(value['debuggerTimedOut'])
            self.assertTrue(value['trace']['sigsegv'])
            self.assertEqual(value['trace']['symbols'], ['v8::internal::Probe'])
            self.assertNotIn(private, json.dumps(value))
            self.assertNotIn('/private', json.dumps(value))
        finally:
            for file in [owner_file, result_file, temporary]:
                if file.exists():
                    self.assertFalse(file.is_symlink())
                    file.unlink()
            root.rmdir()


class GuestFailureProgress(unittest.TestCase):
    @staticmethod
    def marker(name='failure_progress'):
        # Load only the pure projection; importing guest.py creates guest paths.
        source = ast.parse(Path(__file__).with_name('guest.py').read_text(encoding='utf8'))
        function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == name)
        scope = {'json': json, 're': re}
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'guest-projection', 'exec'), scope)
        return scope[name]

    def test_database_budget_reports_only_aggregates_and_rejects_private_or_invalid_data(self):
        project = self.marker('project_database_budget')
        self.assertEqual(project(b'20|17|off\n'), {'maxConnections': 20,
            'backendsIncludingDiagnostic': 17, 'trackActivitiesEnabled': False})
        for raw in [b'20|21|on', b'0|0|off', b'20|0|off', b'20|17|off|private', ('wmi_' + 'x' * 43).encode()]:
            with self.assertRaises(ValueError):
                project(raw)

    def test_installer_phase_timings_reject_private_or_malformed_output_and_bound_records(self):
        project = self.marker('installer_timings')
        context = {'tag': 'ta01-install-action', 'sequence': 1, 'profile': 'personal', 'action': 'commit'}
        known = {'phase': 'validate-business-read', 'elapsedMilliseconds': 30, 'userCpuMicroseconds': 12, 'systemCpuMicroseconds': 3}
        private = 'wmi_' + 'x' * 43
        records = [b'private stderr ' + private.encode(), b'INSTALL_TIMING {invalid',
                   *[('INSTALL_TIMING ' + json.dumps(value)).encode() for value in [
                       {**known, 'phase': []}, {**known, 'phase': private}, {**known, 'private': private},
                       {**known, 'elapsedMilliseconds': -1}, {**known, 'userCpuMicroseconds': True}]],
                   *[('INSTALL_TIMING ' + json.dumps(known)).encode()] * 20]
        output = io.StringIO()
        with redirect_stdout(output):
            project(b'\n'.join(records), context)
        values = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(values), 16)
        self.assertEqual(values[0], {**context, 'tag': 'ta01-installer-phase', **known})
        self.assertNotIn(private, output.getvalue())
        self.assertFalse(valid_receipt(values[0]))
        output = io.StringIO()
        with redirect_stdout(output):
            project(b'\n'.join(records), {**context, 'sequence': 129})
            project(b'\n'.join(records), {**context, 'environment': private})
        self.assertEqual(output.getvalue(), '')

    def test_failure_is_visible_before_classification_without_private_fields(self):
        marker = self.marker()
        private = 'wmi_' + 'x' * 43
        original = RuntimeError(private)
        output = io.StringIO()
        with self.assertRaises(RuntimeError) as caught, redirect_stdout(output):
            try:
                raise original
            except RuntimeError as error:
                marker('caught', error, {'command': private, 'exitCode': 1, 'stderrSha256': 'a' * 64,
                    'codes': ['INSTALL_BUSINESS_VALIDATION_FAILED', 'INSTALL_BUSINESS_VALIDATION_TIMEOUT', private], 'environment': private, 'path': private})
                # The original failure survives even if a later classifier never runs.
                raise
        self.assertIs(caught.exception, original)
        value = json.loads(output.getvalue())
        self.assertNotIn(private, output.getvalue())
        self.assertEqual(value, {'tag': 'ta01-failure', 'stage': 'caught', 'errorType': 'RuntimeError',
            'exitCode': 1, 'stderrSha256': 'a' * 64, 'codes': ['INSTALL_BUSINESS_VALIDATION_FAILED', 'INSTALL_BUSINESS_VALIDATION_TIMEOUT']})
        self.assertFalse(valid_receipt(value))

    def test_journal_and_owned_states_keep_machine_facts_and_bound_output(self):
        marker = self.marker()
        private = 'private arguments and environment'
        state = {'service': 'mcp', 'running': False, 'oom': False, 'exitCode': 139, 'restarts': 1,
                 'health': 'unhealthy', 'environment': private, 'id': private}
        journal = {'stage': 'healthy', 'actions': [{'name': 'validate-business-read', 'status': 'failed', 'message': private}]}
        output = io.StringIO()
        with redirect_stdout(output):
            marker('journal', RuntimeError(private), {}, journal=journal)
            marker('owned-states', RuntimeError(private), {}, journal=journal, containers=[state] * 12)
        values = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(values[0]['lastAction'], 'validate-business-read')
        self.assertEqual(values[0]['lastActionStatus'], 'failed')
        self.assertEqual(len(values[1]['containers']), 8)
        self.assertEqual(values[1]['containers'][0], {key: state[key] for key in ['service', 'running', 'oom', 'exitCode', 'restarts', 'health']})
        self.assertNotIn(private, output.getvalue())

    def test_unknown_fields_are_not_exported_and_unknown_stage_writes_nothing(self):
        marker = self.marker()
        class PrivateError(Exception):
            pass
        output = io.StringIO()
        with redirect_stdout(output):
            marker('journal', PrivateError('private'), {'codes': None, 'exitCode': 'private'},
                   journal={'stage': 'private', 'actions': ['private']}, containers=[{'service': 'private'}])
        value = json.loads(output.getvalue())
        self.assertEqual(value['errorType'], 'OtherError')
        self.assertEqual(value['journalStage'], 'unknown')
        self.assertEqual(value['lastAction'], 'unknown')
        self.assertEqual(value['containers'], [])
        output = io.StringIO()
        with redirect_stdout(output), self.assertRaises(AssertionError):
            marker('private', RuntimeError('private'), {})
        self.assertEqual(output.getvalue(), '')


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

    def test_single_configuration_requires_its_own_complete_reboot_evidence(self):
        required = ['authenticatedApiAfterReboot', 'authenticatedMcpAfterReboot',
                    'artifactBytesAfterReboot', 'newOutboxDeliveredAfterReboot']
        for profile in ['personal', 'team', 'enterprise']:
            receipt = {'checks': [{'profile': profile, 'checks': required.copy()}]}
            self.assertTrue(complete_reboot_checks(receipt, [profile]))
            self.assertFalse(complete_reboot_checks(receipt))
            for other in set(['personal', 'team', 'enterprise']) - {profile}:
                self.assertFalse(complete_reboot_checks(receipt, [other]))
            for check in required:
                missing = {'checks': [{'profile': profile, 'checks': [name for name in required if name != check]}]}
                self.assertFalse(complete_reboot_checks(missing, [profile]))
        for profiles in [[], ['unknown'], ['personal', 'personal'], [['personal']], True]:
            self.assertFalse(complete_reboot_checks({'checks': []}, profiles))

    def test_unknown_profile_argument_is_rejected_before_creating_a_guest_root(self):
        import subprocess
        import sys
        import uuid
        root = Path(__file__).resolve().parents[2] / '.tmp' / ('ta01-invalid-profile-' + uuid.uuid4().hex)
        self.assertFalse(root.exists())
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('run.py')), '--arch', 'amd64',
            '--profile', 'unknown', '--root', str(root), '--artifacts', str(root), '--source', 'a' * 40],
            capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(root.exists())

    def test_guest_reboot_branch_starts_and_reports_only_the_requested_profiles(self):
        source = Path(__file__).with_name('guest.py').read_text(encoding='utf8')
        main = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == 'main')
        body = next(node for node in main.body if isinstance(node, ast.Try)).body
        branch = [node for node in body if isinstance(node, ast.If) and isinstance(node.test, ast.Name)
                  and node.test.id == 'rebooted'][-1]
        required = ['authenticatedApiAfterReboot', 'authenticatedMcpAfterReboot',
                    'artifactBytesAfterReboot', 'newOutboxDeliveredAfterReboot']
        for profiles in [['personal'], ['team'], ['enterprise'], ['personal', 'team', 'enterprise']]:
            for rebooted in [False, True]:
                reports, starts, stored = [], [], []
                saved = {'profiles': [{'profile': name, 'status': 'passed', 'identity': 'private-identity'} for name in profiles]}
                env = {'profiles': profiles.copy(), 'saved': saved, 'rebooted': rebooted,
                       'ROOT': Path('/owned'), 'STATE': Path('/owned/state.json'), 'boot': 'boot-id',
                       'resources': {}, 'samples': [], 'report': reports.append,
                       'command': lambda _: 'kernel', 'compose': lambda *args: starts.append(args),
                       'private': lambda *args: stored.append(args),
                       'reboot_checks': [{'profile': name, 'checks': required.copy()} for name in profiles]}
                with patch.object(Path, 'touch') as touch:
                    exec(compile(ast.Module(body=[branch], type_ignores=[]), '<guest-reboot-scope>', 'exec'), env)
                    self.assertEqual(touch.call_count, 0 if rebooted else 1)
                self.assertEqual(len(reports), 1)
                self.assertEqual(reports[0]['profilesRequested'], profiles)
                self.assertNotIn('private-identity', json.dumps(reports[0]))
                if rebooted:
                    self.assertEqual(starts, [])
                    self.assertEqual(stored, [])
                    self.assertEqual(reports[0]['restartedProfiles'], profiles)
                    self.assertTrue(complete_reboot_checks(reports[0], profiles))
                else:
                    self.assertEqual([str(args[0]) for args in starts], [str(Path('/owned') / name) for name in profiles])
                    self.assertEqual(stored, [(Path('/owned/state.json'), saved)])
                    self.assertEqual([row['profile'] for row in reports[0]['profiles']], profiles)
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

    def test_sequential_real_watchers_have_distinct_owner_and_result_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            kernel = root / 'proc/sys/kernel'
            kernel.mkdir(parents=True)
            (root / 'opt/server-install').mkdir(parents=True)
            (root / 'root/server-install').mkdir(parents=True)
            (root / 'proc/meminfo').write_text('SwapTotal: 0 kB\n')
            (kernel / 'core_pattern').write_text('original-pattern\n')
            (kernel / 'core_pipe_limit').write_text('0\n')
            def local_path(value):
                return root / str(value).lstrip('/')
            with patch('native_diagnostic.Path', side_effect=local_path), \
                 patch('native_diagnostic.process_identity', side_effect=lambda pid: {'pid': pid}), \
                 patch('native_diagnostic.time.sleep'):
                first = NativeCrashWatcher(42)
                first.result.write_text(json.dumps({'captureId': first.capture_id, 'naturalRun': True, 'captured': True}))
                self.assertTrue(first.finish()['coreObserved'])
                second = NativeCrashWatcher(43)
                self.assertNotEqual(first.capture_id, second.capture_id)
                self.assertNotEqual(first.result, second.result)
                trace = second.finish()
                self.assertFalse(trace['captured'])
                self.assertFalse(trace['coreObserved'])
                self.assertTrue(first.result.exists())
                self.assertEqual(trace['registeredTarget'], {'pid': 43})
            self.assertEqual(len(list((root / 'opt/server-install').glob('core-owner-*.json'))), 2)
            self.assertEqual((kernel / 'core_pattern').read_text(), 'original-pattern\n')
            self.assertEqual((kernel / 'core_pipe_limit').read_text(), '0\n')

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


from native_diagnostic import NativeProbeError, observe_native_action


class Watcher:
    def __init__(self, failure=None):
        self.finished = 0
        self.failure = failure

    def finish(self):
        self.finished += 1
        if self.failure:
            raise self.failure
        return {'naturalRun': True, 'captured': False}


class ProbeBoundary(unittest.TestCase):
    def test_native_core_is_terminal_even_when_the_original_command_returned_success(self):
        watcher = Watcher()
        def finish():
            watcher.finished += 1
            return {'naturalRun': True, 'captured': False, 'coreCaptured': True, 'coreObserved': True,
                    'captureErrorType': 'TimeoutExpired'}
        watcher.finish = finish
        calls = []
        with self.assertRaises(NativeProbeError) as caught:
            observe_native_action(lambda: calls.append('original') or 'installed', lambda: watcher, lambda: 10**12)
        self.assertEqual(calls, ['original'])
        self.assertEqual(watcher.finished, 1)
        self.assertTrue(caught.exception.native_trace['coreObserved'])
        self.assertTrue(caught.exception.native_trace['operationSucceeded'])

    def test_every_profile_stage_is_exactly_one_original_action_and_one_restoration(self):
        for profile in ['personal', 'team', 'enterprise']:
            for stage in ['initial', 'upgrade', 'rollback']:
                watcher = Watcher()
                calls = []
                def action():
                    calls.append('original')
                    return {'status': 'installed'}
                result, trace = observe_native_action(action, lambda: watcher, lambda: 10**12,
                    target=profile + '-' + stage + '-commit')
                self.assertEqual(result, {'status': 'installed'})
                self.assertEqual(calls, ['original'])
                self.assertEqual(watcher.finished, 1)
                self.assertEqual(trace['target'], profile + '-' + stage + '-commit')
                self.assertTrue(trace['preparedBeforeBusiness'])

    def test_unknown_observation_window_rejects_before_preparation_or_business(self):
        calls = []
        with self.assertRaises(ValueError):
            observe_native_action(lambda: calls.append('business'), lambda: calls.append('prepare'),
                                  lambda: 10**12, target='private-unknown-commit')
        self.assertEqual(calls, [])

    def test_ordinary_commit_preserves_parameters_and_never_prepares_or_reports(self):
        source = Path(__file__).with_name('guest.py').read_text(encoding='utf8')
        function = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)
                        and node.name == 'commit_candidate')
        calls = []
        result = {'status': 'installed'}
        def install(*args, **kwargs):
            calls.append((args, kwargs))
            return result
        def forbidden(*_):
            raise AssertionError('ordinary mode cannot observe or report')
        env = {'install': install, 'prepare_native_watcher': forbidden, 'report': forbidden}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<ordinary-commit>', 'exec'), env)
        prefix = Path('/owned/personal')
        actual = env['commit_candidate']('bundle', 'digest', prefix, 'config', {}, 'initial')
        self.assertIs(actual, result)
        self.assertEqual(calls, [(('bundle', 'digest', prefix, 'config', 'commit'),
                                 {'extra': ['--validation', str(prefix / 'validation.json')]})])

    def test_native_commit_retains_failed_history_and_observes_only_this_appended_intent(self):
        from datetime import datetime
        source = Path(__file__).with_name('guest.py').read_text(encoding='utf8')
        function = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)
                        and node.name == 'commit_candidate')
        watcher, actions, reports = Watcher(), [], []
        history = {'id': 'owned-journal', 'actions': [{'name': 'validate-business-read',
            'startedAt': '2000-01-01T00:00:00Z', 'status': 'failed'}]}
        class Journal:
            def read_text(self):
                return json.dumps(history)
        class Prefix:
            name = 'enterprise'
            def __truediv__(self, name):
                return Journal() if name == 'journal.json' else Path('/owned/enterprise') / name
        def install(*args, **kwargs):
            actions.append((args, kwargs))
            history['actions'].append({'name': 'validate-business-read',
                'startedAt': '2099-01-01T00:00:00Z', 'status': 'completed'})
            return {'status': 'installed'}
        env = {'install': install, 'prepare_native_watcher': lambda *_: watcher,
               'report': reports.append, 'json': json, 'datetime': datetime}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<native-commit>', 'exec'), env)
        result = env['commit_candidate']('bundle', 'digest', Prefix(), 'config', {}, 'rollback', native_diagnostic=True)
        self.assertEqual(result, {'status': 'installed'})
        self.assertEqual(len(actions), 1)
        self.assertEqual(watcher.finished, 1)
        self.assertEqual(len(reports), 1)
        self.assertTrue(reports[0]['windowComplete'])
        self.assertEqual(reports[0]['nativeTrace']['target'], 'enterprise-rollback-commit')
        self.assertFalse(reports[0]['nativeTrace']['captured'])
        self.assertTrue(valid_receipt(reports[0], True))
        self.assertFalse(valid_receipt(reports[0], False))
        self.assertEqual(history['actions'][0]['status'], 'failed')
        self.assertEqual(len(history['actions']), 2)

    def test_native_commit_without_new_intent_cannot_reuse_old_future_dated_read(self):
        from datetime import datetime
        source = Path(__file__).with_name('guest.py').read_text(encoding='utf8')
        function = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)
                        and node.name == 'commit_candidate')
        watcher, calls, reports = Watcher(), [], []
        class Journal:
            def read_text(self):
                return json.dumps({'id': 'owned-journal', 'actions': [{'name': 'validate-business-read',
                    'startedAt': '2099-01-01T00:00:00Z', 'status': 'completed'}]})
        class Prefix:
            name = 'personal'
            def __truediv__(self, name):
                return Journal() if name == 'journal.json' else Path('/owned/personal') / name
        def install(*_, **__):
            calls.append('original')
            return {'status': 'already-installed'}
        env = {'install': install, 'prepare_native_watcher': lambda *_: watcher,
               'report': reports.append, 'json': json, 'datetime': datetime}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<native-commit>', 'exec'), env)
        with self.assertRaises(NativeProbeError) as caught:
            env['commit_candidate']('bundle', 'digest', Prefix(), 'config', {}, 'initial', native_diagnostic=True)
        self.assertEqual(calls, ['original'])
        self.assertEqual(watcher.finished, 1)
        self.assertEqual(reports, [])
        self.assertFalse(caught.exception.native_trace['preparedBeforeBusiness'])
        self.assertEqual(caught.exception.native_trace['businessBoundaryErrorType'], 'AssertionError')

    def test_success_retains_original_result_and_does_not_invent_capture(self):
        watcher = Watcher()
        result, trace = observe_native_action(lambda: 'installed', lambda: watcher, lambda: 10**12)
        self.assertEqual(result, 'installed')
        self.assertTrue(trace['preparedBeforeBusiness'])
        self.assertFalse(trace['captured'])
        self.assertEqual(watcher.finished, 1)

    def test_original_failure_survives_late_registration_and_is_not_retried(self):
        original = RuntimeError('private original failure')
        calls = []
        watcher = Watcher()
        def action():
            calls.append('business')
            raise original
        with self.assertRaises(RuntimeError) as caught:
            observe_native_action(action, lambda: watcher, lambda: 0)
        self.assertIs(caught.exception, original)
        self.assertFalse(original.native_trace['preparedBeforeBusiness'])
        self.assertEqual(calls, ['business'])
        self.assertEqual(watcher.finished, 1)

    def test_setup_refusal_is_not_retried_and_original_failure_is_preserved(self):
        calls = []
        original = RuntimeError('original')
        def prepare():
            calls.append('prepare')
            raise PermissionError('private refusal')
        def action():
            raise original
        with self.assertRaises(RuntimeError) as caught:
            observe_native_action(action, prepare, lambda: 10**12)
        self.assertIs(caught.exception, original)
        self.assertEqual(calls, ['prepare'])
        self.assertEqual(original.native_trace['preparationErrorType'], 'PermissionError')

    def test_finish_refusal_is_attempted_once_and_cannot_turn_success_into_valid_diagnosis(self):
        watcher = Watcher(PermissionError('private restoration refusal'))
        with self.assertRaises(NativeProbeError) as caught:
            observe_native_action(lambda: 'installed', lambda: watcher, lambda: 10**12)
        self.assertEqual(watcher.finished, 1)
        self.assertEqual(caught.exception.native_trace['finishErrorType'], 'PermissionError')

    def test_missing_business_boundary_is_not_a_successful_diagnosis(self):
        watcher = Watcher()
        with self.assertRaises(NativeProbeError):
            observe_native_action(lambda: 'installed', lambda: watcher, lambda: None)
        self.assertEqual(watcher.finished, 1)

    def test_finish_refusal_does_not_replace_or_retry_the_original_error(self):
        original = RuntimeError('private business failure')
        watcher = Watcher(PermissionError('private restoration refusal'))
        def action():
            raise original
        with self.assertRaises(RuntimeError) as caught:
            observe_native_action(action, lambda: watcher, lambda: 10**12)
        self.assertIs(caught.exception, original)
        self.assertEqual(watcher.finished, 1)
        self.assertEqual(original.native_trace['finishErrorType'], 'PermissionError')


class Events(unittest.TestCase):
    def test_owned_restart_history_retains_exit_without_private_attributes(self):
        owner = 'a' * 64
        record = {'timeNano': 100, 'event': 'die', 'id': owner, 'exitCode': '139'}
        values = [record, {**record, 'event': 'restart', 'exitCode': ''},
                  {**record, 'event': 'oom', 'exitCode': ''}]
        result = GuestFailureProgress.marker('project_container_events')('\n'.join(map(json.dumps, values)).encode(), {owner: 'mcp'}, 90, 110)
        self.assertEqual([v['event'] for v in result['events']], ['die', 'restart', 'oom'])
        self.assertEqual(result['events'][0]['exitCode'], 139)
        self.assertFalse(result['truncated'])

    def test_unknown_unowned_outside_window_and_private_fields_rejected(self):
        owner = 'a' * 64
        private = 'wmi_' + 'x' * 43
        record = {'timeNano': 100, 'event': 'die', 'id': owner, 'exitCode': '1'}
        values = [{**record, 'id': 'b' * 64}, {**record, 'timeNano': 89},
                  {**record, 'event': private}, {**record, 'attributes': private},
                  {**record, 'exitCode': private}, {**record, 'exitCode': '256'},
                  {**record, 'timeNano': True}, {**record, 'event': []}]
        result = GuestFailureProgress.marker('project_container_events')(('invalid\n' + '\n'.join(map(json.dumps, values))).encode(), {owner: 'mcp'}, 90, 110)
        self.assertEqual(result, {'events': [], 'truncated': False})
        self.assertNotIn(private, json.dumps(result))

    def test_scope_and_record_limits(self):
        owner = 'a' * 64
        record = {'timeNano': 100, 'event': 'die', 'id': owner, 'exitCode': '1'}
        result = GuestFailureProgress.marker('project_container_events')(('\n'.join([json.dumps(record)] * 70)).encode(), {owner: 'mcp'}, 90, 110)
        self.assertEqual(len(result['events']), 64)
        self.assertTrue(result['truncated'])
        with self.assertRaises(ValueError):
            GuestFailureProgress.marker('project_container_events')(b'', {'a': 'mcp'}, 90, 110)


if __name__ == '__main__':
    unittest.main()
