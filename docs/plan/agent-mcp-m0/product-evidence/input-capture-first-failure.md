# 首次受测输入保全中断

`contracts-typecheck` 记录器首次以已审文档候选作为 diff base，意外包含主线 A2/C2 的七千余历史证据文件，输入 ZIP 保全未结束，产品命令尚未执行。发现方式为实际子进程检查：记录器 Python PID43480 的直接子进程仍是 git show，不是 tsc。

仅终止本次记录器及其已核归属的 git 子进程，保留不完整 ZIP 原件。该 ZIP 不是可验证完整归档，不能计作产品受测输入；无产品退出/runtime/skip 结论。后续改用实际已整合 main 作为产品 diff base，保留当前 head 对应 blob 和工作树，不反向更改历史主线证据。
