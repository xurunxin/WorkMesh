# 实际验证记录

## 工具与隔离

当前宿主 Node 为 25.4.0，项目锁定 Node 由镜像和 CI 另验；宿主结果不能代替锁定运行时验收。pnpm 使用已有精确 9.15.4，复用共享 store，任务依赖采用 copy 私有可写隔离。测试容器、端口、数据库和对象存储为本轮独有；归属见 dependency-owner.json 和 integration-resources.json，不清共享缓存或业务数据。

## 已执行与进行中

| 命令 | 实际结果与日志 |
|---|---|
| pnpm install --frozen-lockfile | 通过；install.log，原生 postinstall 正常执行 |
| pnpm build | 17 workspace 通过；build.log |
| pnpm typecheck | 首轮 17 workspace 通过；typecheck.log；最终复验运行中 |
| pnpm lint | 17 workspace 通过；lint.log |
| pnpm ci:test | 首轮旧 E2E 合同失败保留 ci-policy-first.log，更新后 19 项通过 ci-policy.log |
| pnpm ci:validate | 通过；ci-validate.log，Required、自举、发布、Lite、历史证据检查保持 |
| pnpm check:route-policy / check:workmesh-skill | 通过；route-policy-generation-retry.log；原 Skill digest 与签名通过 |
| pnpm test | 首轮旧 Web 合同失败 unit.log，复验保留 unit-retry.log；最终完整复验运行中 unit-final.log |
| pnpm test:integration | 独有真实 PG/Redis/S3，数据库 17 文件 81 项通过；后续 API/协议/worker/恢复正在执行 integration-full.log |
| API 退役及通知定向测试 | 通知 19 项和迁入的审批纵向用例通过；固定 Skill 公开清单首败及拒绝状态首败均保留，最终复验待完整套件 |
| 留存升级维护脚本 | 定向 33 项通过；unit-targeted-retry.log |

unit-direct.log 是错误的根目录诊断调用，混入 RUN_INTEGRATION 并绕过包 cwd，不能作为正常单元验收；失败保留，不改产品或其他检查凑通过。未发布 Workbench Skill 的旧生成入口没有对应已跟踪资产，未新增签名或冒校验成功。

## 尚未完成

真实生产/Lite 构建、开发镜像无缓存构建、无源码安装、save/load、部署 worker、TLS、镜像内/HTTP Skill 签名、MCP 和恢复后 smoke 尚待执行，结果将绑定实际提交和日志。浏览器布局与视觉项明确退役，没有标成通过。最新远端 Required CI、成果独审与实际合入尚未完成。
