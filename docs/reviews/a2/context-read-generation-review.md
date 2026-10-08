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

首次探针六项失败源于测试按钮名误写，单独保留 `first-failure.log.gz`，不作为产品反例。纠正按钮名后在未修改的输入产品上执行，三入口都没有 AbortSignal，六项失败，见 `baseline-failure.log.gz`。修补后新六项加原二十二项全部通过，见 `targeted.log.gz`。当前全检查与新镜像安装结果在完成后更新；没有提前把旧镜像成功算成本轮安装成功。

## 验收与交付

原六项、九类适用性及 DoD 不删除。当前检查过程使用独有服务与原验收文件，受测前后源码、首败、真实退出与清理逐项保全。API/Worker/契约/部署没有增量，历史集成通过只绑定这些被证明未变的输入。本轮 UI 和新精确提交 Lite 须实际重验。

本轮不更新 D0 基线或阈值；五项人类视觉差异、真实设备/厂商、实施独审、最新 Required CI 及 actual main 仍是明确停点。C3 两次清理拒绝及历史审计、新旧目录保持只读；不清共享资源、当前工作树、不 global prune。最终逐项运行和清理证据在本报告结束前补齐，不预填未来提交 ID。

`a2-71164f40` 已结束，路由/lint/typecheck、根单元 29 task（Web 825 项）、关闭 Gitea A2 11 项通过/1 Lite 跳过、根完整浏览器 78 项通过/2 跳过、CI 策略及 Web build 全部退出 0。两处受测产品/测试文件运行前后完全相同；专用 PostgreSQL、Redis、RustFS 三容器均核归属后清理退出 0，认证状态及 trace 完成脱敏。原件见对应 run 的 receipts、source-before/after 与 sanitization；新精确提交镜像的 Lite 安装仍待执行。
