"""受控回归：只用模拟扫描和本构建中新建的快照夹具，不访问旧工作树。"""
import sys
sys.dont_write_bytecode = True
import concurrent.futures
import contextlib
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import types
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('usage_inventory', Path(__file__).with_name('usage-inventory.py'))
inventory = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(inventory)


def directory_info(reparse=False):
    return types.SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=stat.FILE_ATTRIBUTE_REPARSE_POINT if reparse else 0)


class InventoryBoundaryTests(unittest.TestCase):
    def test_main_repository_parent_junction_stops_before_child_metadata(self):
        parent = inventory.ROOT / 'DzkLDn6UW-IbfoTJzN9Ro'
        target = parent / 'repo'
        visited = []

        def metadata(path):
            visited.append(path)
            return directory_info(reparse=path == parent)

        with mock.patch.object(Path, 'lstat', metadata), mock.patch.object(inventory.os, 'scandir') as scandir:
            result = inventory.scan(target)
        self.assertEqual(result['blockedAt'], str(parent))
        self.assertFalse(result['complete'])
        self.assertIn('reparse point', result['reason'])
        self.assertNotIn(target, visited)
        scandir.assert_not_called()

    def test_higher_ancestor_junction_stops_before_workspace_access(self):
        blocked = inventory.ROOT.parent
        with mock.patch.object(Path, 'lstat', lambda path: directory_info(reparse=path == blocked)), \
                mock.patch.object(Path, 'iterdir') as iterdir, mock.patch.object(inventory.os, 'scandir') as scandir, \
                mock.patch.object(inventory, 'git', return_value={'exit': 0}), \
                mock.patch.object(sys, 'argv', ['usage-inventory.py']), contextlib.redirect_stdout(io.StringIO()) as output:
            status = inventory.main()
        iterdir.assert_not_called()
        scandir.assert_not_called()
        summary = json.loads(output.getvalue())
        self.assertEqual(status, 1)
        self.assertFalse(summary['complete'])
        self.assertIsNone(summary['logicalBytes'])
        self.assertIsNone(summary['mainRepoSeparateBytes'])

    def run_simulated_inventory(self, scandir_error=None, lstat_error=None):
        target = inventory.ROOT / 'DzkLDn6UW-IbfoTJzN9Ro' / 'repo'

        def metadata(path):
            if lstat_error and path == target:
                raise lstat_error
            return directory_info()

        with mock.patch.object(Path, 'lstat', metadata), mock.patch.object(Path, 'iterdir', return_value=iter([])), \
                mock.patch.object(inventory.os, 'scandir', side_effect=scandir_error, return_value=contextlib.nullcontext(iter([]))) as scandir, \
                mock.patch.object(inventory, 'git', return_value={'exit': 0}), \
                mock.patch.object(sys, 'argv', ['usage-inventory.py']), contextlib.redirect_stdout(io.StringIO()) as output:
            status = inventory.main()
        return status, json.loads(output.getvalue()), scandir

    def test_main_repository_access_denied_is_incomplete_and_nonzero(self):
        status, summary, scandir = self.run_simulated_inventory(scandir_error=PermissionError('受控拒绝访问'))
        self.assertEqual(scandir.call_count, 1)
        self.assertEqual(status, 1)
        self.assertEqual(summary['errors'], 1)
        self.assertFalse(summary['complete'])
        self.assertFalse(summary['mainRepoComplete'])
        self.assertIsNone(summary['mainRepoSeparateBytes'])
        self.assertEqual(summary['mainRepoObservedBytes'], 0)

    def test_main_repository_metadata_denied_never_scans(self):
        status, summary, scandir = self.run_simulated_inventory(lstat_error=PermissionError('受控元数据拒绝'))
        scandir.assert_not_called()
        self.assertEqual(status, 1)
        self.assertEqual(summary['errors'], 1)
        self.assertIsNone(summary['mainRepoSeparateBytes'])

    def test_empty_readable_repository_is_measured_zero_and_success(self):
        status, summary, _ = self.run_simulated_inventory()
        self.assertEqual(status, 0)
        self.assertTrue(summary['complete'])
        self.assertEqual(summary['errors'], 0)
        self.assertEqual(summary['mainRepoSeparateBytes'], 0)

    def test_worktree_and_main_errors_are_both_counted(self):
        worktree = inventory.ROOT / '01a-owned-fixture'
        with mock.patch.object(Path, 'lstat', return_value=directory_info()), \
                mock.patch.object(Path, 'iterdir', return_value=iter([worktree])), \
                mock.patch.object(inventory.os, 'scandir', side_effect=PermissionError('受控拒绝访问')), \
                mock.patch.object(inventory, 'git', return_value={'exit': 0, 'stdout': inventory.REPOSITORY}), \
                mock.patch.object(sys, 'argv', ['usage-inventory.py']), contextlib.redirect_stdout(io.StringIO()) as output:
            status = inventory.main()
        summary = json.loads(output.getvalue())
        self.assertEqual(status, 1)
        self.assertEqual(summary['errors'], 2)
        self.assertIsNone(summary['logicalBytes'])
        self.assertIsNone(summary['mainRepoSeparateBytes'])

    def test_concurrent_processes_cannot_overwrite_same_snapshot(self):
        # 仅删除 TemporaryDirectory 创建的本回归夹具；不读取实际工作树或历史清理目标。
        with tempfile.TemporaryDirectory(prefix='inventory-regression-', dir=inventory.OUT) as temporary:
            for iteration in range(3):
                dest = Path(temporary) / f'concurrent-{iteration}.json.gz'
                workers = [subprocess.Popen(
                    [sys.executable, '-B', str(Path(__file__).absolute()), '--snapshot-worker', str(dest), str(number)],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                    encoding='utf-8', env={**os.environ, 'PYTHONUTF8': '1'}) for number in range(2)]
                try:
                    for worker in workers:
                        self.assertEqual(worker.stdout.readline().strip(), 'ready')
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                        results = list(pool.map(lambda worker: worker.communicate('go\n', timeout=15), workers))
                    self.assertEqual(sorted(worker.returncode for worker in workers), [0, 2], results)
                    original = dest.read_bytes()
                    winner = workers.index(next(worker for worker in workers if worker.returncode == 0))
                    self.assertEqual(json.loads(gzip.decompress(original)), {'writer': str(winner)})
                    with self.assertRaises(FileExistsError):
                        inventory.write_snapshot(dest, {'writer': '不得覆盖'})
                    self.assertEqual(dest.read_bytes(), original)
                finally:
                    for worker in workers:
                        if worker.poll() is None:
                            worker.kill()
                        worker.communicate()


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--snapshot-worker':
        print('ready', flush=True)
        sys.stdin.readline()
        try:
            inventory.write_snapshot(Path(sys.argv[2]), {'writer': sys.argv[3]})
        except FileExistsError:
            print('已存在原件，独占创建失败')
            sys.exit(2)
    else:
        unittest.main(verbosity=2)
