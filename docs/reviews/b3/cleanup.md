# B3 资源收尾与保留

## 已收尾的本人资源

七次独有测试环境共登记 21 个容器和 21 个卷。正常路径按准确 owner 标签、完整 ID 和卷消费者核验后，停止并删除本人资源。旧就绪探测提前 exit 13 的一轮没有执行 finally，已按原登记单独收尾，没有改用共享服务。

最终再次逐项调用 Docker inspect，42 个对象均返回明确的不存在错误。准确结果见 [docker-absence.json](docker-absence.json)，不是从模糊名称或空列表推断不存在。各次 `results.json` 中的原收尾结果也保留。

首轮默认 APPDATA 测试创建的 51 个目录遭 MSIX 重定向。连接器原安全检查拒绝，测试退出后留下空目录。保全原日志、准确路径和创建时间后，核对当前用户 owner、无重解析点、无消费者和零子对象，只非递归删除登记的空目录本体。未改祖先 ACL 或删除父目录。

时间预检首次因 PowerShell 的本地时钟转换而拒绝，尚未删除任何对象。按原测试日志的 UTC 窗口，改用 `DateTimeOffset.UtcDateTime` 核对；范围没有放宽。原拒绝、预检和收尾回执分别保留。

另收尾了单元测试取消时留下的一个 config checkpoint 夹具。归属来自第三轮日志的明确创建登记。父进程只使用 MemoryStore IPC，未创建系统秘密。实际子进程已退出，五个文件只保留路径、长度和 SHA-256，不复制 pending 或 journal 正文。发现生成测试的独有目录也已按准确运行登记收尾，并保留 24 个文件的重建指纹。

实际 CLI 原生用例创建的目录和系统秘密引用由其 finally 收尾，原始 created/removed 记录保存在压缩包中。真实接入示例记录了监听器、API 和数据库连接池关闭。

## 原件与策略拒绝

运行原件按准确字节保全到两个 ZIP。已逐成员核 SHA-256，并用 Git 暂存对象再次核压缩包字节。成员映射见 [runtime-originals-manifest.json](runtime-originals-manifest.json)和[early-verification-manifest.json](early-verification-manifest.json)。完整凭据格式扫描未命中；日志沿用验证器的脱敏输出。

后续批量收尾命令在 CreateProcess 阶段被工具策略拒绝，删除没有执行。工具只返回 `blocked by policy`。拒绝后停止全部文件删除，未拆批、改属性、改权限、移动目标或换命令重试。

复核发现 `packages/conformance/conformance-results` 中三份文件是既有已跟踪结果，当前运行字节未变；该目录不应列入本人新增临时资源。保留记录已纠正。其余七个运行目录也全部保留，具体见 [artifact-compaction.json](artifact-compaction.json)。只用限定在本卡的 ignore 规则排除已归档副本，仓库保留各次可审 `results.json`。

## 继续保留的环境

当前工作树、私有 `node_modules` 和 `.tmp/workmesh-virtual-store` 保留供独审复验使用。安装使用冻结 lock、共享 store 的只读复用和 copy 导入，正常 postinstall 已执行，没有复制旧依赖现场。工具来源、锁哈希和 owner 原件保存在早期压缩包中。

私有 APPDATA 已为空，创建后核过真实路径与当前 SID 专用 ACL，保留供后续原生复验使用。默认 APPDATA、用户配置、业务数据、共享 store、借用的 Node/pnpm 工具和其他工作树保持。没有 global prune，也没有删除共享缓存锁。
