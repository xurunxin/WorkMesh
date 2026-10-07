# CI 与测试执行效率调整

## 依据与范围

用户要求分析现有 CI、避免文档变更触发全量检查，并精简非必要测试执行。
以 CONTEXT、AGENT_PROTOCOL、OPENAPI、SCHEMA、现行 ADR 和 AGENTS 为约束。
不改变业务不变量、API、事件、数据库、发布权限或测试行为断言；本轮不新增 ADR。
本地工作区开始时为干净状态，G: 是 S: 主检出的兼容 junction。

## 现状证据

GitHub CI run [37646368741](https://github.com/xurunxin/WorkMesh/actions/runs/37646368741)
是文档 PR：2026-10-07 15:44:16–16:01:06 UTC，约 16 分 50 秒。
source-gates 约 7 分 24 秒，随后 Browser acceptance 约 9 分 6 秒。
Lint 80 秒、Typecheck 69 秒，18 个包的两项脚本均为 `tsc --noEmit`。
显式 contracts 单测后全量单测重复执行 contracts；smoke:agents 再执行 SDK 单测。
theme-unification 在 bootstrap 和 authenticated 两个 Playwright project 中重复收集。
后续文档 main push run 37648883439 因 Browser acceptance 失败，进一步说明无关
验收会将文档修改与浏览器测试波动绑定。新方案的线上耗时尚未实测。

## T1 — 变更分类与合并门禁

实现内置 Node 分类器，读取 PR merge-base/head 和 main before/after 完整范围，
处理删除与重命名两侧路径。已知 prose 只运行轻量分类测试与实际范围 whitespace
检查。保留被契约测试读取的 Markdown 例外，运行时 Skill 和未知路径不可跳过。
代码 PR 计算当前 workspace 反向依赖闭包；main 代码、手动、每周、merge queue
及发布复用全量执行。缺失历史/元数据回退全量。
Required CI 固定名称保留，只接受分类器明确计划的 skipped，其他未成功均失败。

测试：prose/混合变更、UI、上游包、跨包 fixture、未知/删除路径、重命名、PR/main
比较范围、缺失历史、发布复用、whitespace 拒绝、failure/cancelled/意外 skipped。
DoD：任何不确定性不得让必需检查消失，发布候选仍全量验证。
blocks: T2。

## T2 — 执行图与冗余检查

七个重型 job 只依赖分类，不再等全部 build/unit 完成。源码任务按包选择，并为
typecheck/build 加依赖。相同 lint/typecheck 只执行一次，未来独立 lint 自动保留。
移除 contracts/SDK 重复入口，CI smoke 保留构造和协议验收。
主题测试只在 authenticated 执行一次，确保受保护页面确实打开，而不是只检查匿名
重定向后的登录页；完整 E2E、权限/事务/Stop/重放/恢复断言保留。

测试：实际 Turbo 任务选择、pnpm ci:validate、完整源码检查与测试、Playwright
收集验证。DoD：精简的是重复与无关执行，不通过减少业务断言制造通过结果。
blocks: T3。

## T3 — 验证与记录

运行 AGENTS 规定的 lint、typecheck、test、test:integration、test:e2e。
使用本轮专有测试数据库和容器，不复用或清空其他工作的测试/开发数据库。
失败按产品、环境或基础设施原因如实记录；未在 GitHub 执行的新流水线不宣称
线上验收完成。完成报告记录修改文件、检查结果、演示命令及已知限制。

DoD：分类/聚合回归测试与策略验证通过，有实际任务范围证据，必需检查结果完整。

## 控制面同步限制

本会话的可调用工具无 WorkMesh MCP，PATH 无 WorkMesh CLI，当前 Codex 配置未找到
WorkMesh MCP 连接。Project、T1–T3 WorkItem、blocks 和 append_activity 均未创建。
此处保留全部待镜像正文；不能将本地记录称为已完成双轨同步。恢复可用连接后
应以本文件为 source of truth 创建同内容 Project/WorkItems，再读回核验。

## 推送前本地验证结果

- `pnpm ci:test`：11/11，通过。
- `pnpm ci:validate`：9 jobs、35 固定 SHA action references；CI、发布和 Lite 验证通过。
- `pnpm lint`、`pnpm typecheck`、`pnpm ci:source typecheck`：18/18，通过（包含本地 Turbo 缓存）。
- `pnpm test`：18 个包合计 1,655 单测通过；29/29 Turbo 任务通过，其中 28 个命中本地缓存。
- `pnpm ci:source build`：原工作区跨盘虚拟 store 导致 Next 模块解析失败；同 HEAD
  加本轮修改的 NTFS 独立副本，使用 frozen lockfile 安装后 18/18 全新构建通过。
  原工作区 `.npmrc` 和依赖目录未修改。验证主机 Node 为 24.20.0，CI 仍固定 22.19.0。
- 集成：DB 77/77；API 154 passed + 1 existing skipped；Worker 78 passed + 1 existing
  skipped；Recovery 1/1。总计 310 passed、2 skipped。最初临时 bootstrap fixture
  不符合 canonical base64url 校验，已修正后补跑 API/Worker/Recovery，各包均成功。
  skipped 分别位于 workbench-runner 与 retention-upgrade-barrier 原有条件，未改动。
- `smoke:agents:ci`：MCP construction 和 Fake Agent 签名/去重均通过。
- `test:conformance`：6/6 adapter/fixture runs 通过。
- Playwright 实际收集：原配置 74（theme 14、两个 project）；最终配置 67（theme 7、
  只在 authenticated）。`playwright-config-contract.test.ts` 2/2 通过，并锁定登录后验证。
- 独立副本完整 E2E 首轮 67/67 通过（4.6 分钟）；首轮主题仍在 bootstrap。
  后续将主题统一到 authenticated，最终配置补跑 Stage 0 依赖与七条主题检查
  8/8 通过（55 秒）。最终配置的收集与类型检查通过，未重跑其余未改动的浏览器用例。
- 本节记录推送前的本地证据，分支保护未修改；新版 GitHub Actions 的线上结果与耗时
  由后续 PR 检查和合并记录核验。
- 本轮三个独立验证容器及 NTFS 安装副本已删除，原有容器和依赖设置保留。
  本地证据位于 `.tmp/ci-efficiency-evidence/`，保留构建/集成/浏览器日志及报告，
  报告副本不含 `.auth` 登录状态目录。

## 演示与后续核验

`pnpm ci:test` 演示 docs/UI/upstream/unknown 路径以及意外 skipped/cancelled 的判定。
`CI_PACKAGES` 设为 `["@workmesh/ui","@workmesh/web"]` 后运行
`pnpm ci:source test --dry-run`，实际仅选择 contracts build、ui build、ui test、web test。
更新 README 的 PR 应只有 changes 与 Required CI 执行；UI PR 保留完整浏览器套件；
手动、每周、merge queue 和发布候选必须全部执行。推送后用这些场景验收实际运行图。
Markdown 发布/协议输入的例外见分类器显式清单。无迁移、无 API/事件变更；无业务
规范偏离。已授权的 CI 策略变化是允许明确计划的跳过，并取消源码检查的串行屏障。

## 修改文件

- `.github/workflows/ci.yml`：触发、分类 job、条件选择、并行依赖和聚合。
- `scripts/ci-policy.mjs`、`scripts/ci-policy.test.mjs`：分类、保守回退、聚合及回归场景。
- `scripts/run-ci-source.mjs`：按包执行与 lint/typecheck 去重，兼容 pnpm JS/独立可执行文件。
- `scripts/validate-ci.mjs`：保留原有安全约束并验证新的执行图。
- `package.json`：新增 ci:source、ci:test、smoke:agents:ci，保留原有完整检查入口。
- `playwright.config.ts`、`apps/web/e2e/playwright-config-contract.test.ts`：主题只在登录后
  执行及其配置回归。
- `docs/CI.md`、本计划：现状依据、新策略、实际验证、限制与后续线上核验步骤。
