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

## CI443 首败进一步定位与私有 ACL 补全

[CI443](https://github.com/xurunxin/WorkMesh/actions/runs/38140023468) head `6192de6833b9e92b86391d6bbb397ca9253200d1` 的 Linux/macOS 原生成功；Windows 为4通过1失败，独立26现在明确是**第一步 Directory.Move**，不能继续归因为攻击收尾。ci443-windows/ 保留完整新错误。[微软 FILE_RENAME_INFORMATION 文档](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information) 说明目标目录相对打开请求 FILE_WRITE_DATA|SYNCHRONIZE。一次性不安全父夹具原来只有DC/AD以及继承RX，增加目标条目所需WD，仍不授受保护子项 DELETE；产品继续因DC拒绝该不安全祖先。记录实际 icacls 输出，Move/Create 两步失败分别给1000/2000加原 HRESULT 低16位，仅错误码、不打印敏感材料。新UUID夹具另验，不重试历史失败目录或改变产品权限。

macOS 源码补查同时发现私有叶目录/文件仅核BSD mode，不能识别继承的读取ACL。[Apple文件系统权限说明](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html) 明确ACL allow可以直接满足读取权限，BSD mode只处理剩余权限。把原ACL读取提为共用核验：普通祖先保持拒绝修改型allow；私有目录/文件额外拒绝任何allow，包括继承专用allow，不主动删除真实用户ACL。无ACL的私有对象重核类型/dev/inode/uid/mode，只有已验证当前owner和精确私有mode的对象允许同用户操作改变ctime；祖先原完整ctime检查保留。ADR0079同步此既有敏感pending隔离要求。

新增macOS真实读取ACL夹具：确认0700/0600仍能被nobody读取的正对照，产品目录与文件拒绝，移除仅测试夹具ACL后恢复可用。实际结果由下一轮macOS证明，不能用Windows本机推断通过。local-06的73单元及lint/typecheck/build通过，平台三通过两缺第二用户，运行前后原字节无变化；54目录全部移除、空根已非递归收尾。WD/错误码夹具增量另经typecheck成功。

## CI444：真实私有读取 ACL 与父夹具属性

[CI444](https://github.com/xurunxin/WorkMesh/actions/runs/38141033179) head `3307dd19cef874545401c30aa8bef587eee3d395`：Linux6平台＋73单元成功；macOS8平台＋73单元成功，实际nobody读取ACL正对照、产品拒绝与移除仅测试ACL后恢复均通过。历史macOS竞争首败没有被删除或猜测原因；本轮16轮双进程强断言通过。ci444-native/保存三系统完整原字节日志和来源。

Windows本轮另保真实30秒读取用例超时；重命名精确1005（Move阶段＋HRESULT低位Access denied）。实际icacls输出显示不安全父只有Everyone(WD,AD,DC)及当前用户F，原产品prepareDirectory创建的该父没有继承公共夹具RX/SYNCHRONIZE。补全一次性不安全父的RX，保留DC/AD/WD和受保护子项原ACL；不是给私有对象增加其他用户权限。增加套件前的一次真实临时账户启动与SID核对，用短命令并隐藏窗口，使冷账户初始化在夹具准备阶段明确完成；测试仍为原30秒，不增加超时、不skip、不自动重试断言。任何失败仍进入原用户名/SID与准确根的清理回执。仅本机typecheck与PowerShell parser通过，后续原生结果另验。

CI443完整结果已保存ci443-complete/：源码门禁、API/DB/Worker、两E2E、灾难恢复及agent smoke全部成功，Windows失败令Required CI正确失败。该结果不是当前head全绿。CI444查询时API仍运行；其他全仓作业已成功，最终状态以后续准确run为准。

## CI445：并发首败实收与最小原生重命名探针

[CI445](https://github.com/xurunxin/WorkMesh/actions/runs/38141943330) head `84c6fdd0af9244189dc0df2555b6f95974ee0a23`：Linux成功；Windows真实临时用户SID已核，读取正对照和私有 pending 拒绝均成功，平台4通过1失败，Move仍1005；补全父RX没有解决该攻击正对照，不冒成功。macOS平台8项通过，但73单元中第4轮双进程竞争收到明确 `CONNECTOR_UNSAFE_ACL`，72通过1失败，保留精确错误与原强断言。ci445-native/首次采集在Mac job logs命令exit1中断，已有Windows原字节不覆盖；ci445-native-complete/重新取得三系统完整日志和准确来源，不把网络采集失败当产品失败。此前CI444因新的PR提交被并发规则取消，API为cancelled，不能记完整通过。

源码检查发现原无ACL核验用目录ctime作为不变条件，但同一目录的子项创建也会更新ctime，包括共享sticky祖先。此为此次错误的候选原因，原日志只有错误码、不提供失败路径，不能宣称已定位历史每次交错。修正保持类型/dev/inode/owner/mode逐值一致；ctime改变时再读取真实ACL并核对象，非ENOENT失败拒绝、出现allow继续按私有/普通祖先规则拒绝；不忽略ctime变化、不自动重试失败的操作、不扩大可信主体。新增macOS真实stat快照→新增非秘密子项→确认ctime变化→实际ACL核验正例，随后实际mode改变必须拒绝，结合原16轮双进程检查在下一Mac runner验证。

Windows攻击正对照增加最小原生API：夹具owner编译无秘密DLL，真实第二用户加载后以DELETE-only CreateFileW目录handle调用SetFileInformationByHandle(FileRenameInfo)，不请求额外SYNCHRONIZE/读取权限，保持受保护子目录原始DACL、不授其他用户DELETE。原.NET安全路径拒绝断言保留，并新增原生安全路径两项准确Access denied（1005）断言；不安全父下仍须实际移动与同名目录创建均成功。依照[微软FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info)的绝对路径、NULL RootDirectory、长度/布局规则，handle/buffer均finally释放。不能以此源码存在冒第二用户通过，后续真实CI另验。本机windows-native-rename-probe.json已证明该准确C#源可编译、当前用户实际移动成功、仅声明DLL和空目录定向收尾；该证明不涉及第二用户。新源typecheck成功，产品边界、原拒绝及30秒超时保持。

### CI445 后实际实验与最终夹具调整

前述DELETE-only DLL仅为诊断候选，并未进入正式平台用例。本机普通FullControl子项移动成功后，收窄一次性子项到RC的实验先遇到SetAccessControl请求未具备的SeSecurityPrivilege（没有申请提权）；另以仅DACL的AccessControlSections实施新的独有夹具，原生打开仍返回1005。改用OVERLAPPED消除同步打开要求的新独有夹具也真实返回1005，不能把该路线冒修复或第二用户通过。原始源码快照、失败消息和对象清单保存于windows-rename-probe-experiment.txt、verify-native-rename-experiment.txt、windows-native-rename-failure.json、native-experiment-retained.json；首次普通FullControl成功的源码仅有当时SHA，不能把后续快照冒同一源码。该候选没有保留在产品或原生测试接线。

一个实验的收尾首次rmdir在 `.tmp/rename-probe-1bc20940-3d2c-482c-9aeb-dfcee8fca580/source` 返回EPERM并掩盖其先前实验异常，未继续重试、改该目标ACL、父删或换法；另一实验在native1005后保留准确根与非秘密DLL/目录供复核，没有派发删除。两根绝对路径和当前对象/ACL可查native-experiment-retained.json。它们是本轮新增小型保全例外，不声称全部临时资源已清空。成功普通实验及此前SeSecurityPrivilege失败实验的根已按原空目录/普通DLL收尾，不冒磁盘净释放。

正式Windows夹具回到实际.NET API，不给受保护子目录/文件增加任何其他用户权限。DC-only祖先仍单独断言产品拒绝；攻击正对照另外在一次性unsafe祖先授DELETE，安全父仅授新增条目WD/AD（不授DELETE/DC）。真实第二用户须移动**整个不安全祖先**（包含原始私有子目录），并在原路径创建替代祖先/连接器；安全父与安全连接器两项移动仍必须失败。移动后owner逐项验证原私有目录/文件DACL与原字节保持。该攻击证明私有叶权限不能代替祖先安全，不冒DC-only已成功移动私有叶，也不减少DELETE/DC产品拒绝断言。下一真实Windows runner验证此新UUID夹具，不再尝试历史失败目录。

macOS最终改动不是前文拟议的ctime忽略例外：所有无ACL对象均先核同一对象与安全属性，ctime改变就第二次读取真实ACL；第二次出现ACL则完整验证，非ENOENT或身份/安全属性变化仍拒绝。真实ctime夹具与16轮原竞争断言保持，结果待新CI。不宣布候选原因已证明历史每一次首败。
