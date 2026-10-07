# Earlier startup attempts

本节记录此前执行对话中的初败；旧轮次未保留原始终端文件，因此这里明确标为对话记录，不冒称原始日志。对应本轮修正重跑的完整原始输出见 `check-index.json` 指向的日志。

- 定向 E2E 曾使用 `pnpm --filter @workmesh/web test:e2e -- e2e/theme-unification.spec.ts`。package script 收到多余的 `--` 参数，导致 Playwright 未按单文件参数启动；该次为非零退出，原数字退出码未在历史日志中保存。修正为 `pnpm --filter @workmesh/web test:e2e e2e/theme-unification.spec.ts`，本轮日志 `logs/theme-e2e-focused.log` 记录 10/10 通过。
- 初次 `pnpm bootstrap:token` 输出含 pnpm banner；被捕获的 token 字符串未满足 API 对 canonical unpadded base64url 的校验，服务返回 `WORKMESH_BOOTSTRAP_TOKEN must be canonical unpadded base64url encoding of 32 to 256 random bytes`。该候选值已丢弃，报告、日志和提交均不保留 token 内容。本轮以 `pnpm --silent bootstrap:token` 生成随机 token，直接注入临时进程环境，未打印或落盘 token 值。
- 一次 PowerShell 包装器误把自动变量 `$args` 当普通参数使用，并调用无参数 `pnpm`，产生 pnpm usage 输出并以退出码 2 结束。改用显式参数名和当前 package script 后，定向与全量 E2E 均通过。

本轮 `runtime-probe.log` 还记录了一次环境版本探测错误：从 web package 直接 `require('playwright')` 得到 `MODULE_NOT_FOUND`（退出码 1）；改用仓库实际依赖 `@playwright/test` 后探测成功。这不是功能测试失败，不影响测试结果。
