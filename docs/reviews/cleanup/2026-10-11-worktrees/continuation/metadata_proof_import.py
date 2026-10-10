"""共享只读 Win32 核验函数；避免重新执行 metadata-proof.py 主程序。"""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('cleanup_metadata', Path(__file__).with_name('metadata-proof.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
raw_link = module.raw_link
exclusive_open = module.exclusive_open
