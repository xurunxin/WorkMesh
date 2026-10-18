# TA01 当前交付与诊断报告

## 当前范围与实际状态

用户于2026-10-19 03:41明确“跳过ARM发布，目前只聚焦x86平台部署交付，然后继续完成计划推进”。本卡恢复Linux amd64（x86_64）基础交付，完整当前责任已入[current-spec-amd64.md](current-spec-amd64.md)。ARM服务端交付／验收延期，不继续未批企业ARM实验；连接器既有双架构能力保持。仅仓库内交付，不对外发版或生产切换。

本轮输入head为`1de9bf3d777901796247af916139d4bfa36e6811`。GitHub只读API重新核main为`c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`，PR228真实head与本地一致、draft且未合入。平台Git缓存仍被既有index.lock阻塞，未删除／绕写缓存；不是用FETCH_HEAD冒main。当前交付head以PR真实ref及检查原件为准。

## 本轮改动及验证目的

服务端CI现在只生产一次amd64候选，个人／团队／企业各独立完整guest。候选ID及manifest摘要直接绑定amd64生产者，不再有ARM备用引用。Required仍要求实际选中的全部job成功；矩阵、完整三画像、交接顺序、不可变工件、不得跳过及吞失败均有负例。连接器双架构workflow块保持原字节内容。

构建入口在Git／Docker／输出目录操作前拒绝ARM。启动器核可信manifest摘要后，在Docker镜像导入前拒绝非Linux x86_64宿主或非amd64清单。安装器还独立核manifest平台及Docker服务端OS／架构。`INSTALL_UNSUPPORTED_PLATFORM`表示延期／不支持的平台，`INSTALL_WRONG_ARCHITECTURE`表示目标Docker平台不符。历史ARM清单仍可严格解析用于证据及兼容核对，不表示当前安装支持。

验收入口`run.py --arch arm64`在创建guest目录前明确拒绝。底层历史共用ARM工具和原件保持；没有删连接器能力。无schema／迁移／领域API／MCP／事件语义变化，没有缓存资格、删来源快照或修改保证。固定zh-tech-writing来源`ffda9353768dece8aabd26ccb3a4978025e9437c`，同次同步计划、规格、设计、验收及接入平台说明；安装／升级／回退／恢复参数保持。

这次新候选验收的明确目的为验证收敛后的真实分发入口、单生产者／三guest交接和原完整闭环，不是靠再跑一次来关闭139。固定Node22.19.0、原QEMU／guest／4vCPU／4GiB、原产品30秒、健康180秒、安装1800秒及guest9000秒等期限保持。新运行及工件尚待推送后准确绑定，旧绿不补最终候选。

## 适用检查及首败

本轮首轮范围编辑误触连接器ARM矩阵，CI策略负例已阻断；恢复连接器原配置后23项策略检查通过。这是本轮编辑错误，不是产品根因。

首次本机安装单元因Windows未提供适用镜像ID失败；补用旧归档MCP镜像后又明确`curl: not found`。这些属于健康测试环境前置，原断言和期限未放宽；两份本机失败日志保在本任务临时目录。新平台拒绝用例通过。以既有含curl依赖镜像按准确ID复验的实际终态及其他检查见本轮检查记录，不能提前填PASS。

随后复用既有RustFS镜像`sha256:df972be33b984b13cdcf49f5fe132db249f779fb476be751ac6032ef3b1c55ff`，相同安装单元17项全部通过；owner标签残留容器为零。复验没有安装curl或改镜像。完整命令／日志／摘要见[本轮检查记录](../../reviews/ta01-product/amd64-scope-resumption-checks.json)：23项CI策略、24项CI校验及接入静态检查通过（4技能／102链接／35 REST／11 MCP）；连接器workflow块与输入提交逐字相同。diff空白检查通过，autocorrect缺失按固定技能手检。

Python原有60项通过；ARM验收入口实际返回invalid choice，未启动VM。根lint／typecheck／test／integration／conformance五门禁及本候选实际完整guest须由新CI真实执行，本机局部检查不代它们。当前尚无本轮候选成功Required。

## 未闭139与定向定位边界

旧API139、MCP139仍未闭。initialize不读资格，通知来源快照和资格响应成本不能解释尚未进入该路径的initialize139；不以三AMD旧通过关闭。

现有MCP原件只定位到准确公开Node二进制的IC::UpdateState+128及有界LoadIC/CEntry帧，没有失效对象来源。上游固定v22.19.0源码中[IC::UpdateState](https://github.com/nodejs/node/blob/v22.19.0/deps/v8/src/ic/ic.cc#L271)负责内联缓存状态更新，位置不指向具体WorkMesh语句。不能据函数位置选择某个业务函数修复。

重新对照上游[Node59740](https://github.com/nodejs/node/issues/59740)和[QEMU2220](https://gitlab.com/qemu-project/qemu/-/issues/2220)：前者报告TLS／X509路径，后者是宿主QEMU进程在地址翻译路径崩溃，均不等于本卡guest Node的V8位置。这只能拒绝把公开报告直接套成本卡根因，不能排除所有运行时或TCG问题。没有据此更换Node／QEMU或资源，也未对外提交日志或issue。

接续动作先核新amd64候选原完整组合中的进程退出／首败和源指纹；若再现139，按最早实际动作与现有捕获边界定向验证。若新组合通过，仍保留139未闭，不自动重复矩阵。需要运行时／资源／期限／保证变化时再给准确分歧，不静默变更取绿。历史[修复关口](repair-decision-gate.md)中的ARM实验已取消执行，不是恢复推进的前置。

## 历史结果及原件保留

CI567/run38893305755仅绑定`e2763da4dfdf25f7fc5c28c34a9619d4788f4541`，终态failure，Required117011885049 failure：个人／团队／企业AMD均完整通过；ARM个人在序号23 restore-empty开始后9000秒缺最终回执，团队序号21 recover-old开始后9000秒缺件，企业升级后commit16 tools/call30443ms失败。三ARM现为延期，不改失败为通过。显式CI563/run38831565958保持旧失败，无新dispatch／rerun／cancel。

[2312282完整测量报告](https://github.com/xurunxin/WorkMesh/blob/2312282fce857a1b7b90a9c30ef6c1c92d6fdb2f/docs/plan/ta01-self-hosted-deployment/current-delivery.md)和[1de9bf3关口报告](https://github.com/xurunxin/WorkMesh/blob/1de9bf3d777901796247af916139d4bfa36e6811/docs/plan/ta01-self-hosted-deployment/current-delivery.md)保留全部阶段、准确工具、原件索引、首败及资源账本。1800秒一次例外已耗尽，实际1392.55秒、2目标GET／8供应请求、独立API布局，只证明该样本。前三次1200秒incomplete／未知请求数／TERM和2026-10-17不批准新ARM取证均不倒填。

## 资源、审查及完成条件

本轮仅复用既有镜像做本机健康脚本检查；不安装宿主依赖、不注册设备或runner、不增权。健康测试用精确镜像ID、--rm及/data tmpfs避免匿名卷，按owner标签核残留；其实际收尾结果随检查记录保存。旧树、候选、共享store／镜像／数据、其他项目、未知卷和受拒目录保持，无prune／reset／clean或缓存锁删除。

Saved plan原记录例外继续，平台字段未同步不冒已更新。PR227仅恢复来源。原九类合同、实际资源测量、适用真实连接器／外Runner联合验收及所有非平台DoD保持。全部最终amd64验收、139闭合、P0/P1正式产品独审、最终准确head最新Required成功且PRready前不合入、不报Done。完成本卡后才衔接剩余TA计划。
