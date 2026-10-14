import json
import unittest
from native_diagnostic import safe_trace


class TracePrivacy(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
