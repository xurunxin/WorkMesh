# 正式成果审查逐项答复

三项针对原候选 `603f5001513872d4e973566d6a4c07ec4e7b179b` 的实施修复。原审、原捕获、原运行和旧失败继续保留；本文不宣告 M4 验收或合入。

## 受控证据的 CRLF

`execution/.gitattributes` 的更新文本为：

```gitattributes
** -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol
```

该属性只作用于本受控目录，原 `source-objects`、`evidence-objects`、stdout/stderr 的 binary diff 规则仍保留。没有全仓放宽 `core.whitespace`，没有转换证据原件。`scripts/ci-policy.test.mjs` 在独有 Git 夹具实际验证 CRLF 原件入 index 不变、CRLF 正例通过、真实行尾空格/空文件尾/空格加 tab 拒绝，以及目录外 CRLF 仍按原规则拒绝。`review-ci-policy` 为 17/17、零 skip，实际退出 0。完整主线到当前工作树 `git diff --check` 已退出 0；提交字节与新 HEAD 的检查另见本轮交付核验。

## 原注册运行字节和 Git 源码分列

`scripts/generate-agent-discovery.py` 原逐项直接比较当前 checkout raw 的代码已移除，当前位置为：

```python
capture = verify_registration_sources(root, m4['registrationEvidence'], m4['registrationSourceBinding'])
if capture.get('kind') != 'actual_registerTool_registerResource':
    raise ValueError('M4要求真实公共注册捕获')
```

`scripts/agent_discovery_source_binding.py` 先验证完整原 capture 字节、原运行 CAS 原件、完整 Git 源码原件及 blob ID，随后只允许换行转换：

```python
if b'\r\n' in git_source or runtime.replace(b'\r\n', b'\n') != git_source:
    raise ValueError('M4运行与Git源码不等价：' + evidence['path'])
checkout = (root / evidence['path']).read_bytes()
if checkout.replace(b'\r\n', b'\n') != git_source:
    raise ValueError('M4注册捕获源码已变：' + evidence['path'])
```

新的 `registration-source-bindings.json` 绑定原 capture 完整 SHA-256 与准确原候选 Git commit，每个源码记录运行 bytes/SHA/CAS 和 Git bytes/SHA/blob/CAS。四项原捕获字段和原文件保持不变；不把 82,111 运行字节改为 81,666 提交字节。`review-discovery-portability-retry` 实跑完整生成器：LF 与 CRLF 两项通过，每项重复生成零差异且完整生成表与原基线一致；实现变化、空格变化、缺注册、未知操作、改写旧 binding、修改运行原件六项都退出非零且零部分写入。`review-product-regeneration` 再实际生成 discovery/route-policy/Runner 两轮，五产物完整字节与 Git diff 均零差异，四批历史输入保持原指纹。原 138 bindings、137 映射和三项 health/completion 身份变体未改。

新生成器回归接入 `.github/workflows/ci.yml` 原生成验证步骤，带 `pipefail` 和原证据上传。没有将本机回归当作 Ubuntu CI 运行结果。

## 必需本机 native 入口和 Required CI 分离

原 conformance 文件被引用的 native `it` 和 `M5_CLIENT_EXECUTABLE` 强制行已经移到 `optional-domains.acceptance.ts`；原位置现在由真实 Pi 的结尾直接接持久 cursor/Stop 用例：

```typescript
saveOptionalEvidence('pi-model-received.json',{captures,exactOriginSession:origin.sessionId,foreignTargetDenied:true,workbenchProjectlessLoopUnsupported:true})
})

it('API重启从A2A独立cursor恢复，Stop后旧E不能读run或写usage',async()=>{
```

本机必需入口为根 `test:acceptance:m4` → `@workmesh/conformance acceptance:optional` → `tsx src/optional-domains.acceptance.ts`。它在建夹具之前明确检查：

```typescript
if (!process.env.M5_CLIENT_EXECUTABLE || !process.env.M5_EVIDENCE_ROOT) {
  throw new Error('M4_NATIVE_CLIENT_AND_PRIVATE_EVIDENCE_REQUIRED')
}
```

两个入口复用 `optional-domains.consumer.fixture.ts` 的 Human 准备及原权限内准确 origin/target E；目标仍走原 installation refresh→ACK→executing，不授 origin 目标读取权。native 独立准备本人已知/unknown usage，断言完整 pin 正文、run/准确 Session、十进制大金额与多币种 unknown、非空 A2A 有界页；每个 native 客户端和夹具均在 finally 关闭。本机验收必须同时跑 Required integration 与 native 入口。生产构建排除两个夹具/验收文件，lint/typecheck 仍消费它们。

Required API 的六域套件保留 12 项真实 REST/SDK/HTTP MCP/Pi、九类适用场景及不适用理由；无 native skip。`review-native-missing-client` 实际清除两个 M5 变量，准确本机入口退出 1 且命中明确 guard，负例包装检查退出 0。`scripts/ci-policy.mjs` 与语义删除测试防止丢失本机入口或把 native 接入未准备客户端的 Required API；生产构建直接实跑退出 0。

## 实际运行与交接状态

本轮完整检查索引、source before/after、退出/runtime、首败及资源回执在本目录 `review-*` 和 `checks/review-*/`，结果以完整原件为准。原 `review-discovery-portability` 在准备指纹时因并发 CAS 保存互读未完成文件而中断，产品命令未开始、无产品输出；保留于 `review-evidence-preparation.json`，完整原件后来全部 SHA 核验，顺序新 label 重跑另列。原 `review-ci-conformance-without-native` 因原动态端口在容器重启后变化而连接拒绝，退出 1 保留；`review-port-recovery.json` 记录独有容器实际端口，仅恢复本卡私有环境。根单元首轮两项旧 Web 失败、第二轮一项旧 OpenAPI YAML 解析超时均保留，不改 UI 或放宽断言。核对本机实际安装 Vitest 的默认 `pool: "forks"` 与 forks 使用 `maxWorkers` 的实现，原根配置只有 threads 的上限，对默认 forks 没有生效。`vitest.config.ts` 添加 `minWorkers: 1, maxWorkers: 4`，让原四 worker 预算同时约束默认 pool；这是必需检查的运行准备修复，不改变断言或产品范围。新根单元退出 0，32 task、零 cache，Web 789/789；不把两次失败改写通过。

当前 lint/typecheck 各 18 task、零 cache 退出 0；CI policy 17/17、archive 回归 15/15、源码绑定两种 checkout 正例及六拒例、产品两轮生成、直接 conformance build 均退出 0。`review-ci-conformance-recovered` 实际删除两个 native 配置变量后，六套件 96/96、零 skip，M4 为 12/12。该长命令广义指纹检测到过程中仅 `vitest.config.ts` 改动，原 `sourceChangedDuringCommand=true` 不改写；它用显式 `vitest.integration.config.ts`（单 fork）而非根 unit 配置，四项后端及 MCP/SDK/Runner 消费源码均不变。之后 `review-optional-stable-final` 在稳定最终源码上重新跑 M4 12/12，前后指纹完全相同。`review-native-local-entry` 按准确新入口实跑 native origin/target，退出 0、前后源码不变；两个新 native 资源回执已闭合，Ubuntu native 仍未运行。最新候选 Required CI 以该候选 GitHub 运行状态为准，提交前不能记通过。没有新的迁移/API/事件/授权范围；三个修复不改变四项后端授权合同。

M5 恢复、旧只读对象、G1/D0/C3 拒目标及父目录仍保护；只复用本卡三个已登记独有容器，当前恢复输入、卷和镜像保留。新 `cleanup-review.json` 绑定本轮五个必需检查的实际退出，确认 17 项 native 资源回执的归属进程退出、监听关闭与用户配置不变；三容器均已停止，数据库客户端为空。原 `cleanup-current.json` 不覆盖，原清理默认规则保持原语义。无 global prune、递归删除或属性/ACL 变更。仍待 Chief 对完整实际候选正式复审及最新 PR Required CI 全绿；未合入、未 Done。

## 本轮准确命令索引

| 原件 | 实际退出 | 秒 | 广义源码变化 |
| --- | --- | --- | --- |
| [review-ci-conformance-recovered](checks/review-ci-conformance-recovered/receipt.json) | 0 | 937.69 | true |
| [review-ci-conformance-without-native](checks/review-ci-conformance-without-native/receipt.json) | 1 | 6.30 | false |
| [review-ci-policy](checks/review-ci-policy/receipt.json) | 0 | 7.04 | false |
| [review-ci-validate](checks/review-ci-validate/receipt.json) | 0 | 6.22 | false |
| [review-conformance-clean-build](checks/review-conformance-clean-build/receipt.json) | 0 | 7.49 | false |
| [review-discovery-portability-retry](checks/review-discovery-portability-retry/receipt.json) | 0 | 5.60 | false |
| [review-native-local-entry](checks/review-native-local-entry/receipt.json) | 0 | 62.14 | false |
| [review-native-missing-client](checks/review-native-missing-client/receipt.json) | 0 | 7.19 | false |
| [review-optional-stable-final](checks/review-optional-stable-final/receipt.json) | 0 | 23.01 | false |
| [review-original-ci-log](checks/review-original-ci-log/receipt.json) | 0 | 8.49 | false |
| [review-owned-resource-cleanup](checks/review-owned-resource-cleanup/receipt.json) | 0 | 7.11 | false |
| [review-product-regeneration](checks/review-product-regeneration/receipt.json) | 0 | 10.41 | false |
| [review-root-lint](checks/review-root-lint/receipt.json) | 0 | 60.20 | false |
| [review-root-typecheck](checks/review-root-typecheck/receipt.json) | 0 | 57.34 | false |
| [review-root-unit](checks/review-root-unit/receipt.json) | 1 | 163.29 | false |
| [review-root-unit-bounded-pool](checks/review-root-unit-bounded-pool/receipt.json) | 0 | 233.22 | false |
| [review-root-unit-retry](checks/review-root-unit-retry/receipt.json) | 1 | 28.73 | false |

完整输入/输出及数量行见 [本轮结构化索引](review-checks.json)。`review-native-missing-client` 的产品入口原退出 1 保留在 stdout，包装器退出 0 只表示明确拒例断言成功。旧阶段结果不覆盖，M4 原后端屏障/API、Worker 与 E2E 本轮未重新运行，不声明新 HEAD 已测；源码未变的旧结果继续绑定旧准确候选，最新 PR CI 会实际执行它们。无新迁移/API/事件。未支持项仍是其他 OS native、真实 provider/外发及发布。

交付最终核验还包括 `review-full-staged-diff`：主线完整差异（包含原受控 CRLF 原件）的 `git diff --cached --check c2b3d363c037157df13beb82799d99d07a9b7db8` 实际退出 0；随后新原件暂存也按完整字节复核。当前 104 份完整回执、208 份输出和 1059 项唯一受测源码引用均全文核验，原 66 条旧运行字节缺失继续如实保留，私有凭据发现为零。20 项旧 M3 同名输出先完整 CAS 保全，再恢复不可变原候选字节，见 `review-history-preservation.json`，未覆盖历史报告冒新通过。

资源最新盘点逻辑长度 3,957,679,652 字节，按文件身份去重长度 556,606,372 字节；物理释放未知，不把停止容器或硬链接的逻辑长度当释放。原生二进制/构建树未重复归档，三个独有容器停止，所有恢复树、卷、镜像和拒目标保护不变。
