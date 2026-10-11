# 实际验证记录

## 工具与隔离

当前宿主 Node 为 25.4.0，项目锁定 Node 由镜像和 CI 另验；宿主结果不能代替锁定运行时验收。pnpm 使用已有精确 9.15.4，复用共享 store，任务依赖采用 copy 私有可写隔离。测试容器、端口、数据库和对象存储为本轮独有；归属见 dependency-owner.json 和 integration-resources.json，不清共享缓存或业务数据。

## 已执行与进行中

| 命令 | 实际结果与日志 |
|---|---|
| pnpm install --frozen-lockfile | 通过；install.log，原生 postinstall 正常执行 |
| pnpm build | 17 workspace 通过；build.log |
| pnpm typecheck | 首轮 17 workspace 通过；typecheck.log；最终复验 17 workspace 通过 |
| pnpm lint | 17 workspace 通过；lint.log |
| pnpm ci:test | 首轮旧 E2E 合同失败保留 ci-policy-first.log，更新后 19 项通过 ci-policy.log |
| pnpm ci:validate | 通过；ci-validate.log，Required、自举、发布、Lite、历史证据检查保持 |
| pnpm check:route-policy / check:workmesh-skill | 通过；route-policy-generation-retry.log；原 Skill digest 与签名通过 |
| pnpm test | 首轮旧 Web 合同失败 unit.log，复验保留 unit-retry.log；最终完整复验运行中 unit-final.log |
| pnpm test:integration | 独有真实 PG/Redis/S3，数据库 17 文件 81 项通过；后续 API/协议/worker/恢复待完成 integration-full.log |
| API 退役及通知定向测试 | 通知 19 项和迁入的审批纵向用例通过；固定 Skill 公开清单首败及拒绝状态首败均保留，最终复验待完整套件 |
| 留存升级维护脚本 | 定向 33 项通过；unit-targeted-retry.log |

unit-direct.log 是错误的根目录诊断调用，混入 RUN_INTEGRATION 并绕过包 cwd，不能作为正常单元验收；失败保留，不改产品或其他检查凑通过。未发布 Workbench Skill 的旧生成入口没有对应已跟踪资产，未新增签名或冒校验成功。

## 尚未完成

真实生产/Lite 和开发镜像首轮构建已尝试，中止记录与原日志保留；原上下文含大量历史证据，后续改为准确 Git 提交中的 Docker COPY 所需产品路径。部署、save/load、TLS、镜像内/HTTP Skill、MCP 与恢复后 smoke 未通过验收。浏览器布局与视觉项明确退役，没有标成通过。最新远端 Required CI、成果独审与实际合入尚未完成。


## 本轮首败与资源诊断

`retirement-final.log` 的新增套件在 beforeAll 阶段超时，五项断言未执行；`recovery-matrix.log` 同样在准备阶段达到原 hook 限制，恢复断言未执行。真实 PostgreSQL `pg_stat_activity` 同时显示三个本轮测试数据库的 DDL/TRUNCATE 等待 `DataFileImmediateSync`，读取连接仍可用。没有增加超时、关闭 fsync、修改业务安全机制或重启共享 Docker 来凑通过。后续复验须串行并保留首败。

镜像首轮中止分别见 `build-context-first-interruption.json`、`archive-first-interruption.json`、`build-plugin-first-interruption.json` 和 `production-context-interruption.json`，仅涉及本轮准确 PID/源 SHA/tag/专用 builder。Lite/生产安装临时目录已按逐路径清单收尾，开发 builder 清理仍等待实际回执，不能写为已清除。

`smoke:agents:ci` 通过；`test:conformance` 的六组 adapter/fixture 均通过。它们是构造/协议夹具结果，不能代替真实集成协议、签名镜像或恢复验收。

## 实施检查点复验

`retirement-six.log` 的六项真实 PostgreSQL/API 用例全部通过；`wecom-notifications` 的十九项通过，包括旧哈希合法发送、显式重试、篡改拒绝、撤权先提交与不确定投递零自动重发。此前夹具的 CSRF 状态和 Human 必填字段错误已修正；`retirement-pool-first-failure.log` 的 Vitest RPC 启动超时另留原件，没有放宽超时。

CI 运行 `38176577167` 绑定分支提交 `7209be0641cc224b19b88bc36b0d3a03996b0b63`。实际 PR 合成检出为 `47faa50156178fccebf3d6ea2db33c11550688f5`，源码 tree 与分支提交相同；父提交和三平台前后源码绑定见 `ci-artifacts/verified-bindings.json`。源码门禁、数据库、协议构造、三平台原生连接器和完整灾备通过。三个开发镜像实际无缓存构建且正常 postinstall；恢复后 API、worker、MCP ready、MCP 初始化和持久 Agent heartbeat 均通过。原 ZIP、摘要和报告分开保全，不把运行页面的 head 字段当实际检出 SHA。

该 CI 的 worker 检查因 Web Push 测试遗漏 API origin 而失败，已补为固定配置 origin 的准确完整链接；API 检查仍在执行，Required CI 未通过。新增必需 Lite 部署入口及二十项 CI 策略负例在本机通过，自检也通过，尚待新提交的实际 CI 复验。

宿主 Node 25 的完整单元复验仍有失败。私有 APPDATA 修复本机虚拟化祖先导致的安全拒绝后，连接器七十一项通过，管道交互及嵌套终端两项失败；没有修改 ACL 信任边界或延长测试时限。锁定 Node 运行时的三平台 CI 结果独立保全。完整本机集成复验已有部分迁移准备达到原 hook 限制，命令仍在执行，不能把准备超时后的跳过算作通过。

Lite 已有一次真实构建、save/load 身份一致及三个角色加载通过，随后因 PATH 缺 OpenSSL 停下；已找到现有 Git 工具。另一次构建在本机内存压力下定向中止，其插件 PID 另核归属后停止，未重启共享 Docker。限制内存的专用 builder 部署继续执行，本地进行中的目录暂不作为远端交付或成功证据。
