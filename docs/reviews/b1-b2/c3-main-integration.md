# B1/B2 真正 main182 整合与受影响范围验证

本轮按 Chief 明确指示，在原分支正常整合 C3 已冻结主线；不新增任务、分支或规划，不重开 `7ea518a8aed920b53bd2c0e16b6a4e8b2a209e47` 的 ANSI、祖先权限与 stderr 独审。本轮修改仅为正常主线整合及验证/证据脚本，连接器产品源码未改。

## 来源与实际影响

平台直接 `ls-remote origin refs/heads/main` 实读 `18252ba8761aa810c3fd12d31ecae83e8b24d985`，读取精确 SHA 的 parents 为5b9c76b与审核 `3fcfdb5c99be5de8c0f3e07f4ad0b2d29b76a0c7`，两者 tree 比较相同。平台实读 PR207 的 CI393/run37784401511，10 jobs 全部 success，URL 为 https://github.com/xurunxin/WorkMesh/actions/runs/37784401511；这不是连接器自身的 PR CI。使用当前分支 `git merge --no-commit --no-ff 18252ba8761aa810c3fd12d31ecae83e8b24d985` 无冲突，OPENAPI 自动整合后由路由生成检查验证。

C3 增量不仅是文档：新增模型目录契约和公开路由、默认关闭的 `WORKMESH_BETA_MODEL_PRESETS`、config 本地文件路径校验、server 启动时目录读取及 web 配置入口。连接器相关兑换/current-identity/Skill/initialize/verify/context 契约、MCP 源码、Skill 原字节、公钥、锁/提交恢复、CLI 与依赖锁文件均无变化。当前分支相对真正 main 的 Schema/DB/API/contracts/config 源差异为空，保留 A1 在身份解析前拒绝 Human-only Installation Token 的修订。

真实服务器连接器夹具通过 `loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' })` 明确关闭模型目录，server 的 `loadModelPresets(false, ...)` 不读取部署文件。CLI 的假 provider 不调用 WorkMesh server；`fixture.ts` 用 `featureKeySchema.options` 动态生成全 false 清单，新增枚举不会把模型目录开启，也不会改变安装令牌的注入/输出路径。未改动这些源码。新版配置就绪集成测试还覆盖新公开目录携带 Installation Token 不解析身份、不写领域状态，以及 Human-only 读取/命令先拒绝令牌、只写拒绝审计。

## 受影响检查与源码绑定

`revision-c3-impact-01` 的 connector/contracts/api typecheck、186项共享契约测试、route-policy 生成核验、CI 配置/归档核验和5项模型目录单元全部成功。`revision-c3-integration-01` 的真实服务器 `stage5-agent-connections`、`stage5-connector`、`configuration-readiness` 三文件共50项全部成功，包括重放、服务端重启、当前身份/撤权/过期与黄金协议路径。无测试 skip。没有因无变化的 ANSI/权限/stderr 源码或无关 C3 文档重跑连接器全 suite、整套 E2E 或三 OS；这些平台项仍须最新 PR 实测。

新增 `c3-main-source.json` 保存本轮工作树原字节及 Git blob；`verify-c3-main.mjs` 可独立核验，提交后加 `--committed` 绑定新 head。运行时记录的 HEAD 为7ea518且有 main182 的待提交正常 merge，不冒当时已经执行新提交。检查前后 SHA 与最终源码逐文件比较，范围不足不冒覆盖：impact 使用原有捕获范围，新模型目录由实际单元命令验证；integration 增补 config、模型目录及 JSON 的运行前后记录。最终正式提交和完整 PR diffcheck 另见 `c3-main-delivery.json`。

正常合并与检查成果已推送为 `c1c7bca6b3231144c7bcfadff390c479ab116c22`，parents 为7ea518与真正 main182。实际执行该提交相对 main182 的完整 PR `git diff --check`，退出码0、stdout/stderr为空；129个源码 blob 全部匹配新清单。平台查询连接器自身分支仍返回 `No workflow runs`。随后仅补交这份提交后证据，不把纯证据提交当新产品代码或重复执行检查。

原 `raw-source.json`、原检查/报告和 Windows 3通过2缺夹具失败/macOS未测事实保留原字节；763/4495 的“当时未落地组合”不倒改。旧151份日志在增量 ZIP 内逐字节保留，新日志加入后共162份逻辑路径/109内容成员、8798540字节，完整校验成功。新证据校验器首轮错误地将本轮有意修改的 cleanup 脚本当历史报告，失败摘录如实保留于 `evidence/c3-verifier-first-failure.json`；修正明确允许变化项，未改历史事实或产品断言。

## 资源与下一门禁

测试前登记，结束 finally 保存脱敏服务日志并 `docker rm -f -v`，复查三资源均不存在：

- PostgreSQL：`b1b2-01a11ac2-pg-f72c8f96`，ID `d0acc86c35bc128fb69783b875419af95c90bdefe2cda9493934013a28be6067`。
- Redis：`b1b2-01a11ac2-redis-f72c8f96`，ID `a5bb1b2fde04a3c987a78194fc686002eb0a4a47a8e7d847f45c50abf250977d`。
- S3：`b1b2-01a11ac2-s3-f72c8f96`，ID `c132de1190604cfad67c20b3245b490a875da36a6b576bccc979b6658341c91e`。

两个独有 Node 运行目录 `C:\Users\xurx\AppData\Local\Temp\workmesh-b1-b2-revision-node-2F3B90`、`C:\Users\xurx\AppData\Local\Temp\workmesh-b1-b2-revision-node-Bv6nKr` 已删除，按对应 exe 复查无存活进程。具体路径/结果见本轮 `evidence/c3-cleanup.json`、`c3-process-cleanup.json` 和每次 `resources.json`。模型目录单元沿用 C3 原测试的 `c3-presets-` 随机目录及 finally 删除，但原测试未打印精确随机路径，本轮未取得该目录逐项删除回执，不能冒全路径已独立复查；不扫描或批量删除同前缀其他任务目录。只清本任务已登记资源，保留共享基础镜像；未创建专用镜像/网络，未 prune 或更改全局环境。当前及旧工作区保留，不接触 C3 被拒目标，不 force 删除 dirty worktree；连接器尚未 actual main，不满足旧 worktree 清理条件。

本轮仅回 review 进行实际主线增量的定向读回。用户需在任务页面“分支与PR→提交”创建当前分支 PR；没有单独建 PR 的工具，不用 merge_branch/gh 绕行。最终必须取得当前修订 head 的三系统原生依赖/系统存储、Windows 两项第二用户完整执行、macOS Keychain、真实 CLI/PTY 和自身 Required CI 成功，再按 Chief 确认与 actual main 门禁合入。不以 CI393 或历史本机结果代替新组合验收。
