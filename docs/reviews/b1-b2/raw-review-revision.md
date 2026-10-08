# B1/B2 第三轮成果独审修订

本轮修复 ANSI 结束字节吞掉凭据前缀的 blocking；已闭合的祖先权限与 stderr 重定向不修改。系统秘密存储、身份/协议全验证、稳定 pending 和原子提交规则仍保持。连接器没有新增迁移、API、事件或服务端生命周期变更。三系统 CI、Windows 第二用户、macOS、成果复审和连接器 actual main 仍是合入门禁。

## 实现与回归证据

`apps/connector/src/output-redaction.ts` 新增原始字节匹配器 `redactRawOutput`。公开入口先建立 `const rawOutput = redactRawOutput(write)`，再建立 `const terminal = redactTerminalOutput(text => rawOutput.push(text), depth)`、`const rawInput = redactRawOutput(text => terminal.push(text))`。输入原始字节先保护，ANSI 可见字符与控制载荷继续保护，变换后的输出原字节再保护；退出按 `rawInput.finish(); terminal.finish(); rawOutput.finish()` 顺序排空，避免尾部跨层泄漏。仅保留潜在凭据后缀，安全提示不会等子进程退出才显示。

原被引用的 `if (/[\x40-\x7e]/.test(char)) completeControl()` 仍承担 CSI 解析；其调用之前原始凭据已独立检查。原 `accept(safe, true)` 处改为 `if (safe.endsWith('w')) { accept(safe.slice(0, -1), true); accept('w', false) } else accept(safe, true)`：控制结束字节也可能是凭据起点，保留 `w` 参与后续跨 ANSI 候选匹配，保护“异常前导串＋中间色彩序列”的组合。原始安全字节保留，敏感候选不能因 ANSI 分类提前释放。

`client-process.test.ts` 新增 wmi_/wmp_、ESC/ESC[/八位CSI、OSC 内同类前导串、每个 chunk 边界和逐字节输入；同时测试完整连续令牌与令牌中间 ANSI 色彩。每个输出原字节与规范化显示结果都不得包含凭据，保留安全提示即时显示、隐藏标记及尾部安全文字断言。

`test-support/raw-output-cases.ts` 只生成程序，秘密仍从子进程环境取得，不在参数/日志保存真实值。真实管道、真实 PTY、实际 CLI/系统秘密存储入口均执行这些跨 chunk 前导串组合；PTY 保留尺寸/Ctrl-C，实际 stderr 单独重定向文件检查原始日志与显示结果、错误归属和退出码7。失败诊断不打印原终端输出，泄漏断言比较布尔值，避免把原凭据写入失败工件。

## 实际检查与历史保留

最终 `revision-raw-unit-03` 为43单元通过，`revision-raw-build-02` build/lint成功；`revision-raw-linux-02` 为6平台项＋43单元全部通过，包含实际 Secret Service、跨用户负例/正对照、实际 CLI/PTY/原始 stderr 日志。`revision-raw-windows-02` 为3通过、2缺第二用户夹具失败，实际 Credential Manager、ACL 与完整 CLI 测试通过；macOS未运行，未声称三系统通过。

首轮 `revision-raw-unit-01` 因新增测试误放在管道测试回调内，Vitest 报 nested test，41通过、1失败；已移到顶层，原失败日志保留。`unit-02`、第一轮平台和 build 是基本修复的历史检查，补异常前导串＋色彩组合后仅复验受影响连接器范围，不重跑无变化全仓。上轮 source/计划/规格及 cleanup 清单保持原字节，新的源码清单为 `raw-source.json`；每轮实际源差异、退出码及运行期间变化都单独列出。

## C1 来源闭合与真实 main 整合

本轮最初直接 `ls-remote origin refs/heads/main` 仍读96e7248，保留先前未落地组合的历史，不重置工作区。收尾再次直接读精确 ref，得到 **`5b9c76b5f79917697906520edcd6947bfbfa925f`**（PR206）。该 main parents 为96e7248与审核 head **`81090ec01bcbc84edbe101418d833840999a5326`**，两者 tree 实际比较相同。平台工具读取 **CI391/run37776599223**：10项全部 success，包含 Required CI。它属于 C1，不能替代连接器的三系统/Required CI。

相对历史 C1 head7636913，新 main仅4个证据文件变化：原 C1 README 空白修复及3个 CI 修复证据文件。C1 原任务完成了修复和自身 PR CI 后已合入，满足本轮第4项的主线前置门禁。本 agent 正常 merge 真正 main，无冲突，没有修改 C1 原证据来掩盖失败。整体 `git diff --cached --check` 已成功；连接器之外的 Schema/DB/API/MCP/contracts 产品源相对实际 main 无差异。产品源码没有因这些证据变化改变，运行 source SHA 继续绑定，不为证据变动重跑整套。

旧 `ansi-main-provenance.json`、`ansi-source.json` 中 `mainProof=false` 和 EOF 告警保留当时历史，不改成曾经成功。当前 `raw-source.json` 使用 `integratedMain=5b9c76b` 与 `landedCombination` 记录实际来源；准确读回见 `raw-main-provenance.json`。未使用共享缓存 FETCH_HEAD 推断 main。

修订与正常主线整合已提交并推送为 `1a88137db9a7b28d207c085fd62e20cb8f074e81`，parents 为4495dbc与真正 main5b9c76b。提交后实际执行完整 `git diff 5b9c76b5f79917697906520edcd6947bfbfa925f 1a88137db9a7b28d207c085fd62e20cb8f074e81 --check`，退出码0、stdout/stderr为空；102个提交文件均与源码清单 Git blob 匹配。精确证明见 `raw-delivery.json`，后续仅补交此证据，不重复产品测试。本次平台查询当前连接器分支返回 `No workflow runs`；尚无修订 PR CI，不能把 C1 的10项成功当作连接器结果。

## 清理与剩余门禁

本轮两个容器均保存脱敏日志后定向 `docker rm -f -v` 并 inspect 确认不存在：`92962e608a775e6471f31dda434061fa296533561999c5ed4b2b78d275e250fd`（`b1b2-01a11ac2-linux-native-cf44429b`）、`7df5b725e9308a10f6129abc2ba96af460b9ee1b5a2d64a0a9028bf3f1c26932`（`b1b2-01a11ac2-linux-native-d2fa1ac2`）。9个运行临时路径、191个测试临时目录均复查不存在；系统秘密引用由测试 finally 删除。原生测试进程对应本轮独有运行 exe 的存活检查为空，见 `evidence/raw-process-cleanup.json`；其余退出事件按实际日志记录，不冒缺失事件。

`evidence/raw-cleanup.json` 保存精确绝对路径/完整资源ID及事件，旧 cleanup 不覆盖。保留共享基础镜像，没有专用镜像/网络、没有 global prune、没有删业务卷。环境只对子进程改变；当前工作区与旧工作区仍保留，连接器尚未 actual main，旧 worktree 不满足清理条件；dist 为 build 输出，保留、不入 Git。

日志无损增量归档到既有 ZIP/索引，旧逻辑路径与失败原件仍精确可读。核验使用 `node docs/reviews/b1-b2/verify-revision-source.mjs --raw`（capture 先 stage，跨换行核验加 `--git-only`）、`archive-evidence.mjs`、`collect-revision-cleanup.mjs --raw`。

当前连接器修订尚待成果复审及正常 PR 触发三系统原生依赖/存储/跨用户/CLI 检查，取得其自身 Required CI 成功并经 Chief 确认后才能合入；C1 CI391或本机成功不替代这道门禁，不假称 #20 无源码安装已验收。
