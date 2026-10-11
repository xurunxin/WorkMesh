# 三系统原生验收接续

来源为 [CI437](https://github.com/xurunxin/WorkMesh/actions/runs/38136307248)，head `7e37bb1520105ff89356ebddb2344fe1e65104fb`。完整新失败日志保存为 ci437-*-job-original.log，经本目录索引无损归档。源码门禁、Linux 原生、DB/Worker、两 E2E 分片、灾难恢复及 agent smoke 已成功；查询时 API 仍在执行，不能列全仓完成。

Windows 已通过 checkout，准备临时用户的安全目录时在私有 ACL 核验失败，连接器平台测试尚未执行。原产品比较整个 SDDL 字符串，OS 的账户别名或自动继承表示可能改变字符串而保持安全语义。改为按实际二进制描述符严格核：当前 SID owner、受保护 DACL、唯一无继承 allow ACE、准确 FullControl mask 和同一 SID。不接受多个 ACE、不接受不同 owner/主体、不接受开放继承或缩减权限。新增结构化正负例已实际 3 项通过；真实 runner 原生结果另核，不仅以推断原因冒已修好。Windows 夹具在尝试创建前声明唯一目录，部分创建后校验失败也进入原有准确边界的收尾。

macOS 的无扩展 ACL/修改型 ACL 拒绝、Keychain、跨用户读取/替换门禁已实际通过，剩余 CLI 的真实 PTY 失败 `posix_spawnp failed`。锁定 node-pty 1.1.0 的上游 [issue850](https://github.com/microsoft/node-pty/issues/850) 记录 Darwin prebuild spawn-helper 的发布模式为 0644。连接器新增安装钩子：只处理准确锁定版本及当前 Darwin 架构的 package helper；保留原字节，先创建独立 inode 副本、设执行位再替换，不修改 pnpm CAS hardlink。元数据记录修改前后 mode、内容 hash 和私有副本事实，失败令安装非零退出。真实 CLI/PTY 断言保持，不以替换成管道或模拟进程绕过。

ADR0079 和连接器 README 同步这两处实现解释；已批准计划和历史规格原字节保持，零 Schema/API/事件变更。#20 分发边界不变。

本机 ci:validate 成功（含 15 项 raw archive 测试与规范验证），CI policy 18 项成功。local-02 的 31 个连接器文件与提交7e37bb逐一绑定，运行原字节匹配，仅允许 CRLF→LF 等价；结果见 committed-source-binding.json。新实现将按独有 local-03 保存新的实际源码绑定/检查，不覆盖首败或第二轮。

## CI438 与第三轮本机结果

[CI438](https://github.com/xurunxin/WorkMesh/actions/runs/38137492973) 的准确 head 为 `491d7854cc361fc25852dd7a392165087110c59e`。Windows 私有描述符准备已成功，但脚本把 TEMP/TMP 指到公共只读夹具后，Vitest 建立 ssr 缓存时报 `EPERM: operation not permitted, mkdir`，两项测试文件均未执行。公共夹具保留其他用户读取正对照用途，测试器改回原 TEMP/TMP；连接器本身安全目录条件不变。完整日志和原始字节来源保存为 ci438-windows-job-original.log 与 ci438-windows-log-source.json，经本目录归档索引可读。

macOS 这轮在单元检查的双进程竞争用例失败：57 项通过，1 项退出码断言失败；平台套件因前序命令失败未执行。旧夹具只收集 stdout/stderr，遗漏通过 IPC 返回的安全错误码，因此本次只能证明一个子进程失败，尚不能证明具体产品原因。增加 IPC 错误码收集，将两进程的精确退出值和无秘密错误码放入断言，保留原成功要求；不增加重试或放宽断言。完整日志和来源保存为 ci438-macos-job-original.log 与 ci438-macos-log-source.json。

本机 local-03：lint/typecheck/build 成功、58 项单元通过；平台三项通过，缺第二用户两项仍失败。运行前后 1100 个文件原字节稳定，delivery-binding.json 再按当前工作树字节、捕获的 index blob、准确提交491d的 tree逐项绑定，零不一致。39 个测试目录均有创建/移除回执，空测试根已非递归移除。没有把本机部分平台结果冒三 OS 验收。

## CI439 原生结果与夹具补验

[CI439](https://github.com/xurunxin/WorkMesh/actions/runs/38138126996) 的 head 为 `0bf50bebb1e38e02168df9de3a13c877c9b91b88`。Linux 原生通过；macOS 实际 6 项平台、58 项单元全通过，包含 Keychain 跨进程、其他用户读取/替换、无 ACL 正例及修改型 ACL 拒例、真实 CLI/PTY。安装日志明确 helper 原模式0644、私有副本0755、内容哈希不变。CI438 的竞争失败仍保留，不能只因一轮通过就倒填原因。新增 macOS 同用户32路并发准备目录的原生检查，观察共享祖先的合法目录变化是否造成误拒，完整安全要求不变。

Windows 的 TEMP/TMP 问题已消失，平台三项通过、两项跨用户夹具在收尾 `rmdir` 报 EPERM；finally 的错误掩盖了业务探针可能更早的错误，所以不冒两项探针本身已成功。公共夹具根由产品以当前用户非继承 FullControl 创建，再单独给 Everyone 继承 RX；普通 mkdtemp 子目录只有继承 RX，缺少当前用户的创建/删除权限。仅在一次性夹具根增加当前 SID 的继承 FullControl；Everyone 保持 RX，真实连接器子目录/文件仍由产品创建私有保护 ACL。已有失败目标不重试、不改其权限；下一 CI 使用新 UUID 夹具。ci439-native-first/windows-cleanup.json 实际证明本次最终准确根与临时用户已移除，来源 artifact id/hash 另存。

本机 local-04 再次 lint/typecheck/build 及58单元通过，平台三过两缺第二用户；1100文件在运行前后与提交0bf50be三方绑定零不一致，39目录及空根收尾。新增 macOS 专属检查的 typecheck 已通过，实际运行由下一轮 macOS runner 证明。本机进程未提权，不冒真实第二用户补验。

## CI440：实际模块首败

[CI440](https://github.com/xurunxin/WorkMesh/actions/runs/38138610138) head `4a3d98bbc40bdbeb730c2d83888cf9b4587d15ff`：Linux、macOS 原生成功；macOS 增加32路目录准备后7平台＋58单元成功，仍不能倒填CI438首败原因。Windows三项成功、两项跨用户失败，夹具临时目录已正常移除，实际新错误为 `ConvertTo-SecureString ... Microsoft.PowerShell.Security ... module could not be loaded`，账户探针未执行。完整原字节 job 日志见 ci440-windows/、ci440-macos/ 的 receipt 与归档索引。

[微软 PSModulePath 文档](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_psmodulepath) 明确说明 PowerShell7 经中间进程启动5.1会把7的模块路径传给5.1，导致同名内置模块无法加载。两处测试探针在5.1进程中先设 PSModulePath 为该进程 PSHOME/Modules，并按该路径显式加载 Security/Management；仅改变子进程，不改用户环境或产品。保留所有真实第二用户读/替换及攻击正对照断言。本机 windows-module-probe.json 实际验证5.1.26100.9032加载两个系统模块并完成非秘密SecureString探针，退出0；不将其计作第二用户验收。新增夹具改动 typecheck 通过。

retained-environment.json 记录当前准确依赖归属、成功安装日志与未变锁哈希：共享 pnpm CAS 不清，任务隔离 virtual store/copy 依赖和 Node22 runtime 因原生验证/独审尚未完成而保留。本轮 local-02/03/04 收尾汇总见 resource-summary.json。当前工作树没有达到合入后移除条件。

## CI441：第二用户进程的原生长度限制

[CI441](https://github.com/xurunxin/WorkMesh/actions/runs/38139019435) head `7e2db7c17550b82670432eb6a919302497d91c6a` 的 Linux/macOS 原生成功。Windows 模块加载已成功，准确新首败为 `Start-Process ... The parameter is incorrect`，真实第二用户进程尚未启动。[微软 CreateProcessWithLogonW 文档](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithlogonw) 给定子进程命令行上限1024字符；native-logon-limit.json 从实际失败外层命令解码 rename 子脚本，证明即使仅以最短 exe 文件名计算也超过上限。原始完整日志、错误及历史退出不改。

两个探针改将**无秘密的测试正文与路径**写到受控公共夹具中的只读脚本，以短 `-File` 命令在准确5.1 exe/第二用户身份下执行；父进程环境保留一次性密码，文件和命令行没有密码或令牌。强制计算命令行小于1024；保持隐藏窗口、真实读拒绝/安全路径替换拒绝/不安全路径攻击成功及准确退出码。夹具结束清理脚本。未改产品 ACL、安装凭据合同或系统策略；ExecutionPolicy Bypass 仅作用受控探针子进程，非用户配置。

为继续调查CI438偶发并发失败，将原双进程竞争断言独立执行16轮，保持单请求、单秘密、两进程正常退出及无秘密输出要求。local-05 对这些源文件 lint/typecheck/build 及73单元成功，平台仍三成功两缺第二用户；原始退出与源码稳定性、资源事件另存，不用模拟第二账户。无秘密探针改动另外 typecheck 成功。新三系统及最终 Required CI 继续验证。

## CI442：账户实测与攻击正对照

[CI442](https://github.com/xurunxin/WorkMesh/actions/runs/38139535195) head `b674f8c70703d39d97db655e484ad3af5054aae1` 的 Linux/macOS 原生成功，macOS 为7平台＋73单元，包含16轮真实双进程竞争。Windows 短命令实际启动第二用户，读取正对照成功、私有 pending 读取拒绝；本轮平台4项通过，余下不安全路径攻击/恢复组合返回26。原组合把 Move、CreateDirectory、Delete、Move-back 全部折叠为26，尚不能确认哪一个子操作失败。

该正对照只需要证明第二用户能重命名不安全父下的受保护子目录并创建同名替换；第二用户删除替换物及恢复不是授权/协议断言，且其新建目录继承的 ACL 不必授该账户删除权限。保留必需 Move 与 CreateDirectory，分别明确失败码26/27；攻击产物交由原有 owner finally 统一清理，不增加其他用户权限、不修改原失败目标、不绕过安全路径拒绝。安全父及连接器两处 Move 拒绝、读取控制、产品拒绝不安全祖先均保持。

三系统原始日志与准确状态保存于 ci442-native/，没有将部分总 CI 当全绿；最终 Required CI 和独审尚未放行。local-05 的54个测试目录全部移除，资源汇总与准确空根回执已更新。
