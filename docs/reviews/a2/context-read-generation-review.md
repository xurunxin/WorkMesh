# A2 上下文读取代际修补

当前独审指出上一轮第三项恢复 blocking 未闭合。本轮只修上下文 GET 的取消与迟到回调边界；前两项、后端授权锁/HMAC/分页、安全及部署合同保持。批准计划及当前规格全文不改，输入 HEAD、精确远端观察、历史 Git blob 与哈希见 `context-read-generation/input.json`。上一轮通过不能覆盖这个新反例。

## 实现与反例

`project-repository-configuration.tsx` 的 `readContexts` 为每次读取建立 AbortController，取消前次读取并推进代际。作用域、存活、取消和代际四条件同时检查，成功和错误都在同一函数内处理；取消或失败返回 null，提交前检查遇到 null 直接退出。新动作接收、原动作确认重试、作用域变化与卸载使旧读取失效。焦点、实时、手动、初始及轮询入口都调用该函数，删除入口外无代际校验的 `.catch(handleError)`；轮询不再重复处理错误。

生产位置直接读回的门禁：

```ts
const current = () => alive() && latestContext.current === contextScope
  && !abort.signal.aborted && version === contextGeneration.current
```

```ts
if (!current()) return null
if (pendingRef.current) setNotice(latestText.current.notConfirmed)
handleError(reason)
return null
```

新 `project-repository-configuration-races.test.tsx` 使用真实 `apiMutation` 和 CSRF，只控制 GET 及内存 fetch 响应。三入口分别覆盖迟到成功/失败：先提交旧 SHA，挂起读取，按原一分钟期限恢复编辑，显式改 SHA 提交；核两个实际请求的 key 不同。夹具故意忽略 abort，让旧回调真实完成，断言没有错误/旧上下文，表单仍等待新动作；新精确结果在下一轮轮询自动确认，仍只有两次 POST。

首次探针六项失败源于测试按钮名误写，单独保留 `first-failure.log.gz`，不作为产品反例。纠正按钮名后在未修改的输入产品上执行，三入口都没有 AbortSignal，六项失败，见 `baseline-failure.log.gz`。修补后新六项加原二十二项全部通过，见 `targeted.log.gz`。这些日志位于 `context-read-generation/`。完整检查与新镜像安装分别实际新执行，不把旧镜像成功算成本轮安装成功。

## 验收与交付

原六项、九类适用性及 DoD 不删除。当前检查过程使用独有服务与原验收文件，受测前后源码、首败、真实退出与清理逐项保全。API/Worker/契约/部署没有增量，历史集成通过只绑定这些被证明未变的输入。本轮 UI 和新精确提交 Lite 须实际重验。

本轮不更新 D0 基线或阈值；五项人类视觉差异、真实设备/厂商、实施独审、最新 Required CI 及 actual main 仍是明确停点。C3 两次清理拒绝及历史审计、新旧目录保持只读；不清共享资源、当前工作树、不 global prune。逐项结果在 `context-read-generation/results.json`、`execution-results.json` 和各 run 原件，不预填未来提交 ID。

`a2-71164f40` 已结束，路由/lint/typecheck、根单元 29 task（Web 825 项）、关闭 Gitea A2 11 项通过/1 Lite 跳过、根完整浏览器 78 项通过/2 跳过、CI 策略及 Web build 全部退出 0。两处受测产品/测试文件运行前后完全相同；专用 PostgreSQL、Redis、RustFS 三容器均核归属后清理退出 0，认证状态及 trace 完成脱敏。原件见对应 run 的 receipts、source-before/after 与 sanitization。

`a2-lite-23646193` 使用精确产品提交 `380aad996489dbdabddd212be8f45edbcdda7209` 的 Git archive，镜像 ID `sha256:eababb69224f1db675a2f0f1d78e1b8267cb551b1f8f36152e5ffbeb4c9b388f`。四角色入口、save/load、五条编译代理、无源码 Compose 与经 Web 的未安装状态 HTTP 200 均通过。原 `Lite 安装后逐项补齐直到横幅消失 @lite` 实际 1 项通过，用例 4.4s，浏览器 5.7s，退出 0；真实安装、认证、显式模型/Agent 及仓库配置、生产 Worker HTTPS 解析完成，没有绕过代理/认证或关闭 TLS。十个宿主输入的前后哈希完全相同，源与 Git blob 换行独立记录。

Lite 专用 Compose 容器/卷/网络、四角色 probe、CA loader/卷与专用镜像清理退出 0，HTTPS 服务已结束。七条临时路径回执均 `code=0, exists=false`；tar 的 resource.cleanup 为 null 时使用逐 path 回执证明，不伪填字段。创建前的镜像/CA 卷 inspect 退出 1 是负向检查；清理后的 inspect 退出 1 证明对象不存在，不当产品失败，也不修改真实退出码。具体资源 ID、预检和操作见新 run 的 receipts 及 cleanup-path-receipts；共享基础镜像、当前 worktree 与 C3 目录保留。

`context-read-generation/git-byte-proof.json` 核精确提交的新增归档 gzip/解压原字节、3246 份旧归档无增量、七份历史 Git blob 与两份批准全文、完整反馈转录及两处受测源码。旧 API/Worker/契约/部署没有增量；`checked-source-binding.json` 对历史集成的前后/当前逐文件比较保留 Web 与部署脚本早期差异，不冒旧浏览器通过为当前源码通过。批准计划、旧恢复报告/原始回执均不改写，当前原六项、九类及十七项修补映射在 `execution-map.json` 与 A2 coverage 中。无迁移、API 或事件变化。

完整材料提交 `7c732560d2ea1b14ba105e286f42a316eb655ee4` 后，实际 123 份新增归档 Git blob 及解压哈希一致，旧 3246 份归档未改；两处受测源码原字节与该提交 Git blob 完全一致。该提交的 `pnpm ci:validate` 退出 0，全 PR 空白及原始证据策略没有新豁免。十二项精确 label 只读检查为空，未进行额外删除；见 `context-read-generation/cleanup-readback.json`。精确远端 main 仍为 `74f247f9240eaf21e74ef248f71a445c1d4276d7`，本分支没有 workflow 记录，见 `context-read-generation/delivery-readback.json`。这个读回与 proof 记录的是捕获时提交，不伪填随后文档提交的自引用 ID；技术通过不代表人类视觉或最终门禁接受。

后续只新增这次政策日志的无损归档及读回材料，归档清单当前共 3370 份；不重跑未变产品。最终提交后的无写入核验入口为 `node docs/reviews/a2/seal-context-read-generation.mjs a2-71164f40 --check-only`，会按当时 HEAD 逐项核新归档、历史及源码，而不再次为自引用改写 proof。批准正文、旧证明与第一批原件不变。
