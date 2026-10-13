# 连接器产品实施计划

## 背景与授权

执行[当前完整规格](current-spec.md)。用户已选择现有 hosted Linux amd64、arm64 runner＋TCG 完整虚拟机，并放行仓库内产品实现与验收。历史文档计划和 TCG 研究计划保留。无对外发布、新 runner、设备或凭据授权。

## 实施改动

- `apps/connector/src/commands.ts`、`cli.ts`、`release-entry.ts`：抽取现有 `main`、客户端启动和退出处理，新增不访问秘密的 `--version`。协议 user-agent 保持原值。
- `trusted-key.ts`、`release-trusted-key.ts`、`protocol.ts`：源码读取固定公钥；SEA 从内嵌资产读取同一字节。完整 Skill、身份、能力及当前凭据校验不变。
- `apps/connector/scripts/`：实现 esbuild/postject SEA、锁定运行时与 headers、同架构原生闭包和许可证、严格清单与归档、离线自包含安装助手。安装校验、私有暂存及 OS 锁后原子切换，失败保旧，卸载保配置和秘密。
- `apps/connector/test/`、`test-support/` 和 `scripts/verify-connector-install.mjs`：已安装入口驱动真实 API/MCP、签名 Skill、Secret Service、拒绝与恢复、系统重启、升级和卸载。目标不含源码、workspace 或 Node/pnpm/Python 前置。
- 包清单、锁文件和适用 CI 文件：锁定构建工具；原生双架构构建与 TCG 产品验收纳入 Required CI，保留三系统安全回归及原错误合同。
- `docs/integration/`、连接器 README、协议与 Agent 入口：同步 B4 安装、配置、恢复、版本及升级卸载；记录本地构建与对外发布的区别。新增封装 ADR 保持 Proposed，注明本次实施授权。
- `docs/reviews/b-ship/product/`：保存准确 source/tree、产物及 guest 摘要、原始脱敏运行证据、首败、未测和本人资源收尾。

## 边界与条件

Linux 软件下限依据 Node、各原生 ELF 及实际目标加载确定；硬件起点不作最低承诺。构建机执行受控 node-pty 编译，目标安装与运行禁止 hook、node-gyp 和网络补件。升级不改变 pending 的 exact-retry 身份，不迁移秘密。安装干跑不得写入，受污染路径、清单、动态库或空间检查失败不切换旧入口。

## 验证与交付

执行 `pnpm check:integration-docs`、`pnpm ci:validate`、lint/typecheck/test/integration/conformance，以及 connector build、platform、build:release 和安装专项。两架构完整 TCG 系统重启须有两次 kernel/systemd、不同 boot_id、同 UID 秘密持久及原 900 秒窗口实际恢复；研究 probe 不代替产品验收。原 Required CI 及新产品验收必须绑定最终准确 HEAD。

更新 PR 标题正文并转 ready；交仅 P0/P1 正式成果独审。独审闭合且最新必需 CI 成功后才按条件授权合入，真实 merged/main/Done 前不报完成。
