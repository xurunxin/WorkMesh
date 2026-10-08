# Earlier startup attempts

本节记录此前执行对话中的初败；旧轮次未保留原始终端文件，因此这里明确标为对话记录，不冒称原始日志。对应本轮修正重跑的完整原始输出见 `check-index.json` 指向的日志。

- 定向 E2E 曾使用 `pnpm --filter @workmesh/web test:e2e -- e2e/theme-unification.spec.ts`。package script 收到多余的 `--` 参数，导致 Playwright 未按单文件参数启动；该次为非零退出，原数字退出码未在历史日志中保存。修正为 `pnpm --filter @workmesh/web test:e2e e2e/theme-unification.spec.ts`，本轮日志 `logs/theme-e2e-focused.log` 记录 10/10 通过。
- 初次 `pnpm bootstrap:token` 输出含 pnpm banner；被捕获的 token 字符串未满足 API 对 canonical unpadded base64url 的校验，服务返回 `WORKMESH_BOOTSTRAP_TOKEN must be canonical unpadded base64url encoding of 32 to 256 random bytes`。该候选值已丢弃，报告、日志和提交均不保留 token 内容。本轮以 `pnpm --silent bootstrap:token` 生成随机 token，直接注入临时进程环境，未打印或落盘 token 值。
- 一次 PowerShell 包装器误把自动变量 `$args` 当普通参数使用，并调用无参数 `pnpm`，产生 pnpm usage 输出并以退出码 2 结束。改用显式参数名和当前 package script 后，定向与全量 E2E 均通过。

本轮 `runtime-probe.log` 还记录了一次环境版本探测错误：从 web package 直接 `require('playwright')` 得到 `MODULE_NOT_FOUND`（退出码 1）；改用仓库实际依赖 `@playwright/test` 后探测成功。这不是功能测试失败，不影响测试结果。

## 本轮受测绑定重验记录

- `evidence/reverification-final/` 保存首轮完整隔离尝试原始日志：lint、typecheck、定向单测通过；一次全量 Web 单测的 `LandingScreen` 用例失败，API integration 出现 IP rate-limit fixture 碰撞，定向与全量 Playwright 因 `WORKMESH_PLAYWRIGHT_RUN_DIR` 非绝对路径失败；相应退出码和环境清理见 `run-binding.json` / `cleanup.json`。
- `evidence/reverification-bound-02/` 以绝对运行目录重跑。全量单测、定向主题 E2E、全量 E2E（67/67）和 D0（14/14）通过；integration 因未配置 CI 中的测试 `WORKMESH_RUNNER_SERVICE_TOKEN` 失败；diff-check 指出本历史说明和 runtime 末尾空行。失败日志及命令前后源码指纹保留。
- `evidence/reverification-integration-03/` 显式提供 CI fixture runner token、隔离 PostgreSQL/Redis/RustFS、恢复所有进程环境变量后重新执行 integration（311/312 通过；1 项 live provider 条件跳过）和 diff-check；两条退出码均为 0。测试 token只在进程环境中，捕获日志已脱敏。
- 历史 D0 replay/capture 报告原件位于 `evidence/d0-previous-run/`；本次绑定 D0 HTML report、Playwright output 及截图位于 `evidence/reverification-bound-02/`。
- 缺少此前未归档的 raw stdout/stderr 仍不可恢复；以上仅是后续明确标记的重新执行证据，不反向为早期执行补造绑定。
