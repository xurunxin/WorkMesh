# 检查方案与实际结果

## 本轮规划检查

只执行来源捕获、环境metadata、方案结构／合同映射／归档完整性／链接／UTF-8／空白／CI分类／commit byte核验。实际命令、原stdout/stderr、nativeexit/runtime及结果在[planning-checks.json](planning-checks.json)；首败见planning-first-failures，不把首败覆盖成重跑成功。本轮静态脚本不是产品测试，没有本任务数据库或服务。

```text
python docs/plan/agent-mcp-m5/capture-planning.py
python docs/plan/agent-mcp-m5/capture-runtime.py
python docs/plan/agent-mcp-m5/build-operation-matrix.py
python docs/plan/agent-mcp-m5/verify-planning.py
python docs/plan/agent-mcp-m5/record-planning-checks.py
git diff --cached --check
```

因本目录有JSON／Python／ZIP，不能假定纯prose docs CI；实际classifyChanges结果另外保存，不改属性或门禁来获得绿色。本轮不运行未来pnpm产品验收、不安装依赖。规划candidate需另一Agent独审，远端PR／CI未取得时如实未取得。

首轮实际静态检查见planning-checks.json，末次全文／来源／矩阵／暂存核验见planning-final-static.json，候选commit与运行byte对应见planning-commit-verification.json。各回执明确自身生成时点与排除边界，最终head由聊天和只读Git实报，不为自引用循环补写head。两次成功不抹首败；这些回执不表示产品验收、远端CI或实际Done已通过。

## confirm后准备与必需本机检查

先核当时实际main与新增差异，再保全新的受测源；按照本方案准备独有test DB／Redis／store／fake provider／模型／API／MCP／Worker／Runner。工作树依赖按锁文件正常恢复，原生OpenCode使用已盘点文件，不安装新厂商客户端或新增账号授权。命令必须通过既有require-integration-env及test-db-reset；设置RUN_INTEGRATION=1和准确ownedtest URLs，秘密由本地随机测试材料／团队Secrets供给，不聊天取值。

```text
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

## 结果与退出判据

所有未来命令当前未运行。报告准确分母：实际OpenCode各链／Pi各链／协议对照／Human准备／DB故障夹具各自数量，未运行、过滤skip、环境skip、cache分列，exit0不把skip称passed。sourcebefore/after不同必须补最终bytes真实运行，不借历史绿。

适用必需检查通过后交独立成果审查，blocking／high闭合；当前产品head最新PR RequiredCI全success后，按授权的Done／merge流程核GitHubPR状态与actualmain/tree，再验收。旧M3 CI419只证明前置，不代M5；当前规划静态核验和未来产品验收不得共用“全部通过”结论。
