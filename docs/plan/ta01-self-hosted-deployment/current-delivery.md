# TA01 当前交付与诊断报告

## 当前源码与结论

基础交付尚未完成，PR228 保持 draft，未达到正式成果独审或合入条件。本次反馈接续时，本地及 PR 的真实 head 为 `ac0a4d21deba15a23c8c7b40f671b59c41f30f37`，tree 为 `533b47b03da5a1c68083eb470b069b26f2e3c4ae`。这是平台中断后产生的 checkpoint，parent 为 `5371f16e24db94415155228dfc8ac149523573a0`。本轮新增工具按准确文件 SHA 绑定，后续提交自身不预填 SHA。

本轮已完成固定 Node／guest／QEMU 的 AMD64 原生和 TCG 小组件对照，以及两环境各12次进程冷启动，并补完准确CI563 MCP镜像角色的原生／TCG对照及准确CI565 ARM角色补测。确认了组件成本和 TCG 中的时延变化，有限样本均未复现139。没有证据支持准确产品修复，未改产品、安装器、CI工作流、锁定运行时、请求期限或保证；仅补验收助手已有API日志的有界投影。首败提前上报仍只算证据修正。

以下运行、原件和小测结果均来自执行者直接读取，不能冒称 Chief 已独立复核。Chief12:48快照保留为来源；CI564的个人 AMD64 后来也实际取消，不能沿用较早 running 状态。历史与批准入口见[接续记录](resumption.md)，[上一版报告](https://github.com/xurunxin/WorkMesh/blob/ac0a4d21deba15a23c8c7b40f671b59c41f30f37/docs/plan/ta01-self-hosted-deployment/current-delivery.md)固定保留旧时点、原件及假设。

## CI564 真实终态与取消

普通 [CI564／run38846561914](https://github.com/xurunxin/WorkMesh/actions/runs/38846561914) 受测源码为5371，运行终态为 **cancelled**，Required job116816927133为failure；14个其他作业success。[终态索引](../../reviews/ta01-product/ci564-final-results.json)及[材料](../../reviews/ta01-product/ci564-final-results.zip)保全部作业、双生产者、checkpoint和并发规则。

| 画像 | AMD64 | ARM64 |
| --- | --- | --- |
| 个人 | job116800972564，cancelled，缺result | job116800972501，cancelled，缺result |
| 团队 | job116800972528，success，1,783.10 s | job116800972574，cancelled，缺result |
| 企业 | job116800972536，failure，2,821.11 s | job116800972535，cancelled，缺result |

团队[原件索引](../../reviews/ta01-product/ci564-amd64-team-full-guest-pass.json)核准确六脚本、同一生产者及manifest和11成员。重启恢复117.39 s；不同boot_id／两次kernel、QMP RESET／SHUTDOWN、QEMU退出0及重启后四项后台证明齐全。仅该准确候选／组合通过，不关闭旧139。

四份取消原件均只有10成员，确实没有result.json。20个发行输入及六Python脚本、前后source、生产者、manifest已逐字核5371f16，缺件仍保留。个人AMD最后见action25 upgrade完成；ARM三组最后只见action6 stage开始。没有最终回执、完整重启或远端资源收尾证明，不能补为自然失败或通过。

取消索引分别为[个人AMD64](../../reviews/ta01-product/ci564-amd64-personal-cancelled.json)、[个人ARM64](../../reviews/ta01-product/ci564-arm64-personal-cancelled.json)、[团队ARM64](../../reviews/ta01-product/ci564-arm64-team-cancelled.json)和[企业ARM64](../../reviews/ta01-product/ci564-arm64-enterprise-cancelled.json)，各自绑定可得原ZIP。

执行者未调用cancel／rerun工具。平台checkpoint推送后，新PR运行使用相同 `ci-pull_request-228` 并发组，旧四组随后取消；与仓库 cancel-in-progress 规则一致。GitHub接口没有独立取消发起者字段，这个因果归属仍是规则、时序及执行者记录支持的推断，不能写成六组均自然结束。

## 企业 AMD64 新首败与提前摘要

[首败索引](../../reviews/ta01-product/ci564-amd64-enterprise-first-failure.json)和[原件](../../reviews/ta01-product/ci564-amd64-enterprise-first-failure.zip)绑定artifact12025775764。原ZIP SHA为 `7584aee6044e5874411e92537521b99c7879c67c7047ac2a85794bb561943bda`，准确候选为12024116322，manifest SHA为 `7bf943924acc816828d14eff80b80d0995c13f2dd079550cf10a2168e038d536`。

action17 rollback完成；action18 commit的原initialize／id1在3,367 ms后ECONNRESET，无响应头或体。journal为healthy／validate-business-read failed。本次故障为MCP die139，不能套旧CI562企业API139。

准确MCP容器 `4757173fb5ff5202fe714023f8872faccad43f44e893324a00f8221167767c54` 的历史die事件timeNano为 `1792125358462709126`。较晚MCP重启1、无OOM、health=starting；API／Worker无重启且健康。代理第10次只到request-read、3 ms／OtherError，没有request-sent证明。没有core或应用调用者，不把OtherError猜成具体网络异常。

提前failure的hostElapsed为2,733.913519237 s，diagnosticsPending=true；最终failure为2,819.635980207 s。同一宿主单调钟的间隔为85.72 s，已实际保全后置诊断前的业务首败；最终仍failed。这个局部结果不能证明ARM也已覆盖，不能算139或迟响应修复。

die事件UTC早于journal本次读取约0.75 s。只保时序，不能称该initialize触发崩溃。initialize本身不走资格读取路径；资格响应处理成本不能解释这个失败请求自身。先前请求、启动状态和后台活动是否有关仍未知。

## CI565 真实终态

<!-- ci565-state-start -->
普通[CI565／run38852474436](https://github.com/xurunxin/WorkMesh/actions/runs/38852474436)绑定ac0 checkpoint，**整体failure、Required job116861412474 failure**；14个其他作业success。六guest全部自然终态，无取消，未手动重跑或追加整轮。见[终态索引](../../reviews/ta01-product/ci565-final-results.json)及[材料](../../reviews/ta01-product/ci565-final-results.zip)。

| 画像 | AMD64 | ARM64 |
| --- | --- | --- |
| 个人 | job116819727381，success，1,897.90 s | job116819727338，failure，8,416.98 s |
| 团队 | job116819727307，success，2,756.52 s | job116819727392，failure，8,453.10 s |
| 企业 | job116819727306，success，1,712.58 s | job116819727487，failure，6,449.45 s |

三AMD分别核[个人](../../reviews/ta01-product/ci565-amd64-personal-full-guest-pass.json)、[团队](../../reviews/ta01-product/ci565-amd64-team-full-guest-pass.json)、[企业](../../reviews/ta01-product/ci565-amd64-enterprise-full-guest-pass.json)全部11成员、六脚本、同一AMD生产者及manifest。各有两次不同boot_id／kernel、QMP RESET／SHUTDOWN、QEMU退出0和重启后四项后台证明；重启恢复分别126.75／179.19／112.51 s。本候选本组合通过，不抵消旧API139或MCP139。
<!-- ci565-state-end -->

双生产者已真实通过55项Python和16项安装单元，六脚本及manifest commit／tree均匹配ac0。见[生产者索引](../../reviews/ta01-product/ci565-producers.json)和[原件](../../reviews/ta01-product/ci565-producers.zip)。AMD候选12026048774，ARM候选12025743289，各架构三画像复用同一生产者。5371f16的成功不能套给它；新CI即使成功，也不能代未闭API／MCP139和原真实验收。

### CI565 ARM64 企业的最早未预期失败

[原件索引](../../reviews/ta01-product/ci565-arm64-enterprise-first-failure.json)绑定job116819727487、artifact12029782547，原ZIP SHA为 `b86a300e60567e1419826ad65dbde85863ec5448df295ea02ed9360310c8dd2e`，11成员及ac0六脚本均已核。ARM生产者12025743289，manifest SHA为 `24c11b5f274007c71e5907b1bd7934bcbda3ddd2fc0dc812f79765b81fe3861d`。

action9是失效凭据拒绝夹具：HTTP200包含toolError，原检查按拒绝完成，不能把它当本次未预期首败。action10才是正常首次commit；initialize完成后，原get_work_item／id2在30,382 ms无响应头／体超时，INSTALL_BUSINESS_VALIDATION_TIMEOUT。代理第7次后来只到upstream-complete／200／48,313 ms、下游失败，不能补客户端成功。此前首次身份读取的verify_connection曾在90秒窗口内用42,538 ms完成，与30秒业务读取分开。

较晚API／MCP／Worker均healthy、重启0、OOM=false；已采有界owned事件窗口为空，不能把本组超时合并成旧API139或MCP139。databaseBudgetUnavailable，不能据此说连接耗尽。采集时可用内存约3.0 GiB、load约15.7；这不是失败瞬间的CPU、内存或调度证据。

提前failure的hostElapsed为6,077.642499187 s、diagnosticsPending=true；最终failure为6,448.480410862 s，间隔370.84 s。总guest为6,449.45 s，未用尽150分钟，证明这次业务30秒首败独立于宿主总期限。提前路径已在本组真实保全，但后置采集耗时不能倒因解释先前超时。已完成的身份／限流／工件／outbox等前缀检查不代完整升级、恢复和重启。

根据该准确首败已完成一次ARM MCP角色组件补测，结果和适用边界见后文。没有准确产品修复，也没有据同一超时代码合并根因。

### CI565 ARM64 个人与团队

[个人原件](../../reviews/ta01-product/ci565-arm64-personal-first-failure.json)为artifact12031811200，原ZIP SHA `95e34d8bc37fba2c44bb480ee9177e242f9a5516531afcc6a73396057c5fb7a4`；[团队原件](../../reviews/ta01-product/ci565-arm64-team-first-failure.json)为artifact12031307281，原ZIP SHA `cbf86f9ca2071f81304be73d331bba3908c2ecab10d1da88248af5dad0e980a9`。各11成员和ac0六脚本／ARM生产者均核，原数据不倒填。

个人action19、团队action16都在recover-old后进入同程序升级夹具的commit；journal候选为夹具清单 `9f15e50daec877da2cf21301ef01a7b1863cd77327ae92d8d485edadb972542a`，不是另一个历史已发行程序。原get_work_item／id2分别30,392／30,602 ms无头／体超时；代理后来上游200为37,141／33,952 ms，均下游失败，不能补成功。两组与企业的首次正常commit阶段分开。

两组较晚API／MCP／Worker均健康、重启0、OOM=false，有界owned事件窗口为空；未观察到本组三组139，不能据此关闭旧139。个人PG快照为3／20连接、track_activities=false，团队为3／100、true，均含采集自身；不是历史等待或峰值证据，不外推企业不可得的快照。

个人pending至final为8,111.697312619→8,416.011634796 s，间隔304.31 s；团队为8,199.975325164→8,452.140348276 s，间隔252.17 s。三ARM均在150分钟之前因业务读取失败结束，不能把这次首败归为宿主总期限耗尽。完整恢复／整机重启仍未通过。

## 固定条件的原生／TCG对照

[对照索引](../../reviews/ta01-product/resumption-mcp-native-tcg-comparison.json)及[原件](../../reviews/ta01-product/resumption-mcp-native-tcg-comparison.zip)保47成员，包括两组配对结果、每次实际工具字节、输入摘要、串口、版本、隔离和收尾账本。

先在独有Ubuntu容器确认精确QEMU包 `1:8.2.2+ds-0ubuntu1.18` 可得，再安装并核输出与CI的 `QEMU emulator version 8.2.2 (Debian 1:8.2.2+ds-0ubuntu1.18)` 完全一致。本地QEMU二进制SHA为 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854`，CI未提供可比二进制SHA，不能额外宣称二进制逐字相同。

guest沿用原Ubuntu固定镜像SHA `6a81c37564db9b1ee84e141922625e1d7c5b389b99bb3c572e0243607d5bb4d2`，QEMU仍 `-accel tcg -m 4096 -smp 4`，实测kernel为6.8.0-142-generic、CPU数4。两个独立小测VM的boot_id不同，均QEMU退出0；没有新增宿主安装、权限、设备、端口或常驻服务。

Node来自既有公开基础镜像 `sha256:6b2127043c2faa4f15cdcdeb65a39fc9afbecf5559301898b754bbff561a8aa9`。Node22.19.0可执行文件SHA为 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`，与CI563真实崩溃目标逐字相同。相同rootfs和组件在原生容器及guest内chroot运行；原生控制4 CPU／4 GiB、非root、无网络和宿主端口，TCG外层容器也核4 CPU／4 GiB，无宿主挂载、设备或特权模式。

组件为5371f16的MCP／SDK／contracts编译闭包，三包源码到ac0未变，95包和准确文件摘要沿[原输入索引](../../reviews/ta01-product/resumption-mcp-component-probe.json)。打包与build曾并行，完成后逐字核59个workspace输入相同。没有依赖重装或钩子执行。工具自身本轮增量按各次SHA保存，不用新源码倒填旧结果。

### 只读业务对照

两环境各12组initialize／get_work_item，共24个HTTP请求；两种合成安装身份交替，仅授 `work:read`。每次核返回身份和工作项，未知合成请求为0。实际MCP HTTP、SDK资格校验、投影及工具处理运行；无真实PG／Redis／S3、外部身份或TLS。scope、features和工作项仍是合成值，真实guest的资格响应大小未知。

| 原请求 | 原生wall中位数／最大值 | TCG wall中位数／最大值 | 资格读取 |
| --- | --- | --- | --- |
| initialize | 11.85／85.06 ms | 198.26／1,784.10 ms | 两环境均0次 |
| get_work_item | 40.26／128.69 ms | 724.07／1,922.66 ms | 每次各1次，再读工作项 |

资格合成响应为309,710 bytes／287项发现操作；SDK资格调用wall中位数为原生24.60 ms、TCG373.87 ms。工具请求CPU中位数为64.70／1,206.43 ms，包含同进程合成API；CPU可跨多线程累计，不能当单核比例。本组未启用Inspector，不能用此前有profile、1 CPU／512 MiB的结果直接作性能倍数比较。

两个工具源码SHA均为 `fc54c22063842f42cb37e6534b2853b5a95abc118f87c4ebaa7f6abdeff532fa`。每个环境均进程退出0；这批AMD64合成读取最大约1.92 s，没有触及30秒或复现139。不能据此排除原生故障，或把AMD结果外推为ARM50秒的解释。

### 零POST进程冷启动

根据新首败的时序，另用固定12个独立Node子进程，只重新导入实际MCP HTTP图并创建服务。每进程发两次正常readyz读取、等待2 s，零MCP业务POST、零资格读取。未强制GC、未改JIT或发送崩溃信号；首个失败即停、不重试失败进程。

原生和TCG各12个均退出0、共各24次正常健康读取，未知请求均0。导入wall中位数分别295.52 ms和6,972.56 ms。准确脚本SHA为 `f9ab3d7f0fda95de8a2c12744c5242b3ca6f59c38032076af71f16887ad92393`。TCG Node父进程208.23 s，小测VM425.43 s，均在固定小测预算内正常结束。

零POST样本没有复现，不能证明业务请求是崩溃必要条件。每进程只有2 s等待，不覆盖真实服务的长期待命或混合负载。此VM在核QEMU／seed身份后禁core落盘，未导出原始profile、core、寄存器或私有内存。

### 对照的适用边界

这是公开基础镜像和同源编译组件，完整生产MCP镜像的apk升级、生产打包、entrypoint、实际API／数据库及真实负载未覆盖。原生宿主kernel为7.0.14-linuxkit，与guest不同。HTTP客户端和fixture同进程，其30秒计时不等同独立安装器客户端的抢占期限。以上均不能冒真实已安装候选、完整无源码交付或ARM支持验证。

### 准确故障候选的 MCP 镜像角色对照

根据前述生产镜像缺口，再从CI563候选artifact12018111191取MCP角色，未重建候选或导入其他服务。原ZIP SHA为 `94370fb0d409fa6a3111220d491f4cd6eddad0bbd791e230afdb521ef49ad03e`，manifest SHA为 `62d76558ce5495cbe20b6315608b6717e00770c02d9759480d534b8446113a42`。两次流式逐块核21个应用分块及OCI blob，证明索引包含准确MCP manifest，选出12个blob；没有保存第二份完整应用tar。

构建config ID为 `sha256:7764f525a81985f29f6ef8a8218657b01681b1796d48261fd66c4ef3331104f3`；归档manifest及本机实际镜像ID为 `sha256:8bea5eb43fa3e9d70e157bc3058ed6fb10c689eba2215c65094568183afb085e`。镜像revision核9c8bbff，MCP／SDK／contracts源码到ac0无差异。原生直接使用这个生产镜像，TCG使用其导出rootfs，均不重编译、重装依赖或执行生产entrypoint。Node SHA仍逐字匹配原故障目标。

[准确角色索引](../../reviews/ta01-product/resumption-mcp-exact-role-comparison.json)及[原件](../../reviews/ta01-product/resumption-mcp-exact-role-comparison.zip)保37成员。沿精确QEMU、固定guest、4 CPU／4 GiB、同一测量脚本和两个合成work:read身份，每环境另12组请求，均Node退出0、未知请求0。initialize均零资格读取；合成资格响应仍309,710 bytes／287项操作。

| 原请求 | 准确镜像原生wall中位数／最大值 | 准确rootfs TCG wall中位数／最大值 |
| --- | --- | --- |
| initialize | 12.62／87.06 ms | 196.08／2,281.92 ms |
| get_work_item | 35.78／110.22 ms | 876.95／2,527.72 ms |

TCG Node为39.76 s，VM为251.45 s、QEMU退出0。本次有限样本最大约2.53 s，未复现139或30秒失败；只补生产编译／动态库闭包，仍无真实API／PG／Redis／S3、安装器、代理、TLS或长期负载。原生宿主kernel与guest不同，不能把这些差异或成本直接定为原故障根因，不能外推ARM。

本机辅助账本曾遗漏UTF-8编码，结果取回曾误用路径留下空文件；原字节及修正均保留。改正准确路径后只取回已完成原件，没有重跑guest。两个组件容器和仅用于导出的容器已按完整ID／owner定向收尾；核无消费者后仅删除新导入的诊断镜像标签，未动共享镜像。新下载的427.77 MB候选ZIP和194.07 MB选择tar核摘要后定向移除，单一55.02 MB公开MCP rootfs输入保留供复用。

### 准确 ARM 候选的补测

[ARM组件索引](../../reviews/ta01-product/resumption-mcp-arm-path-probe.json)和[原件](../../reviews/ta01-product/resumption-mcp-arm-path-probe.zip)保48成员。复用上述CI565 ARM候选，只流式提取MCP角色12个blob；实际镜像ID为 `sha256:192de7b9974eff4e355c354d849d125632592b94a22d17c4482dc40794482660`。Node22.19.0 SHA为 `da2abd2c48f19561e35478d51583b068ab410f888a09f363bd131ab611392cb7`。guest、QEMU和固件摘要先与CI准确原件核对；固件为 `545e2eda871a00dba51c0df48a34829fe3b0de6ec10ea760c75f1fc1c6a29dc5`。

首次QEMU在0.79 s因缺efi-virtio.rom退出1，未启动guest、零业务请求。保首败后，从CI job116819727487原日志核到ipxe-qemu及兼容ROM的准确包版本，只在私有容器补齐；错误的本机ROM预检路径按包清单改正后，才做一次补测。未禁用ROM、AppArmor或改变设备／guest／QEMU版本，没有重试失败业务请求。

补测仍4 vCPU／4 GiB、Node600 s／VM1200 s。QEMU与Node均退出0；VM1,028.61 s、Node81.93 s。两种合成work:read身份各交替，12组initialize／get_work_item，未知请求0；initialize无资格调用。initialize中位431.04 ms、最大3,148.25 ms；get_work_item中位1,844.57 ms、最大4,089.24 ms。SDK资格中位865.90 ms，WorkMesh构造中位385.91 ms；合成响应309,710 bytes／287操作，真实响应大小仍未知。

本机宿主实际x86_64，CI使用ARM环境；没有原生ARM对照，不作跨宿主速度比或CI根因结论。该组件没有真实API／PG／Redis／S3、代理及完整服务竞争，且客户端与fixture同进程。只证明本机这批合成路径无需30秒，不能排除真实环境成本或旧139。

本轮本机ARM测量额外消耗上述17.14分钟VM时间及首次0.79 s启动失败，合计开销没有冒称不变；没有新增CI诊断作业或手动整轮。QEMU退出后核无活动进程，定向收尾控制／导出容器和新诊断镜像标签，保共享镜像；控制容器最后137、无OOM，与Node139分开。只保单一公开ARM guest缓存620,224,512 bytes和54.42 MB MCP rootfs；416.17 MB候选ZIP、192.38 MB角色tar和未脱敏的完整CI作业日志在保摘要／必要公开依赖行后定向移除，均未入Git。私有overlay未保留。

## 四项假设的收敛与下一动作

| 待验证解释 | 本轮实际支持／排除边界 | 下一项最小验证 |
| --- | --- | --- |
| H1：重复构造及完整资格处理使读取过慢 | 成本存在，TCG有时延变化；AMD基础组件最大1.92 s、准确角色最大2.53 s；本机ARM角色最大4.09 s。不能解释尚未走资格路径的initialize139，也不足以解释ARM30／49 s | 三ARM首败均已核正常get_work_item 30秒超时。下一项只定位真实API资格／工作项耗时与MCP侧差额，不能把合成响应当真实响应 |
| H2：Node／依赖原生代码或TCG交互导致139 | 同Node、精确QEMU版本、固定guest下，业务小样本及12次零POST冷启动均未复现。没有排除，准确生产MCP镜像角色的配对也有限未复现；真实API／负载差异及应用调用者仍缺，API139无core，仍不合并根因 | CI565已终态且三ARM无同组die事件；原AMD139仍缺应用调用者。无新失败定位时不继续堆采集或试跑，不换Node／QEMU、JIT或直接指定上游缺陷 |
| H3：完整VM累计成本耗尽预算 | 旧ARM150分钟缺件保持；本轮三ARM均在总期限前明确业务超时，该上限不能解释其首败。完整服务／调度成本仍未排除 | 同一种钟汇总已有阶段；新企业ARM在总期限前已明确30秒工具读取失败；继续分开API资格、SDK和环境成本。保持完整字节散列、原资源、健康和安装期限，不改阈值补成功 |
| H4：后置诊断造成或掩盖首败 | 新企业AMD已实证提前摘要比最终诊断早85.72 s。后置GDB／分类不能倒因解释已经发生的139或30秒失败；普通无捕获也有139 | CI565三组原回执已分别绑定首败和采集耗时。CI565企业／个人／团队ARM分别提前370.84／304.31／252.17 s；不把guest uptime与host elapsed相减为采集耗时 |

本轮没有足够证据选择其中任何一种为根因。原CI562企业API139、CI563及CI564 MCP139、ARM不同阶段的读取或恢复缺件分别保持。公开IC::UpdateState+128和两个有界帧只说明故障位置，不能证明坏指针来源；GDB只到before-binary且到原60秒，handler早于journal也不是请求触发证明。

CI565原件与终态已保齐，未重跑或取消。本轮完成小测后，下一项测量仅复用原六guest在失败时已有的一次API日志读取，不增加guest、CI诊断作业或业务请求；具体实现与待实测边界见下文。只有准确证据支持产品修复才改产品；若确需改变锁定运行时、资源、权限或保证，先提交具体选项供裁定。新CI成功也不能替代未闭根因、真实双架构／三画像完整验收和正式产品审查。

## 下一项原预算内测量：已有 API 日志耗时

三个真实ARM读取均超过30秒，而已测合成路径最大4.09秒，尚不能选择产品、依赖或环境根因。剩余必要观察是同一失败窗口的真实API资格／工作项耗时。因此仅在验收助手中，将**已核归属API容器原有的那一次**最近60行日志读取移到慢分类器之前，后续分类器复用同一结果；失败不再读取。首份pending failure仍先发送，普通成功路径没有这项读取。

投影仅接受最后失败tools/call的journal开始UTC至采集UTC，配对Fastify已有incoming/completed或errored记录。固定路由为GET `/api/v1/agent-capabilities?discovery=qualified` 和工作项读取，最多8对；只输出路由分类、状态、完成／错误、耗时、关联SHA和缺件。原URL／参数／身份／headers／正文／错误消息不输出；256 KiB、60行、64 KiB单行及30分钟窗口有界。重复ID拒绝，超界或缺件不补配；始终标tailMayOmitRequests=true，不能由0对推没有请求、无耗时或已排除。API日志200或completed也不等于MCP／安装器客户端成功。

原API及MCP程序、请求、30秒期限、配置和镜像没有修改，未增加运行时注入或新服务；不新增日志请求，不延长任何命令，不追加手动整轮。新serial标签只保安全投影，不参与验收通过判定。当前实现只经本机60项Python（含隐私、配对、错误／重复／限额、读取复用及失败不重读）和真实Fastify5.10.0的2次inject日志格式验证；inject未监听端口，响应为合成，没有PG／Redis／S3。

**该路径在CI565之后才新增，真实guest效果未测。** 不把CI565的55项Linux生产者、当前60项Windows检查或既有小测当作新字段已覆盖。待本轮平台正常推送触发新普通CI，再核新head、生产者、实际guest及该窗口；若未触发或缺日志仍保未知。没有据此关闭原生139、ARM迟响应或完整验收。

## 检查、资源和交付边界

本轮实际完成两种环境的业务及冷启动小测、原件SHA核验，并保存准确工具快照。此前六次原生探索分别保在[组件材料](../../reviews/ta01-product/resumption-mcp-component-probe.json)与[work:read补测](../../reviews/ta01-product/resumption-mcp-work-read-probe.json)，不混用脚本或控制条件。两份Node工具语法、三份Python工具AST、11对归档的202个成员SHA及首轮工具与ac0真实Git blob均核通过。`pnpm ci:validate`通过24项原件检查（280 entries／61 members、errors=[]），`pnpm check:integration-docs`通过4技能文件／97链接／35 REST／11 MCP，`git diff --check`通过。日志见[本机核验](../../reviews/ta01-product/resumption-mcp-tcg-checks.json)。准确角色配对后另核13对归档／227成员、两份实际TCG工具与配对时字节一致及AST；ci:validate和接入文档检查再次通过，当时产品与CI diff为空，见[补充本机核验](../../reviews/ta01-product/resumption-mcp-exact-role-checks.json)。最后核60项Python、Fastify 5.10.0的2对真实日志格式、3份Node语法、4份Python AST及18对归档／319成员；核验包另保10成员，见[最终本机核验](../../reviews/ta01-product/resumption-api-read-timing-checks.json)。本机未重跑五项根门禁，不用这些检查代新guest或最新Required。

本次没有schema、迁移、REST／MCP合同、事件或安装行为变化。相关状态同步到[安装说明](../../integration/server-installation.md)和[验收矩阵](acceptance-matrix.md)，安装／恢复命令及配置示例保持。中文文档按固定zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 和适用references手检；没有全局工具安装。

AMD配对的两个QEMU均正常退出后，核无活动QEMU，再停止并移除独有控制容器。控制容器最后exit137、OOM=false，是空闲PID1在原10 s stop后结束，不能当Node139；两次Node及QEMU均0。原生小测和公开Node导出容器也按准确ID／owner／镜像核定向收尾。没有宿主挂载或匿名卷；私有guest overlay没有保留或入Git。

只保每架构各一份公开guest输入缓存（AMD625,612,288／ARM620,224,512 bytes）、约81 MB的组件／Node输入及AMD55.02 MB／ARM54.42 MB准确公开MCP rootfs输入，供定向复用；ZIP不含这些大输入、完整符号索引、二进制或core。共享Ubuntu／Node镜像、旧树、旧候选、共享store、未知匿名卷、受拒目录及其他项目保持，无prune、reset、clean或绕过拒绝。

产品仍保PG／Redis／S3三画像、外置Runner及既有安装升级／兼容回退／独立空目标恢复保证。原4 vCPU／4 GiB、150分钟、业务30 s、首次Client90 s、健康180 s、安装1,800 s及原oneshot均不变。没有物理最低配置、生产接入或对外发布结论。Saved plan未同步的记录例外继续，Redis-free／filesystem待裁定，ADR0071／0072保持Proposed。

完整guest当前仍用同程序两候选的升级／恢复夹具；两个历史已发行程序对、裸Compose迁入和Runner／连接器最终联合验收没有新增完成依据。

全部原真实验收、实际五项根门禁、P0/P1正式成果独审及最新Required齐备后才可条件合入。PR227仅为恢复来源，当前PR228仍draft；本轮没有ready、合入或Done结论。
