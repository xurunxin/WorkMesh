# 本轮规划核验与交付

状态：本轮修订三个独审blocking，只交规划工件，停confirm供_oY重新审查；不自行宣布闭合。产品未实现，M3产品测试/成果审查未运行，本轮未取新候选Required CI或实际Done/main。

## 来源与首败

真实main仍为ef4cb5e1458d911d98433c443dba46e6c224caa0，本轮收尾平台ls-remote原返回见input/review-main-readback.json；原370项/743成员来源保持不变，冻结七全文和M3九类/DoD完整承接。被审原候选7e7805b1a672878a5644a1e139dfa2ec6520a565的74文件原Git字节另保于history；未改产品、未改旧报告冒新通过。

原平台doc独立全文未取得；原用户注入saved copy完整保全，新工具读回仍截断。上轮四个、本轮三个edit_plan替换精确重建savedplan/implementation，Proposed ADR/DTO/policy/矩阵/S2/S4/S7/S8/S9同步；限制见sources.md，未伪造后端原件hash。

只读探索首败exit1来自读取不存在的M2 capture-sources.py，见input/exploration-first-failure.json。整包静态首败exit1因README链接planning-report.md尚未生成，见input/static-first-failure.json；首败不改写为通过。早期通用Node依赖探针返回MODULE_NOT_FOUND，聚合shell最终exit0，未捕获该子进程独立exit；随后用隔离三依赖安装复核，不编造原子退出码。

首败脚本旧字节按精确已知变更反向重建，标明不是首败时实读；首败其余工作树未逐项保全的缺口保留。后续每条静态回执保stdout/stderr原字节ZIP、准确argv/runtime与受测前后指纹，失败同样归档。

记录器另有真实exit1：打印ci-policy摘要遇GBK无法编码符号；contract与ci-policy原输出/回执此前已落盘且子进程exit0。修正记录器stdout/stderr为UTF-8后仅继续未运行三命令，完整进度与缺口见input/check-recorder-first-failure.json；不将聚合首败记成通过。

本轮首轮源码定位含Windows glob/不存在文件错误，长封包未完整保全，未取得的exit/chunk标null；ADR路径探针非终止错误后聚合exit0不代表该读取通过。首次规划patch因同文件多操作校验失败而未应用，随后合并文件hunks成功；见input/reviewer-first-failures.json，不改写首败或猜callID。

## 实际静态核验

| 核验 | 实际退出 | 原回执 |
| --- | --- | --- |
| ci-policy | 0 | [checks/ci-policy-1.json](checks/ci-policy-1.json) |
| ci-selection | 0 | [checks/ci-selection-1.json](checks/ci-selection-1.json) |
| ci-selection | 0 | [checks/ci-selection-2.json](checks/ci-selection-2.json) |
| ci-validate | 0 | [checks/ci-validate-1.json](checks/ci-validate-1.json) |
| contract | 0 | [checks/contract-1.json](checks/contract-1.json) |
| contract | 0 | [checks/contract-2.json](checks/contract-2.json) |
| static | 0 | [checks/static-1.json](checks/static-1.json) |
| static | 0 | [checks/static-2.json](checks/static-2.json) |
| static | 0 | [checks/static-3.json](checks/static-3.json) |
| static | 0 | [checks/static-4.json](checks/static-4.json) |
| static | 0 | [checks/static-5.json](checks/static-5.json) |

contract核验仅测试提案Zod六kind/五status、合法及非法样本和OpenAPI结构一致；CI policy/validate仅测试既有分类门禁。ci-selection核实际规划文件触发full，未放宽CI。static核Git/blob/工作树原字节、原九类/DoD、平台来源、精确计划替换、UTF-8/空白/本地链接及产品零修改。完整数量/skip从回执原输出读取，exit0不代数量。

最新contract合法样本72、拒绝样本98，六kind/五status/schemaParity通过（仅提案）；上轮54/92原回执保留。未重跑未改动的既有CI16 tests/pass16/fail0/skipped0和validator，原源码精确绑定不借作新产品通过。本轮实际静态Node为v24.20.0；validator中的Node22.19.0是配置目标，产品运行前按仓库锁定版本核验。

全部pnpm lint/typecheck/test/test:integration/test:e2e、route-policy/skill gates以及Native/MCP/Pi产品链均未运行，具体执行与N/A见verification.md。真实provider、artifact store、三OS与新组合未测，不借旧UI或M2绿色代M3通过。

辅助输出探针另一次exit1也是GBK打印TAP失败，未进入ZIP检查；见input/output-probe-failure.json。后续static实际核原输出ZIP及逐受测输入，不能把该探针当通过。

## 工件与收尾

artifact-manifest.json逐文件绑定最终正文与证据原字节；checks ZIP另保存该次实际受测字节。报告/回执/资源/manifest为收尾元数据，不为自身head循环改正文。候选commit的准确head在提交后会话交付，commit blob与暂存字节另核，不把主线来源SHA冒候选head。

资源归属、准备/恢复/清理实际回执见resources.json；无容器、服务、真实外发。通过该工件README预览审阅，独审blocking/high闭合并Chief confirm之后再实现产品。
