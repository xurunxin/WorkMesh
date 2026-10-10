# 检查方案与实际结果

## 本轮规划检查

原规划实际命令/nativeexit/runtime在[planning-checks.json](planning-checks.json)等旧回执，保持原时点。本轮同步只执行原candidate保全、注入全文与截断前缀/编辑对齐、main完整来源再核、B1/B2/B3矩阵/合同/链接/UTF-8/空白/CI分类/暂存及commit byte核验，实际命令/raw stdout/stderr/runtime另存review-checks.json及相关ZIP，不覆盖旧结果。没有产品测试或本任务数据库/服务。

```text
python docs/plan/agent-mcp-m5/capture-review-base.py
python docs/plan/agent-mcp-m5/sync-current-plan.py
python docs/plan/agent-mcp-m5/build-operation-matrix.py
python docs/plan/agent-mcp-m5/verify-planning.py
python docs/plan/agent-mcp-m5/record-review-checks.py pre
git diff --cached --check
```

因本目录有JSON／Python／ZIP，不能假定纯prose docs CI；实际classifyChanges结果另外保存，不改属性或门禁来获得绿色。本轮不运行未来pnpm产品验收、不安装依赖。规划candidate需另一Agent独审，远端PR／CI未取得时如实未取得。

首轮实际静态检查见planning-checks.json，末次全文／来源／矩阵／暂存核验见planning-final-static.json，候选commit与运行byte对应见planning-commit-verification.json。各回执明确自身生成时点与排除边界，最终head由聊天和只读Git实报，不为自引用循环补写head。两次成功不抹首败；这些回执不表示产品验收、远端CI或实际Done已通过。

本轮review-base归档证明完整原47个Git文件，review-static-verification输出当前再核源与结构；review-checks保存pre阶段，review-commit-verification保存提交后逐blob核验。自身回执生成与排除边界分列，最终head只实报，不循环自引用。API/MCP/Runner/client重启、三项blocking正式关闭、最新PR RequiredCI均未运行/未取得；CI分类full只是选检查，不等于已执行。

## confirm后准备与必需本机检查

先核当时实际main与新增差异，再保全新的受测源；按照本方案准备独有test DB／Redis／store／fake provider／模型／API／MCP／Worker／Runner。工作树依赖按锁文件正常恢复，原生OpenCode使用已盘点文件，不安装新厂商客户端或新增账号授权。命令必须通过既有require-integration-env及test-db-reset；设置RUN_INTEGRATION=1和准确ownedtest URLs，秘密由本地随机测试材料／团队Secrets供给，不聊天取值。

```text
pnpm.cmd --filter @workmesh/agent-runner test src/runner-api.test.ts src/workmesh-tools.test.ts src/execution-lifecycle.test.ts
pnpm.cmd check:route-policy
pnpm.cmd check:workmesh-skill
pnpm.cmd check:runner-skill
pnpm.cmd ci:test
pnpm.cmd ci:validate
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:integration
pnpm.cmd test:e2e
pnpm.cmd smoke:agents
pnpm.cmd --filter @workmesh/conformance build
pnpm.cmd ci:source build
pnpm.cmd --filter @workmesh/conformance acceptance:joint
```

最后一命令是confirm后新增脚本，本轮不存在／未运行；通过M5_CLIENT_EXECUTABLE／M5_EVIDENCE_ROOT传入已登记原生runtime和本任务证据目录，参数中无秘密。core integration由test:integration自动包含新套件，实际OpenCode独立acceptance不得skip替代。正式跑前核Node实际process.version/execPath及pnpm入口，不把旧M3 Node环境自动借给本轮；Windows无npm_execpath的pnpm包装问题按真实可执行入口仅对测试子进程设置，不改系统环境。E2E的development监听、绝对API地址与单元测试环境分离。

实施首步先落ADR并补受限Runner修复，定向unit验证cause白名单/冻结body/E/headers/截止/取消/GET与Activity/二次拒绝unreconciled/不触provider和settle；真实conformance及acceptance再跑三项Pi单toolCall首commit失响应→第二原HTTP，业务effect/活动分账，API实际重启保持原Attempt/预算，OpenCode MCP重启另记。B/S Plan两合法E、唯一Pi running Attempt后同revision读取、双顺序冲突/明确合并与crossSession F2分列；B承接Handoff完成与旧A拒绝、独立parent-active child完成实证。原47/43数量不成为新分母；这些未来用例全未运行。

## 结果与退出判据

所有未来命令当前未运行。报告准确分母：实际OpenCode各链／Pi各链／协议对照／Human准备／DB故障夹具各自数量，未运行、过滤skip、环境skip、cache分列，exit0不把skip称passed。sourcebefore/after不同必须补最终bytes真实运行，不借历史绿。

适用必需检查通过后交独立成果审查，blocking／high闭合；当前产品head最新PR RequiredCI全success后，按授权的Done／merge流程核GitHubPR状态与actualmain/tree，再验收。旧M3 CI419只证明前置，不代M5；当前规划静态核验和未来产品验收不得共用“全部通过”结论。
