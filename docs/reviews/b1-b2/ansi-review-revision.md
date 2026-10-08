# B1/B2 第二轮成果独审修订

本轮依据第二轮成果独审修复 ANSI 脱敏和 stderr 单独重定向两项 blocking。上轮祖先权限实现不变；Windows 第二用户、macOS、修订 head 的三系统平台 CI、Required CI、成果复审和 actual main 仍未闭合。本记录不放行合入、不声称任务完成，不重做已审规划或 #20 发布验收。

## 源码修订与验证证据

`apps/connector/src/client-process.ts` 原直接正则替换已移到 `output-redaction.ts`。新脱敏器用 `if (!isControl) visible += text` 让 ANSI 不打断匹配，在 `if (/^(?:wmi_|wmp_)[A-Za-z0-9_-]{43}$/.test(visible))` 隐藏完整凭据。CSI、OSC/DCS、七位 ESC 和八位 C1 分块解析；控制载荷递归脱敏，潜在凭据字符不能因为色彩、标题、控制载荷或独立结束符插入而提前释放。安全提示与完整控制序列原样保留，异常超长/过深/未完成控制序列保守隐藏，候选缓冲有界。

`client-process.ts` 原 `if (process.stdin.isTTY && process.stdout.isTTY)` 现为 `if (process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY)`。任一流重定向时进入原分流管道，stdout/stderr 分别脱敏；三流均为终端才用 PTY 合并输出。`stderr-driver.ts` 在真实外层 PTY 内将实际 CLI 的 stderr 单独连接文件，模拟 `run -- <client> 2>errors.log`，证明 stdout 仅含正常标记、文件仅含错误标记及已隐藏内容，客户端退出码7被保留；finally 删除自己的日志目录，失败不打印原客户端输出。

单元矩阵覆盖 wmi_/wmp_ 的每个 ANSI 插入位置和每个 chunk 切分边界；控制类型包括 SGR、八位 CSI、OSC、DCS、七位/八位结束符和 BEL。真实管道进程看到短提示才输入，随后在 stdout/stderr 分块输出带 ANSI 的凭据。真实 PTY 保留 TTY、尺寸变化和 Ctrl-C，并在 ANSI 控制序列本身中间切 chunk。实际 CLI/系统秘密存储入口同时覆盖上述路径，先比较布尔泄漏结果，失败也不把令牌放进断言日志。终端失败诊断仅写无秘密错误说明。

## 真实 main 与误整合来源

本轮先调用平台 git `fetch origin main`，随后单独读取共享缓存 `FETCH_HEAD` 得到 `76369131ef6de844813fe40a8df519c8fbbf29ed`，误把它当作 main 并执行普通合并。Chief 20:02 纠正后，本 agent 直接调用平台 git `ls-remote origin refs/heads/main`，实读仍为 **`96e724858e692d262107c34db50b40c3ae7c122c`**。共享缓存的 FETCH_HEAD 不能作为远端精确 ref 证明；先前“main 已推进到7636913”的说法撤回。

已整合的 `7636913` 实为 #15 C1 当前构建 head，parents 为 `9c10ca455d949f62b01c54d09cc6160e4c8ac429` 与真实 main96e7248；与本分支上一轮 head `375990f10d73679f3c0724d21e8d7c58b3d8bd9b` 的共同祖先也为96e7248。该 source 包含 C1 自有迁移、API/worker/web/共享 contracts，不属于本轮连接器新增范围；Chief 明确其成果独审刚通过，但尚无成功 PR CI/actual main 证明。

当前组合和 dirty 文件完整保留，不盲目 reset/删除。`ansi-source.json` 明确 `integratedMain=96e7248` 和 `unlandedCombination.head=7636913`、`mainProof=false`；检查绑定实际工作树/暂存 blob，不能把这组跨分支检查当作新 main 已测。连接器没有新增 Schema/服务端生命周期变更，相关文件相对 C1 已整合 head 无差异；这不声称当前整体相对真实 main 没有 C1 增量。上轮 `current-source.json`、`revision-source.json`、原规划及规格保留历史，不覆盖成新成功证据。

## 本轮实际检查与剩余门禁

`revision-ansi-unit-01` 首次42项中41通过、1失败：测试规范化辅助使用 Node 的 `stripVTControlCharacters` 未完整移除所插入的 OSC 标题，断言期望错误；原脱敏结果已含隐藏标记。调整独立对照去除已知完整插入控制序列后复验，失败日志保留。`unit-02` 和平台第一轮通过后，又补独立结束符/BEL 的 ANSI 边界，故只重跑受影响的连接器单元、原生平台与 build/lint，不因 C1 误读重跑全仓。

最终运行目录为 `revision-ansi-unit-03`、`revision-ansi-linux-02`、`revision-ansi-windows-02`、`revision-ansi-build-02`。实际结果、精确差异及清理记录见对应 `checks.json`/`resources.json`、`ansi-source.json` 和下方收尾记录。缺第二用户按失败处理；macOS 未运行；任何本机通过均不替代修订 head 的三系统原生安装、系统存储、跨用户负例/正对照、CLI/PTY 和 Required CI 成功。

当前不具备合入或旧 worktree 清理条件。后续仅按真正 `refs/heads/main` 的新 SHA 正常整合与适用验证，不把 FETCH_HEAD、其他构建分支、历史 CI 或当前组合当主线落地。

差异空白检查如实保留：本轮连接器差异（相对已整合 C1 head）`git diff --cached 7636913 --check` 成功；整体 staged 差异的 `--check` 报 `docs/reviews/c1/review-fixes/README.md:47: new blank line at EOF`，来自未落地 C1 的原文件。本轮不修改 C1 已审证据字节以隐藏该告警，详见 `ansi-diff-check.json`。因此也不声称当前整体差异所有检查成功。

最终实际结果：Windows 连接器42单元通过，build/lint 成功；Linux6平台项＋42单元通过（包含实际 Secret Service、跨用户读取/重命名负例与正对照、实际 CLI 的 ANSI/PTY/stderr 重定向验证）；Windows 平台3通过、2缺第二用户夹具失败，macOS未测。未对错误“新 main”假设重跑全仓；上一轮 integration329＋3skip、E2E67保持历史绑定，不冒当前组合新结果。当前分支查询仍无 workflow run，因此三系统 CI/Required CI 未取得成功结果。

## 清理及复核入口

本轮仅创建并定向清理两个 Linux 容器：`1d355f404dbe3962b32247774ae2901b6f6f26af08efe04ccbe56bf5548e468e`（`b1b2-01a11ac2-linux-native-cb2cebe7`）、`67f2d2651840ee58368888bca1ec328f70083c9d4c0f0a21dc50cc93c31518c0`（`b1b2-01a11ac2-linux-native-9cd86a11`）。保存脱敏日志后 `docker rm -f -v`，inspect 复查均不存在；共享 `node:22.19.0-bookworm` 不删除，没有专用镜像/网络/业务卷。9个本轮运行临时路径（两个 Linux 副本＋七个 Node 22 副本）、191个新测试临时目录均复查不存在；记录到的测试进程/HTTP 服务关闭事件与随机秘密引用删除事件保留。仅子进程修改环境，未修改机器配置或 daemon。

本轮精确路径和资源事件写入 `evidence/ansi-cleanup.json`，上一轮 `revision-cleanup.json` 保持原提交字节。当前工作区及旧工作区继续保留，未 actual main、未具备 worktree 清理条件；dist 为本轮 build 输出，仍保留、不入 Git，上一轮自动审批拒绝记录不冒已清理。

复核命令：先 stage 当前源，再运行 `node docs/reviews/b1-b2/verify-revision-source.mjs --ansi --capture`；普通核验使用 `--ansi`，跨换行核验加 `--git-only`。这生成/读取独立 `ansi-source.json`，不覆盖上轮 `revision-source.json`。日志无损增量归档至原 ZIP/索引，旧逻辑路径仍精确可读；`node docs/reviews/b1-b2/archive-evidence.mjs` 验证完整性。归档后 `node docs/reviews/b1-b2/collect-revision-cleanup.mjs --ansi` 仍可从 ZIP 恢复登记，不丢资源事件。
