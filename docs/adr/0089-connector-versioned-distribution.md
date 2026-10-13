# 连接器自包含版本化分发

Status

Proposed。用户本次已采用现有 hosted 双架构＋TCG 环境并放行产品实现；成果审查和全部产品验收尚待完成。历史研究不是产品批准。

Context

连接器源码入口不能证明无源码目标可安装。原安全机制依赖公钥文件、ESM 入口和原生系统库，需要显式封装边界。

Decision

Linux amd64、arm64 原生构建采用锁定 Node SEA、esbuild 和 postject。公钥与元数据内嵌；同架构 keyring、Koffi 和 node-pty 运行闭包及许可证随包携带。构建机受控编译 node-pty，目标无 Node/pnpm/Python 或源码前置。安装助手同样自包含，离线严格验证清单、归档及路径，OS 锁内私有暂存后原子切换。

升级保持 pending 的准确请求身份、旧配置和秘密引用；卸载保留配置及系统秘密，不增加撤销或 purge。协议、公钥校验、active 证明及可恢复提交不变。目标验收使用完整 TCG guest 的真实 OS 重启，研究成功不代发行验收。

Alternatives

普通 JS 包加宿主 Node、跳过原生库、容器重启替代完整 OS 和新增发行凭据均不采用。

Consequences

产物带运行时和原生闭包，空间预检计入归档、暂存与旧版本。无源码双架构真实安装及完整协议恢复验收纳入 Required CI，既有三系统安全回归保持。

Migration

零数据库迁移。源码入口保留。程序版本目录与配置目录分离；不会迁移或删除系统秘密。

Spec changes

完整授权与门禁见 [产品规格](../plan/b-ship/product/current-spec.md)。B4 安装及恢复文档与实际能力同步，未验收不写成已发布。
