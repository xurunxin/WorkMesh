"""真实生成器：LF/CRLF 等价、原件保全、真实变化与坏输入拒绝。"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
DECISION = 'docs/plan/agent-mcp-m4/product-discovery-decisions.json'


class GeneratorCheckoutTests(unittest.TestCase):
    def test_full_generator_and_registration_source_contract(self):
        decision = json.loads((ROOT / DECISION).read_bytes())
        binding = json.loads((ROOT / decision['registrationSourceBinding']).read_bytes())
        capture_path = decision['registrationEvidence']
        capture = json.loads((ROOT / capture_path).read_bytes())
        paths = ['docs/plan/backend-only/skill-discovery-decisions.json', DECISION, capture_path, decision['registrationSourceBinding'], 'OPENAPI.yaml',
                 'scripts/generate-agent-discovery.py', 'scripts/agent_discovery_source_binding.py',
                 'packages/contracts/src/agent-discovery-rules.ts', 'packages/contracts/src/route-policy.ts']
        paths += [f'docs/plan/agent-mcp-{batch}/{name}' for batch, name in [
            ('m0', 'operation-decisions.json'), ('m1', 'operation-decisions.json'),
            ('m2', 'product-discovery-decisions.json'), ('m3', 'product-discovery-decisions.json')]]
        paths += [entry['path'] for entry in capture['sources']]
        paths += [entry[kind]['objectPath'] for entry in binding['sources'] for kind in ['runtime', 'git']]
        # 新建独有副本保留，不覆盖历史夹具或清理任何恢复原件。
        target = Path(tempfile.mkdtemp(prefix='workmesh-discovery-checkout-')).resolve()
        for name in set(paths):
            dest = target / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes((ROOT / name).read_bytes())
        outputs = ['packages/contracts/src/agent-discovery-rules.ts', 'packages/contracts/src/route-policy.ts']
        def fingerprint():
            return {name: hashlib.sha256((target / name).read_bytes()).hexdigest() for name in outputs}
        def run():
            return subprocess.run([sys.executable, '-B', str(target / 'scripts/generate-agent-discovery.py')], capture_output=True)
        observed = []
        for newline in ['LF', 'CRLF']:
            for entry in binding['sources']:
                canonical = (ROOT / entry['git']['objectPath']).read_bytes()
                (target / entry['path']).write_bytes(canonical if newline == 'LF' else canonical.replace(b'\n', b'\r\n'))
            result = run()
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
            first = fingerprint()
            self.assertEqual(run().returncode, 0)
            self.assertEqual(first, fingerprint())
            for name in outputs:
                self.assertEqual((target / name).read_bytes(), (ROOT / name).read_bytes().replace(b'\r\n', b'\n'))
            self.assertEqual((target / capture_path).read_bytes(), (ROOT / capture_path).read_bytes())
            observed.append(dict(case=newline, exitCode=result.returncode, oldBindingsAndMapsPreserved=True, regenerationZeroDiff=True))
        source = target / capture['sources'][0]['path']
        original_source = source.read_bytes()
        original_decision = (target / DECISION).read_bytes()
        for case in ['real-code-change', 'trailing-space-change', 'missing-registration', 'unknown-operation', 'changed-old-binding', 'changed-runtime-object']:
            source.write_bytes(original_source)
            data = json.loads(original_decision)
            if case == 'real-code-change': source.write_bytes(original_source + b'// changed implementation\r\n')
            if case == 'trailing-space-change': source.write_bytes(original_source.replace(b'\r\n', b' \r\n', 1))
            if case == 'missing-registration': data['registeredBindingIds'].remove(data['bindings'][0]['bindingId'])
            if case == 'unknown-operation': data['bindings'][0]['operationIds'] = ['notAnOperation']
            if case == 'changed-old-binding':
                next(entry for entry in data['bindings'] if entry['bindingId'] == 'tool:create_project_health_update')['identityVariants'] = []
            if case == 'changed-runtime-object':
                obj = target / binding['sources'][0]['runtime']['objectPath']
                obj.write_bytes(obj.read_bytes() + b'\n')
            (target / DECISION).write_text(json.dumps(data), encoding='utf-8')
            before = fingerprint()
            result = run()
            self.assertNotEqual(result.returncode, 0, case)
            self.assertEqual(before, fingerprint(), case)
            observed.append(dict(case=case, exitCode=result.returncode, derivedBytesUnchanged=True))
        print(json.dumps(dict(fixture=str(target), cases=observed, captureOriginalUnchanged=True)))


if __name__ == '__main__':
    unittest.main()
