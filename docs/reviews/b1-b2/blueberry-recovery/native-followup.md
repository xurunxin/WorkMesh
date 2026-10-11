# 三系统原生验收接续

来源为 [CI437](https://github.com/xurunxin/WorkMesh/actions/runs/38136307248)，head `7e37bb1520105ff89356ebddb2344fe1e65104fb`。完整新失败日志保存为 ci437-*-job-original.log，经本目录索引无损归档。源码门禁、Linux 原生、DB/Worker、两 E2E 分片、灾难恢复及 agent smoke 已成功；查询时 API 仍在执行，不能列全仓完成。

Windows 已通过 checkout，准备临时用户的安全目录时在私有 ACL 核验失败，连接器平台测试尚未执行。原产品比较整个 SDDL 字符串，OS 的账户别名或自动继承表示可能改变字符串而保持安全语义。改为按实际二进制描述符严格核：当前 SID owner、受保护 DACL、唯一无继承 allow ACE、准确 FullControl mask 和同一 SID。不接受多个 ACE、不接受不同 owner/主体、不接受开放继承或缩减权限。新增结构化正负例已实际 3 项通过；真实 runner 原生结果另核，不仅以推断原因冒已修好。Windows 夹具在尝试创建前声明唯一目录，部分创建后校验失败也进入原有准确边界的收尾。

macOS 的无扩展 ACL/修改型 ACL 拒绝、Keychain、跨用户读取/替换门禁已实际通过，剩余 CLI 的真实 PTY 失败 `posix_spawnp failed`。锁定 node-pty 1.1.0 的上游 [issue850](https://github.com/microsoft/node-pty/issues/850) 记录 Darwin prebuild spawn-helper 的发布模式为 0644。连接器新增安装钩子：只处理准确锁定版本及当前 Darwin 架构的 package helper；保留原字节，先创建独立 inode 副本、设执行位再替换，不修改 pnpm CAS hardlink。元数据记录修改前后 mode、内容 hash 和私有副本事实，失败令安装非零退出。真实 CLI/PTY 断言保持，不以替换成管道或模拟进程绕过。

ADR0079 和连接器 README 同步这两处实现解释；已批准计划和历史规格原字节保持，零 Schema/API/事件变更。#20 分发边界不变。

本机 ci:validate 成功（含 15 项 raw archive 测试与规范验证），CI policy 18 项成功。local-02 的 31 个连接器文件与提交7e37bb逐一绑定，运行原字节匹配，仅允许 CRLF→LF 等价；结果见 committed-source-binding.json。新实现将按独有 local-03 保存新的实际源码绑定/检查，不覆盖首败或第二轮。
