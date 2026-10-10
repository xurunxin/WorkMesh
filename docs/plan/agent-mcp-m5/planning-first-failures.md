# 规划阶段首败

仅记录实际失败，不把重跑成功倒写到原尝试；产品用例尚未执行。

| 尝试 | 实际结果 | 修正与边界 |
| --- | --- | --- |
| 前轮探索批量输出 | 多次工具输出截断；`rg` 指定不存在的源码路径报错 | 完整来源以本轮精确 Git blob 捕获为准；不为截断显示前缀计算全文哈希 |
| 本轮首次探索 | `rg` 发现 M5 目录不存在；误猜 `scripts/raw-evidence-archive.mjs` 不存在，shell exit 1 | 使用实际既有验证器和 Python 无损 ZIP；不存在的路径没有被当作源码依据 |
| `python docs/plan/agent-mcp-m5/capture-planning.py` 首次运行 | exit 1，`source_capture` 中冻结节严格长度断言 `AssertionError`；尚未产生来源 ZIP 或环境探测结果 | 177–201 是规定的原文行范围，下一标题前另有空行；改为核逐字内容并只在比较边界忽略空行。交付 `frozen-m5.md` 仍为原始 177–201 字节，完整父文件另外无损保全 |
| 首次完整环境盘点 | 命令 exit 0，但 Windows PowerShell 原生 stdout 编码不是 UTF-8，OS Caption 出现替换字符 | 初始 JSON 与原字节 ZIP 分别保留于 `input/environment-initial.json`、`input/environment-originals-first.zip`；重跑 OS 探测显式使用 UTF-8，不将损坏的 Caption 当准确来源 |
| 首次 `build-operation-matrix.py` | exit 1，所选 `listClaimableWorkItems` 不在当前 OpenAPI | 这是 SDK convenience／MCP工具名，现行 operationId 是 `listWorkItems`；移除伪 operation，保真实绑定与可领取过滤，不创造新端点 |
| 末次来源增补的模块加载 | `python -c` 以 `capture_planning` 加载带连字符文件，exit 1、ModuleNotFoundError，未运行来源函数 | 改用 `runpy.run_path` 调用实际 `capture-planning.py` 的 `source_capture`，只增补真实 `teamAccess` 源码，不重跑环境或联网探测 |

原首败由工具原返回及本文件保全，未取得该首次命令独立 stdout/stderr 文件；不伪称拥有独立日志原件。后续捕获和静态验证均在独有目录保存准确命令回执。
