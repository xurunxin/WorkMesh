# A2 与已合 C2 的组合交付

本轮在同分支正常整合真实 main `add4340e9c52575c2fd9615b3b114ac9acd3e30e`，输入与 parents/tree 证明见 [inputs.json](inputs.json)。旧 `c800` 独审、`c768` 受测基线、CI402 与旧 UI/失败/视觉材料保持历史含义；本轮不恢复延期 UI，不重开 C2。当前完整规格已同步 `09.md`；旧完整正文先原字节保存为 `../history/current-spec-c800.md`。

## 实际影响与检查边界

| 实际增量 | 组合影响与适用验证 |
| --- | --- |
| API `server.ts` 与 `notification-channels.ts` 注册 | 仅渠道已配置 provider 提示随既有 feature 派生。A2 仓库 `delivery/routes.ts`、repository helper、DTO、contracts/index、OpenAPI、route-policy 与 A1 三态原件均未变；运行 route-policy、契约及 API 的 A2/C1/C2 集成文件确认组合。 |
| DB `channel-notifications.ts` | C2 增加无授权 locator/延期、候选指定、发送前许可门禁和安全结果码；`lockChannelAuthority` 的 workspace 前置锁、完整 authority/resource helper 与锁后重读保持。A2 `provider-actions.ts` 和锁清单没有主线覆盖。运行锁清单及真实撤权/锁等待、通知受众/恢复组合。 |
| Worker `automation.ts`、`agent-webhook.ts`、`index.ts`、新 wecom adapter 与 zod 依赖 | 共享调度与外部 HTTP helper 改变，通知仍默认关闭。按主线 lockfile frozen install；运行 Worker 三个相关单元文件、automation 集成、根 lint/typecheck。不新增提供方权限或打开渠道。 |
| Lite feature 字段与 Worker `WEB_ORIGIN` | API/Worker 启动产物与 Compose 改变，需从本轮精确提交重新构建并完成四角色无源码安装、真实 Web 代理/认证及 repository context 落库。测试入口只补通知开关显式 false，TLS/只读 CA 卷/秘密白名单保持。旧 Lite 通过不代当前组合。 |
| C2 增加现有 Web 兼容 E2E | Web 产品文件仍与实际 main 相同；只运行新 `wecom-backend-compatibility.spec.ts`，原 69 项 E2E 的未变消费者输入与旧结果另列历史，不冒新运行。 |

根全套单元/集成/E2E 不因无冲突整合无差别重跑；新增组合与完整 PR 空白检查必须绑定实际新源码。C2 自身的已审事实、默认关闭、频控/fenced ACK 及其历史失败不改写。共享协议、Schema、迁移、锁 helper、A1 及 A2 生产 hunks 未变，不新增合同或生产修订。

## 新结果与停点

运行命令、首败/skip、原件索引、源码前后绑定、逐资源收尾和最新 head 的检查索引见 [results.json](results.json)。准备提交时所有新检查仍记待执行；实际执行后按回执更新，不改历史结果。适用检查通过后仍停 review；当前组合必要独审及 PR211 新 head 最新 Required CI 均为合入前门禁，CI402@c800 不替代。
