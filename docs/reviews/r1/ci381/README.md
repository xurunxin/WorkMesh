# CI381 浏览器第二分片失败诊断

原 PR203 head：`65f0aef5da465bdbfe9a80730e417a3bc14ee24c`；实际 main：`5743f027ec86e8726d2cfdd38e0e038bdebeae49`。本文件是生产者诊断与测试修订交接，不是最新 head 的 CI 成功或独审证明。既有 R1 规格独审结论、原始规划、G1 历史证明及 #6 来源缺口保持原记录。

## 原失败与输入核验

[CI381 / attempt 1](https://github.com/xurunxin/WorkMesh/actions/runs/37687579146) 为 completed/failure。第二分片 job `113019330631` 的 step 10 失败；Required CI job `113023303463` 因聚合失败。其余 source、API、DB、worker、recovery、agent 和浏览器第一分片成功，不能替代整个 Required CI。

平台 `workflow_runs` 的 run 与长 job 返回都只含上传/清理尾部，没有失败用例。随后通过本机已登录的 `gh api` 只读读取完整 job log，并下载两项原始 artifact；未导出凭证、未调用 git 远端写操作，也未要求用户重新提供状态。两项 ZIP 下载字节 SHA-256 均与 GitHub artifact metadata 的 digest 和 job 上传记录一致：

| 原始 artifact | ID | 字节 | SHA-256 |
| --- | --- | --- | --- |
| e2e-playwright-shard-2-37687579146-1 | 11511514752 | 11299823 | ac4971b21fde6867329039919ce17c27ecff3c5a5f43aaa8c165f1d6bfbb4809 |
| e2e-raw-shard-2-37687579146-1 | 11512208027 | 112716 | d2dd58da103dba221e4ba13222310c269b134c98ab7254f852acac915fadd8df |

实际 checkout 是 PR 测试合并提交 `bbc6b10d9b58e6ce24d877845a9003b5c7424eee`，parents 为上述 main/head；通过平台 git 读取，merge 与 head tree diff 为空。`source-hashes.json` 保存工作流、锁文件、根 Playwright 配置、测试与路由源文件的实际 Git blob 和 LF 字节哈希。未把 head 与 Actions 的测试合并 SHA 混称为同一个提交。

HTML 报告内嵌 ZIP 的 `report.json` 已实际解析，见 `report-summary.json`：32 个用例，31 expected、1 unexpected、0 flaky、0 skipped。失败是 `project-editor.spec.ts:54` 的 `locator.click`：等待 `.work-item-detail-sheet` 的 Details 页签超过原测试总超时 90000ms；不是 Chromium 安装、服务初始化或 Redis 启动失败。

## 证据与分类

`trace-timeline.json` 从实际 trace 提取下列单调时钟事件；原 trace 的哈希也在其中：

| 事件 | 时间 ms | 实际事实 |
| --- | --- | --- |
| View Work 点击 | 106166.004–106279.296 | 页面先渲染 Work 列表 |
| `tab=list` RSC 请求 | 106255.123，耗时 74.010 | HTTP 200；响应完成不等于客户端已应用路由 |
| 标题点击前 snapshot | before@call@330 | URL 仍不含 `tab=list` |
| 标题点击 | 106357.628–106437.767 | 命中 `wm-work-item-title`，click action done |
| Issue 详情 GET | 106421.500，耗时 12.295 | HTTP 200，不是详情 403/404 |
| 标题点击后 snapshot | after@call@330 | URL 变成 `tab=list`，未出现详情面板 |
| Details 点击 | 106449.979 开始 | 一直等待不存在的详情页签至超时 |

代码边界：`apps/web/app/project-control-center.tsx:193` 的 `navigateSurface('work')` 先设置本地 surface 再调用 `onWorkViewChange`；`apps/web/app/page.tsx:380` 的 `selectProjectTab` 先设置 tab，再异步 `router.push`；`:337` 的 `openItem` 获取详情并用 `detailRequestEpochRef` 检查请求是否仍有效；`:517` 的路由恢复在 `routeChanged` 时递增 epoch 并清空选择。测试原本只等待标题可见，未等待该导航的 URL 应用。

分类为**已定位的导航时序问题，测试缺少前一步导航完成断言**。CI trace 与上述 epoch 清理机制吻合；本地受控延迟也暴露了同类导航/选择交错，但失败落在后续再次打开 Issue，不能冒称精确复现了 CI 的 line 54 或证明所有产品竞态已消除。快速真实点击期间的选择失效仍是产品风险，需另行定向核验；本轮不据此改产品路由或扩展产品功能。Redis overcommit、Action Node runtime 弃用及颜色环境警告没有建立与失败的因果关系，不作为根因。

## 最小修订与复验

仅在 `apps/web/e2e/project-editor.spec.ts` 增加导航断言：

```ts
const selectedProjectId = new URL(page.url()).searchParams.get('project')
await page.getByTestId('project-control-view-work').click()
await expect(page).toHaveURL(url => url.searchParams.get('view') === 'projects'
  && url.searchParams.get('project') === selectedProjectId && url.searchParams.get('tab') === 'list')
```

它把原场景的“打开 Work 列表后再打开 Issue”变成明确验收条件；仍要求当前 Project 不变。原详情、milestone 保存、重复提交、关系、完整页面、Markdown 重载和 revision 冲突断言全部保留；未改 timeout、retry、testMatch、workers、CI 聚合或产品源代码。`verify-specs.mjs` 对这个测试与精确已审 head 的差异作完整字符串校验，只允许上述新增段落，不放开通用 apps 修改豁免。

诊断使用独立 PostgreSQL/Redis/RustFS 与原 package script；随机测试秘密在捕获时移除。测试源码中的临时 RSC 延迟只用于对照，最终测试不含路由拦截、固定 sleep 或诊断开关。具体步骤、命令、时间、源码哈希和结果见 `diagnostic-checks.json`；已运行的检查不冒作未来自动提交的版本。

- `control/`：首个诊断命令在 Windows 引号传递后成为错误的 grep 参数，退出 1、No tests found；不是产品失败，保留失败日志。改用无空格的测试文件参数，没有放宽测试集合。
- `control2/`：旧测试加 1000ms RSC 响应延迟，1 passed / 1 failed，失败位置为后续再次打开 Issue；原临时改动完整保存在 `control-instrumentation.txt`，不冒作 CI 原源码。
- `fixed-control/`：仅增加导航断言后采用同样延迟，完整 Project 场景和 bootstrap 2/2 通过。它证明这一导航前置在受控交错下有效，不证明未知的所有产品问题已修复。
- 标准第二分片及本轮静态/类型检查的实际最终结果以 `diagnostic-checks.json` 为准，不在运行结束前填成功。

## 原证据保留与交接门禁

`job.redacted.log` 是完整 job 的脱敏可读副本；`e2e.redacted.log` 是失败步骤的脱敏原输出；`raw.redacted.zip` 保留原日志成员结构，逐成员原始/派生 SHA-256 在 `evidence-index.json` 中。`trace.redacted.zip` 可用 `pnpm exec playwright show-trace` 读取；`error-context.md` 和 `ci-failure.png` 保留失败页面。报告附件路径原样保留在解析摘要中，但其原 video/report 仍以 GitHub artifact 为原来源，不假称本目录含这些文件。

可读日志/上下文只规范行尾及 EOF 空白；规范前的脱敏字节存于 `readable-source.redacted.zip`，逐项规范前后哈希见索引的 `displayNormalization`。CI 原日志成员的脱敏版本仍在 `raw.redacted.zip`，不以可读副本的哈希冒称原输出字节。

原 Playwright ZIP 含测试会话 Cookie，job log 含派生测试密钥，因此原 ZIP 只在临时目录读取，不把凭证提交进仓库。受控 trace 删除 storageState 并脱敏 Cookie/Set-Cookie/Authorization，原有资源关联、请求状态、时间与页面快照保留；脱敏派生件不是原字节归档。原始 artifact ID、下载字节哈希和派生件哈希分开记录，未删旧失败记录或旧 R1 原始归档。

测试新增断言及诊断校验器须由 Chief 安排另一 agent 定向独审，重点判断它是否正确表达顺序场景及是否应补独立的快速交互产品回归用例；产品竞态候选不能默认为闭合。新增断言通过不等于 CI381 改成成功；该 run 保持失败。平台本回合产生新 head 后，必须取得最新 head 的完整 Required CI 成功及必要独审，Chief 才可按批准流程合入。当前不合入、不同步 Todos、不放行 B/A/C/D 或 F 产品实现。

若后续决定处理快速交互问题，可审方向是在既有路由/详情 request epoch 机制内记录导航与用户打开详情的先后关系，避免旧导航清掉较新的同 Project 选择，同时继续让实际 Team/Project/权限切换失效旧请求；不能简单删掉 `routeChanged` 清理或跨授权保留详情。该方向尚未实现或验证，需独立用例覆盖慢 RSC/慢详情、后退、切换 Project/Team、撤权与不再可读目标，不能把本轮测试同步修订冒作该产品修复。
