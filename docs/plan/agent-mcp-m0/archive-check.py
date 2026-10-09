"""受控文档静态检查入口；旧完整检查器在previous-1bcf.zip。"""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("audit-check.py")),run_name="__main__")
