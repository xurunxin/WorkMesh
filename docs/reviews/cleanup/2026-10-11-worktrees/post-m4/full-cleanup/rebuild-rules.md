# 后续新任务环境与收尾规则

本入口是本轮交付的前景工具，未修改平台守护进程、团队角色、公共 pnpm 配置或共享仓库配置。它不自动启动业务任务，也不设置 timer/daemon。后续由用户选择任务，平台从真正最新远端 main 建立该会话分支后，在**该会话自己的工作树**使用。

## 开工

先调用原已合 `usage-inventory.py --phase opening --output <受控新采样路径>`，核当前本项目工作树数、各树逻辑组成和其他正在执行的任务。出现大量无人运行的旧树、文档证据检出副本接近 GB、任务临时 native 文件远大于单一已核安装本体时，必须给出具体目录与身份统计并登记收尾；不能把逻辑长度当物理空间。用户此前42GB是历史观察，不是恒定自动删除阈值。

然后在新任务自己的 cwd 执行：

```powershell
python -B docs/reviews/cleanup/2026-10-11-worktrees/post-m4/full-cleanup/rebuild-environment.py plan
```

工具会核 WorkMesh remote、`tds/conv-<当前目录 UUID>`、linked worktree、`packageManager=pnpm@9.15.4`及真实已安装管理器。PATH 当前启动器包版本是12.3.4，不能拿它在仓库外的默认 v11 store 冒项目9.x来源。入口直接选择已有缓存的9.15.4 executable，实核该版本 `store path` 为 `X:\packages\.pnpm-store\v3`。缺管理器/store、版本改变或身份不匹配时停止，不自动安装/下载/login。

## 共享与隔离

| 内容 | 规则 | 本轮实际验证与限制 |
|---|---|---|
| Git 对象 | 平台 linked worktree 已共享主仓库对象，不复制新的完整 Git clone 作为缓存 | `.git`与登记已盘点；主仓库不清理，不改其配置 |
| 包下载/CAS | 使用已经存在的真实 pnpm9 store；不 prune、不搬走或覆盖其原文件 | 两次独立单包离线安装 downloaded=0；CAS 原字节在私有副本改写后不变 |
| 任务依赖 | virtual store 以当前 UUID＋锁 SHA 命名，放在 store 同卷的独立 `workmesh-task-virtual-stores` 目录，**不放入原 CAS**；每任务自己的 node_modules 入口 | 不能共享可变 node_modules/virtual store。最终选择 copy，实核任务与 CAS 身份不同、nlink=1；会有必要的任务副本，未宣称已实现块克隆或消除所有安装字节重复 |
| Node/pnpm/OpenCode | 复用已安装公共工具，不在每任务复制一套安装；实际 native executable 与 shim 分开核版本/hash | 现有原生 OpenCode212,567,080 B/hash与历史运行来源相符；私有 TMP/XDG/APPDATA/配置/DB/端口保持隔离，派生 EXE 由运行结束精确收尾，不共享秘密或可变 DB |
| Docker | 共享已经存在的镜像；每任务独有容器 ID/label、测试卷、端口、随机秘密 | 本轮只选择六个原账本精确 ID/独占卷；默认 compose 业务卷及不明归属容器保留，不 global prune |
| 构建缓存 | 任务独立 `.next/dist/.turbo/tsbuildinfo`，结束后保必要回执再收尾 | 不跨任务硬链接可写构建结果，不把相同 hash 当独立身份或物理净释放 |
| 已提交证据 | 复用 Git/已有 ZIP member；只新增必要独有脱敏成果 | 本轮逐路径映射优先复用已有对象；不再复制完整树、依赖或 EXE 作为保全 |

官方文档明确 virtual store 必须按项目隔离，并区分各导入方法；该说明仅作机制依据，本轮9.15.4的真实结果由本机回执决定。[pnpm 官方 node_modules 设置](https://pnpm.io/settings/node-modules)。本机 `clone-or-copy` 试验出现了 CAS 同身份 hardlink，因此入口使用实际验证过的 copy；不按文档预期冒本机已取得写隔离或空间节省。

新任务干净、无既有 node_modules/专属 virtual store 时，可运行 `rebuild-environment.py install`。它只使用已有 store 离线 frozen install，忽略生命周期脚本，并先写 `.tmp/workmesh-environment-owner.json`。离线缺包即失败并保 owner 账本；必要 native 构建、业务服务及完整产品验收由该任务另按实际授权执行。本轮只验证受控单包入口，未声称已重建完整后续业务环境。

首次验证未隔离 pnpm workspace，实际使用了本仓库19个 package 范围；已终止并保4294967295退出码。后续加入单独 `pnpm-workspace.yaml` 和 `--ignore-workspace`，单包离线重建完成。当前构建形成的专属测试环境另列在剩余清单，不能用它冒旧环境释放。本轮未修改源码/锁，未新装公共工具或下载依赖。

## 大型证据的稀疏检出边界

入口另有 `thin` 与准确 `hydrate --path docs/...`。默认薄检出计划保留源码/协议/ADR与清理入口，省去历史 reviews 与 M0–M5 大型证据目录；做相关业务或归档验证前必须 hydrate 所需准确目录，CI继续完整检出。该入口要求平台仓库**已经**启用每工作树配置 `extensions.worktreeConfig=true`。本机当前未启用，入口会在改动前停止；没有擅改主仓库/平台 cache/config，所以本轮没有宣称平台自动建树已经避免3GB证据副本。

这项限制如需在未来解除，应由平台支持准确的每工作树配置/选择性检出入口；本轮没有相关平台权限或自动接线，不以手动文档冒已生效配置。现行可直接使用的是严格管理器/store定位、前景离线安装、独立可变状态与结束登记。

## 结束

执行 `rebuild-environment.py finish-plan` 生成本 workspace 与**准确 owner/锁 hash** task virtual store 两个精确候选。先逐路径保全独有代码、staged/index和必要脱敏原件，提交推送并核远端 immutable 来源；核本人退出/端口关闭、容器/卷和其他消费者、真实拒绝边界后，分别走正式 Git remove 和已声明的非递归链接本体/普通空目录流程。专属 virtual store 的原生回收也需独立绝对路径、owner/链接/消费者预检；不因它位于公共父目录便清父目录或 CAS。

异常占用须按逻辑组成、文件身份去重长度、卷可用变化分列。未合或待审的业务仍从远端原分支及必要保全恢复；清理不表示接受/取消业务。每次真正合入后登记该旧会话 head，及时前景收尾；本轮自身始终保持当前构建保护，待本轮合入后再作为独立候选，不能清自己或销毁依据。
