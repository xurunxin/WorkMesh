# M2 PR214／CI414 成功与最终候选门禁

[PR #214](https://github.com/xurunxin/WorkMesh/pull/214) 已实际创建，平台分支就是 GitHub head 分支，未创建或切换其他分支。本报告保全 CI414 的真实成功，不 merge／Done；两份验证文件的增量仍交 Chief 正式独立复核。此前产品报告、九类18行闭合、91操作边界和首败／unknown均保持原件。

## 准确候选与实际终态

[CI #414／run38027599886](https://github.com/xurunxin/WorkMesh/actions/runs/38027599886)，pull_request、attempt1，head `782652ccd753ff28aa1a6929bdbb8f812c73af87`，base `cfce77546b64c2a8d7d12949261c38e2f666d5ae`，最终 completed／success。健康命令和 job 均持续等待实际结束，未 cancel／interrupt／赌博重跑。

实际合成 checkout `1e2c109d662c5414b0df79806badf20d4b5749b9`，GitHub commit 原对象 parents 正是上述 base／head，tree `abc0de714a0e0b886a1ce3bc8bbab2d80e225561` 与候选 tree 相同。十个逐 job 原日志均实际含该 checkout；不能把这些证明称为远端逐文件运行前后实读。

| Job／实际ID | conclusion | runtime秒 |
| --- | --- | --- |
| Classify changes and validate CI selection／114141659403 | success | 27 |
| Database integration／114141741583 | success | 145 |
| Browser acceptance (1/2)／114141741593 | success | 357 |
| Agent construction and protocol smoke／114141741624 | success | 42 |
| Source gates／114141741627 | success | 265 |
| API integration／114141741633 | success | 611 |
| Worker integration／114141741657 | success | 159 |
| Complete disaster recovery／114141741667 | success | 335 |
| Browser acceptance (2/2)／114141741703 | success | 272 |
| Required CI／114143472524 | success | 27 |

秒数为实际 started_at→completed_at，包括安装、运行和上传。远端 step/job conclusion 与原日志为实际结果；日志未给 native 子进程 exit 时不伪补0。所有 gh 收集命令的 native exit/runtime/输出字节另有 ledger。

## 实际检查与首败恢复

DB81pass；API270pass／1原条件skip；真实M0/M1/M2 MCP／Pi conformance41pass、零skip。Worker120pass／2原条件skip（retention升级专用开关未启用、Redis专用环境未设置）；本机run136为121pass／1原条件skip，环境不同不能混写。浏览器两个实际分片38＋33pass，共71pass；没有把CI413预测试崩溃当已执行。灾备1pass及恢复后生产smoke成功。Source gates实际通过lint、typecheck、route policy、两个Skill pin、build、unit32tasks，以及CI策略检查／删除套件负例与ci:validate；完整逐包数量见原日志和[可读摘要](product-evidence/ci414-test-summary-readable.json)。原条件skip没有改动，未用两个conformance替代整卡范围。

CI413 原 Worker 首次授权前60ms夹具租期过期和 Playwright 拼接545,807,656字节Git diff崩溃，完整保留于[CI413首败报告](product-ci413-report.md)及其无损ZIP。本轮验证改动仅两处：

- `apps/worker/integration/stage1-lifecycle.integration.test.ts` 使用 `const batch = await worker.claimDeliveries()`；首次真实HTTP/HMAC成功后按原默认60s租期执行 `SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp())))+0.02)`。不改claim／source／授权事实，保24队尾零HTTP／pending、新Worker重领、原payload和旧claim CAS拒覆写断言；该用例timeout90s。
- `playwright.config.ts` 使用 `captureGitInfo: { commit: true, diff: false }`，只禁可选HTML元数据中的巨大diff。commit身份、trace／截图／视频、断言和Required CI源码门禁保持。

API／SDK／MCP／Runner／Worker运行时代码未改。原49绑定中48不变、Worker integration fixture变化，另加入Playwright配置形成50项准确绑定；不能称全部49不变或原正式独审已覆盖验证增量。两处验证修复及相应风险须正式增量复核。

## 原件、字节与最终门禁

[结果／完整PR与jobs／50来源绑定](product-ci414-results.json)、[原件索引](product-evidence/ci414-original-index.json)、[无损ZIP](product-evidence/ci414-originals.zip)保全连续查询、原PR/head/base、commit对象、全部run/step/jobs、日志ZIP、十个逐job日志、十二工件ZIP及50源码＋8CI输入Git／Windows全文字节。ZIP共329成员，逐成员CRC／bytes／SHA实际核验成功，816个runtime／嵌套成员秘密形状扫描无未知凭据。身份探测的Token行在保存前脱敏，未新登录／安装／获取秘密。

重复绑定时旧同名缓存输出已经由CI413原件保全，当前ledger的每个输出SHA逐条解析到CI414当前原字节或不可变CI413成员，不冒旧hash是新缓存。完整命令解析见ZIP `collection/command-original-resolution.json`；ANSI控制字符只从可读摘要去除，原日志字节不改。

run136／137源码前后实际相同、native0与本任务三容器逐ID清理native0见CI413报告；当前没有未结束本地测试服务。下载缓冲区在全部健康运行终态、必要原件保全之前保留，后续只按本任务精确路径处理，共享资源、当前恢复目录和G1D0C3拒目标不动。

本报告及原件提交为纯证据增量，会产生新head。新head须重新绑定50个产品／验证blob不变、准确base及合成checkout，并持续取得它自己的最新Required CI全部终态；本报告CI414成功不能冒后续运行。最终回review明确新head／最新run，后续run原件保留在实际Actions，不能把CI414 ZIP冒同一运行。无产品或base实质差异才能沿既有路线交Chief；本轮不直接合入或声明Done。
