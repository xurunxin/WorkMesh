# 定向复验启动失败的保留边界

本轮收尾第一次增加 `final-targets` 模式时，PowerShell 内嵌 Python 引号解析失败，返回 `SyntaxError: '(' was never closed`；随后旧 helper 将 `final-targets` 当可执行文件，`product-checks.py` 在 `subprocess.Popen` 返回 `FileNotFoundError: [WinError 2]`。外层原生 exit 为 1，未运行产品测试。失败发生在 recorder 建立 child 及原输出 ZIP 之前，因此没有该次完整 stdout ZIP 或产品测试数量；本文件是本轮实际工具输出的文字保留，不能冒原始运行记录。

helper 的 `finally` 仍保存独有 owner 容器操作及清理回执；下一次通过文件补丁加入准确模式后，实际 API 49 例的回执为 `m3-ce8b651cabc0`，M3 结果另见最终检查索引。没有因此取消健康的 integration/E2E 进程或改产品门禁。
