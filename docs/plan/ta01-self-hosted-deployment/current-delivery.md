# TA01 当前交付与诊断报告

## 当前候选与范围

本轮服务端仅交付 Linux amd64（x86_64）三画像。ARM 服务端延期，旧失败和未批取证保持；连接器既有双架构不变。完整责任见 [current-spec-amd64.md](current-spec-amd64.md)。仅仓库内交付，不对外发版或生产部署。

当前受测产品 head 为 `8ff1f8bf87b1593ff4833b1ab1358e71f8a23a8b`，parent 为 `1de9bf3d777901796247af916139d4bfa36e6811`。该提交已同步分发入口、三画像 CI、配置及安装文档的 amd64 范围。本次后续改动只归档测量和报告，未改产品代码、schema、接口、事件、安装参数或配置示例。接入说明仍与 8ff1f8b 一致，无需重写合同。

执行者以 GitHub API 核 main 为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`、PR228 为 draft／未合入。本地祖先检查通过。平台共享 Git 缓存仍有既有 index.lock，未删除或绕写；没有以 FETCH_HEAD 冒 main。PR227 仅为恢复来源，旧树和远端保留。

## CI568 的实际覆盖

普通 [CI568／run39160943688](https://github.com/xurunxin/WorkMesh/actions/runs/39160943688) 绑定 8ff1f8b。17 个 job 已全部终态成功，准确状态和读取时间见 [本次快照](../../reviews/ta01-product/ci568-observed-status.json)。新增结论均仅来源执行者。

| 当前 amd64 画像 | job | 原件结果 | 总耗时／重启 |
| --- | --- | --- | --- |
| 个人 | `117776215698` | success／完整脚本通过 | 3325.11／205.63 秒 |
| 团队 | `117776215723` | success／完整脚本通过 | 3925.00／238.20 秒 |
| 企业 | `117776215746` | success／完整脚本通过 | 4010.72／240.83 秒 |

17 个 job 全部 success，Required `117791572117` 成功；连接器 amd64／arm64 也成功。三组均核 22 输入、六脚本、独立重启和四项业务恢复证明；只绑定本次候选，不外推历史崩溃已修复。团队与企业原件分别见 [团队索引](../../reviews/ta01-product/ci568-amd64-team-full-guest-pass.json)、[企业索引](../../reviews/ta01-product/ci568-amd64-enterprise-full-guest-pass.json)。

个人原始 artifact `12150314146` 的 ZIP SHA-256 为 `6f2f8c58559df90fff5a374c89aeb9ad31779637bcbbc786294674e9416d8beb`。[个人完整原件索引](../../reviews/ta01-product/ci568-amd64-personal-full-guest-pass.json) 核准 11 个成员、六脚本、manifest 和准确生产者。总耗时 3325.11 秒，重启 205.63 秒；boot ID 改变，QMP 有 RESET／SHUTDOWN，重启后认证 API、认证 MCP、工件字节、新 outbox 投递四项证明齐全。该组合通过不关闭旧间歇性 139。

一个 amd64 生产者 job `117774122752` 成功。原始 artifact `12149027495`、ZIP SHA-256 `ef683552b8f34513346991353040076b4dfe197438dc214bc59817086fd02820`；候选 artifact `12149455692`，manifest SHA-256 `0600e39bd4bbd1b4be8ad1b5692e5983f5b4f045c16f04b139f2edcfa8807468`。22 项发行输入及 source-commit 原字节与 Git 一致，见 [生产者索引](../../reviews/ta01-product/ci568-amd64-producer.json)。未重复下载 427 MB 候选。

source-gates 实际 checkout 为 PR 合成提交 `f4c7ce06507c9b08dd79bd020a347254afb65da4`，parents 为 main 和 8ff1f8b。其 tree 与生产者同为 `a280ef4bad31f6065af72d1403d3060b8a254ca7`；不能把合成提交写成产品 head。运行的根检查由 source-gates、各 integration 和 conformance job 承担，本机局部检查不替代它们。

本次纯资料提交使用 `[skip ci]`，避免 JSON／ZIP 证据按未知路径策略触发无产品改动的全矩阵重复验收。CI568 全部自然终态后才提交，没有因本次提交取消在途 job；未改路径分类或失败门禁。[GitHub 规则](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)明确跳过提交不会运行对应 push／pull_request 工作流，也不会提供成功的必需检查。本资料 head 没有成功 Required，不能合入；没有 dispatch、rerun 或 cancel CI568。

## 已完成的唯一一次 amd64 固定 guest 对照

先只读核账本、目录和带归属标签的容器，确认之前只执行原生联动，没有启动本次 VM。随后执行一次有界对照，没有追加轮次。

完整命令、实际脚本、输入摘要、阶段、结果及收尾见 [对照索引](../../reviews/ta01-product/amd64-real-api-mcp-comparison.json) 和对应 ZIP。宿主命令为：

```powershell
python .tmp/ta01-resumption/provision-real-api-mcp-tcg-once.py
# 仅在独有控制容器内安装已核精确工具；完整命令见原件。
python .tmp/ta01-resumption/prepare-real-api-mcp-tcg-once.py
python .tmp/ta01-resumption/start-real-api-mcp-tcg-once.py
```

宿主未安装依赖。QEMU 精确 `8.2.2+ds-0ubuntu1.18`，二进制 SHA-256 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854`。复用固定 amd64 guest，SHA-256 `6a81c37564db9b1ee84e141922625e1d7c5b389b99bb3c572e0243607d5bb4d2`，kernel `6.8.0-142-generic`。个人 CI568 原件也确认相同 QEMU 版本和 guest 摘要。仍为 TCG、4 vCPU、4096 MiB、原 virtio 网络／磁盘设备与 40 GiB 组件 overlay。

Node 为 v22.19.0，二进制 SHA-256 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`。Node 上限 600 秒，业务请求 30 秒、健康 180 秒，VM 总窗 1200 秒；没有改运行时标志或续用已耗尽的 ARM 1800 秒例外。

API／PG／Redis 取自已核 CI566／541f6ba 角色，MCP 取自 CI563／9c8bbff 的准确旧崩溃角色。四份归档和 Node 测量脚本与原生对照逐字一致。`apps/`、`packages/` 从 9c8bbff 到 8ff1f8b 无差异；这不证明整个新候选镜像相同。两组均通过真实安装／配对路由 inject 供应身份，目标 API／MCP 为独立进程真实回环 HTTP。逐请求鉴权、实时资格和撤销拒绝均保留。

| 实际结果 | 原生 | 固定 amd64 guest／TCG |
| --- | --- | --- |
| 完成轮数／MCP POST | 32／65 | 32／65 |
| 资格／工作项 GET | 33／32 | 33／32 |
| initialize 中资格读取 | 0 | 0 |
| initialize 最大 wall | 43.15 ms | 2631.56 ms |
| tools/call 最大 wall | 321.24 ms | 12649.25 ms |
| MCP 启动健康请求 | 2 | 13 |
| Node 总耗时 | 11.31 秒 | 243.87 秒 |
| 撤销后拒绝／API、MCP、PG、Redis 退出 | 拒绝／均为 0 | 拒绝／均为 0 |

每组另有 8 次 fixture 供应和 2 次撤销相关 inject，不能与目标 HTTP 请求混计；未统计所有其他 API 路由的总请求数。第 65 次 MCP POST 是撤销后读取，资格加一、工作项不增加。测量源码的 mode／client name 字面值保留 native，以核同字节；外层命令、kernel 和回执确定实际 TCG 环境。

VM 实际 595.16 秒，QEMU 正常关机退出 0，没有达到总窗或宿主 TERM。13 条回执中有 12 条安全阶段和 1 条最终报告；固定 guest、六输入、网络隔离、角色、PG／Redis、Node 起止均先保存。最终报告才确认实际请求数，未从计划数补齐。该样本没有业务首败；不能改写旧失败。

这是独立旧角色的稀疏组件布局，跳过镜像 entrypoint。PG 为旧组件的 max_connections=20／shared_buffers=64MB／统计配置，没有 Worker、S3、TLS、反向代理、升级／恢复竞争负载。原生 kernel 为 LinuxKit，TCG 为完整 Ubuntu guest；不能把 wall 比值归因于单一 CPU、查询或调度因素。没有内部 SQL／CPU 阶段分解，不作相减补齐。

## 可证伪解释、已知缺口与下一步

| 解释 | 本轮直接证据 | 尚未证明及下一项判据 |
| --- | --- | --- |
| 真实 API 上游交互足以稳定触发 139 | 已补真实跨进程上游，两组各 32 轮均未复现 | 不支持“该稀疏路径每次必然失败”；仍不排除特定生命周期、负载、升级布局或间歇故障 |
| 资格读取成本直接解释 initialize139 | 源码及每轮计数均确认 initialize 不读资格 | 不能用资格耗时解释尚未进入该路径的崩溃；未排除其他动作的间接影响 |
| 固定 TCG 环境或产品实现导致间歇坏值 | 固定版本、guest 和真实角色样本均退出 0 | 两组都未崩溃，无法在产品实现、V8／依赖与 VM 间选择根因；需原首败窗口的坏值来源证据 |

旧 API139 无 core；旧 MCP139 仅有 `IC::UpdateState+128`、LoadIC／CEntry 有界公开帧，尚无失效对象来源。上游相似帧和有限阴性样本都不能支持某个产品补丁。本轮没有改通知、事件、事务快照、实时资格、鉴权、Node、QEMU、资源或期限。

CI568 三画像终态及原件已保存，本轮没有新业务首败，也不重新运行矩阵。旧 139 仍未闭：缺的是旧失效对象／坏值来源与原动作的因果关联，不是再一次绿色运行。新的 amd64 原组合取证须先写明具体窗口、最少捕获、停止条件与预算待裁定，本次不自动启动第二次 VM 或更换运行时，不实施猜测性修复。ARM 企业读取超时和个人／团队总期限缺件分别延期，不套为同一原因。

## 检查、来源与安全收尾

8ff1f8b 的既有本机结果为：23 项策略、24 项 CI 校验、17 项安装单元、60 项 Python 及接入静态检查通过。首次缺镜像和旧 MCP 缺 curl 的前置失败保留。详见 [范围检查记录](../../reviews/ta01-product/amd64-scope-resumption-checks.json)。本轮脚本 AST、输入摘要、逐字 Node 脚本、回执计数、撤权拒绝及退出检查均按原件核对；文档检查结果另记 [本次资料检查记录](../../reviews/ta01-product/amd64-component-delivery-checks.json)，不重复根产品测试求绿。

[启动器平台实测](../../reviews/ta01-product/amd64-bootstrap-platform-boundary.json)只证明新 ARM 清单在 Docker 操作前拒绝，amd64 继续到缺 Docker 预检。测量 shell 为 0；外层 runner 因不存在错误文本大小写分类而为 1。仅只读补核准确 ID 已不存在，没有重跑测量或重复删除；不把它冒完整安装通过。

三个本轮独有控制容器已核准确 owner／完整 ID 并移除：平台边界 `0c9fc7e7f9a3ccb92f66de719c163ac6551c22858de9ee563dc85d923a86dbd9`；原生 `3dbb6be1a9d04386697cea29d4740a8d9deacd13e8051b529d638308688f2c9c`；TCG `cf32d1d4e330e2ea07a9c11ae90d73138dbc9e07604c3be4fde44cbab5ac4470`。无宿主挂载、设备、公开端口或新权限。TCG 收尾前进程名仅控制 sleep 和取样命令，无 QEMU／Node／PG／Redis；控制 PID1 的 stop 不冒业务进程退出证据。保留单份公开输入缓存；私有密钥、数据库、服务日志和磁盘未入库。旧树、共享 store／镜像／数据、未知卷、受拒目录和其他项目保持。

按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及 typography／manual-structure 核写；autocorrect 缺失手检。Saved plan 记录例外继续，未冒平台字段已同步。

## 历史和完成门禁

CI567／run38893305755@e276 仍为三 AMD 通过、三 ARM 失败、Required117011885049 失败。旧 ARM 企业读取超时、两组总期限缺件、前三次 1200 秒 incomplete、一次 1800 秒例外和 2026-10-17 未批新 ARM 取证均保持原件，不倒填。

[8ff1f8b 范围接续报告](https://github.com/xurunxin/WorkMesh/blob/8ff1f8bf87b1593ff4833b1ab1358e71f8a23a8b/docs/plan/ta01-self-hosted-deployment/current-delivery.md)、[2312282 完整历史报告](https://github.com/xurunxin/WorkMesh/blob/2312282fce857a1b7b90a9c30ef6c1c92d6fdb2f/docs/plan/ta01-self-hosted-deployment/current-delivery.md)及 [1de9bf3 关口报告](https://github.com/xurunxin/WorkMesh/blob/1de9bf3d777901796247af916139d4bfa36e6811/docs/plan/ta01-self-hosted-deployment/current-delivery.md)保留全部旧来源。本次 1200 秒为已述单次 amd64 对照，不是第五次 ARM 实验。

本轮没有关闭 139，也没有正式成果审、合入或发布。原九类合同、实际资源测量、适用连接器／外 Runner 联合验收及全部非平台 DoD 保持。受控安装器内的同程序升级／回退／空目标恢复已由本轮脚本验证；裸 Compose 迁入仍未实现，历史已发行程序对没有本轮实测，不据同源夹具外推。最终 amd64 原真实验收、139 闭合、仅 P0/P1 正式产品独审、最终准确 head 最新 Required 齐全且 PR ready 前不得合入或报 Done。
